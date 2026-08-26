import "server-only";

import { tool, jsonSchema, type ToolSet } from "ai";
import { resolveApiKey } from "./providers";
import type { AiPrefs } from "./settings";

// ---------------------------------------------------------------------------
// Web-search backends (portable tool, bring-your-own-key). Mirrors the model
// provider registry in lib/providers.ts: a registry of backends whose keys come
// from env vars or ~/.parrot/config.json — never the SQLite DB.
// ---------------------------------------------------------------------------

interface SearchDescriptor {
  id: string;
  label: string;
  /** Env var that supplies the API key. */
  envKey: string;
  endpoint: string;
}

export const SEARCH_PROVIDERS: SearchDescriptor[] = [
  { id: "tavily", label: "Tavily", envKey: "TAVILY_API_KEY", endpoint: "https://api.tavily.com/search" },
  { id: "exa", label: "Exa", envKey: "EXA_API_KEY", endpoint: "https://api.exa.ai/search" },
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

const MAX_RESULTS = 5;
const SNIPPET_MAX = 600;

function clip(text: string): string {
  const t = text.trim();
  return t.length > SNIPPET_MAX ? `${t.slice(0, SNIPPET_MAX)}…` : t;
}

// --- Backend adapters (mirror listModels: AbortSignal.timeout + try/catch) ---

interface TavilyResponse {
  results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }>;
}

async function searchTavily(desc: SearchDescriptor, apiKey: string, query: string): Promise<SearchOutcome> {
  try {
    const res = await fetch(desc.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, max_results: MAX_RESULTS }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { error: `Tavily search failed (${res.status})` };
    const json = (await res.json()) as TavilyResponse;
    return (json.results ?? []).slice(0, MAX_RESULTS).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: clip(r.content ?? ""),
      publishedDate: r.published_date || undefined,
    }));
  } catch {
    return { error: "Tavily search failed or timed out." };
  }
}

interface ExaResponse {
  results?: Array<{ title?: string; url?: string; text?: string; publishedDate?: string }>;
}

async function searchExa(desc: SearchDescriptor, apiKey: string, query: string): Promise<SearchOutcome> {
  try {
    const res = await fetch(desc.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ query, numResults: MAX_RESULTS, contents: { text: true } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { error: `Exa search failed (${res.status})` };
    const json = (await res.json()) as ExaResponse;
    return (json.results ?? []).slice(0, MAX_RESULTS).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: clip(r.text ?? ""),
      publishedDate: r.publishedDate || undefined,
    }));
  } catch {
    return { error: "Exa search failed or timed out." };
  }
}

async function runSearch(providerId: string, query: string): Promise<SearchOutcome> {
  const desc = getSearchProvider(providerId);
  if (!desc) return { error: `Unknown search provider: ${providerId}` };
  const apiKey = resolveApiKey(desc.envKey, providerId);
  if (!apiKey) return { error: `No API key configured for ${desc.label}.` };

  if (providerId === "tavily") return searchTavily(desc, apiKey, query);
  if (providerId === "exa") return searchExa(desc, apiKey, query);
  return { error: `Search provider ${providerId} is not implemented.` };
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
