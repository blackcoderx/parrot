import "server-only";

import { tool, jsonSchema, type ToolSet } from "ai";
import { resolveApiKey } from "./providers";
import type { AiPrefs } from "./settings";

// ---------------------------------------------------------------------------
// Web-search backends (portable tool, bring-your-own-key). Mirrors the model
// provider registry in lib/providers.ts: a registry of backends whose keys come
// from env vars or ~/.parrot/config.json — never the SQLite DB.
// ---------------------------------------------------------------------------

const MAX_RESULTS = 5;
const SNIPPET_MAX = 600;

/** One result as a backend returns it, before normalizing. */
interface RawResult {
  title?: string;
  url?: string;
  snippet?: string;
  publishedDate?: string;
}

interface SearchDescriptor {
  id: string;
  label: string;
  /** Env var that supplies the API key. */
  envKey: string;
  endpoint: string;
  /** Auth headers + JSON body for a query (all backends are a single POST). */
  request: (apiKey: string, query: string) => { headers: Record<string, string>; body: unknown };
  /** Pull the results out of the backend's JSON response. */
  results: (json: unknown) => RawResult[];
}

interface TavilyResponse {
  results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }>;
}

interface ExaResponse {
  results?: Array<{ title?: string; url?: string; text?: string; publishedDate?: string }>;
}

export const SEARCH_PROVIDERS: SearchDescriptor[] = [
  {
    id: "tavily",
    label: "Tavily",
    envKey: "TAVILY_API_KEY",
    endpoint: "https://api.tavily.com/search",
    request: (apiKey, query) => ({
      headers: { Authorization: `Bearer ${apiKey}` },
      body: { query, max_results: MAX_RESULTS },
    }),
    results: (json) =>
      ((json as TavilyResponse).results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
        publishedDate: r.published_date,
      })),
  },
  {
    id: "exa",
    label: "Exa",
    envKey: "EXA_API_KEY",
    endpoint: "https://api.exa.ai/search",
    request: (apiKey, query) => ({
      headers: { "x-api-key": apiKey },
      body: { query, numResults: MAX_RESULTS, contents: { text: true } },
    }),
    results: (json) =>
      ((json as ExaResponse).results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.text,
        publishedDate: r.publishedDate,
      })),
  },
];

export function getSearchProvider(id: string): SearchDescriptor | undefined {
  return SEARCH_PROVIDERS.find((s) => s.id === id);
}

/** Whether a usable key is available for a search backend. */
export function hasSearchKey(id: string): boolean {
  const desc = getSearchProvider(id);
  if (!desc) return false;
  return Boolean(resolveApiKey(desc.envKey, id));
}

// ---------------------------------------------------------------------------
// Normalized result shape (hides each backend's JSON, the way getModel hides
// the SDK kinds). The model only ever sees this uniform shape.
// ---------------------------------------------------------------------------

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

type SearchOutcome = SearchResult[] | { error: string };

function clip(text: string): string {
  const t = text.trim();
  return t.length > SNIPPET_MAX ? `${t.slice(0, SNIPPET_MAX)}…` : t;
}

// Mirrors listModels: AbortSignal.timeout + try/catch, errors returned to the model as data.
async function runSearch(providerId: string, query: string): Promise<SearchOutcome> {
  const desc = getSearchProvider(providerId);
  if (!desc) return { error: `Unknown search provider: ${providerId}` };
  const apiKey = resolveApiKey(desc.envKey, providerId);
  if (!apiKey) return { error: `No API key configured for ${desc.label}.` };

  const { headers, body } = desc.request(apiKey, query);
  try {
    const res = await fetch(desc.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { error: `${desc.label} search failed (${res.status})` };
    return desc
      .results(await res.json())
      .slice(0, MAX_RESULTS)
      .map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        snippet: clip(r.snippet ?? ""),
        publishedDate: r.publishedDate || undefined,
      }));
  } catch {
    return { error: `${desc.label} search failed or timed out.` };
  }
}

// ---------------------------------------------------------------------------
// Tool construction — registered only when search is enabled AND usable, so the
// model never sees a broken tool.
// ---------------------------------------------------------------------------

export function getSearchTools(prefs: AiPrefs): ToolSet {
  const { enabled, provider } = prefs.search;
  if (!enabled || !hasSearchKey(provider)) return {};

  return {
    web_search: tool({
      description:
        "Search the web for current information — recent papers, latest results, author details, " +
        "or anything after your knowledge cutoff. Returns a list of results with titles, URLs, and snippets.",
      inputSchema: jsonSchema<{ query: string }>({
        type: "object",
        properties: { query: { type: "string", description: "The search query." } },
        required: ["query"],
        additionalProperties: false,
      }),
      execute: async ({ query }) => runSearch(provider, query),
    }),
  };
}
