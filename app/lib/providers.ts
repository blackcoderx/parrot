import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { PARROT_DIR } from "./paths";
import type { AiPrefs } from "./settings";

type Kind = "anthropic" | "openai" | "compatible";

interface ProviderDescriptor {
  id: string;
  label: string;
  kind: Kind;
  /** Env var that supplies the API key. */
  envKey: string;
  /** Whether a key is required (local runtimes like Ollama/LM Studio don't need one). */
  needsKey: boolean;
  /** Default API base URL. For "compatible" providers this includes the `/v1` suffix. */
  defaultBaseURL: string;
  /** Env var that overrides the base URL (used for local runtimes). */
  baseURLEnv?: string;
  /** Whether the user can edit the base URL in Settings. */
  editableBaseURL: boolean;
  /** Optional default model id. */
  defaultModel?: string;
}

export const PROVIDERS: ProviderDescriptor[] = [
  {
    id: "anthropic",
    label: "Claude (Anthropic)",
    kind: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    needsKey: true,
    defaultBaseURL: "https://api.anthropic.com/v1",
    editableBaseURL: false,
    defaultModel: "claude-sonnet-5",
  },
  {
    id: "openai",
    label: "OpenAI (GPT)",
    kind: "openai",
    envKey: "OPENAI_API_KEY",
    needsKey: true,
    defaultBaseURL: "https://api.openai.com/v1",
    editableBaseURL: false,
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    kind: "compatible",
    envKey: "XAI_API_KEY",
    needsKey: true,
    defaultBaseURL: "https://api.x.ai/v1",
    editableBaseURL: false,
  },
  {
    id: "groq",
    label: "Groq",
    kind: "compatible",
    envKey: "GROQ_API_KEY",
    needsKey: true,
    defaultBaseURL: "https://api.groq.com/openai/v1",
    editableBaseURL: false,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "compatible",
    envKey: "OPENROUTER_API_KEY",
    needsKey: true,
    defaultBaseURL: "https://openrouter.ai/api/v1",
    editableBaseURL: false,
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    kind: "compatible",
    envKey: "OLLAMA_API_KEY",
    needsKey: false,
    defaultBaseURL: "http://localhost:11434/v1",
    baseURLEnv: "OLLAMA_BASE_URL",
    editableBaseURL: true,
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    kind: "compatible",
    envKey: "LMSTUDIO_API_KEY",
    needsKey: false,
    defaultBaseURL: "http://localhost:1234/v1",
    baseURLEnv: "LMSTUDIO_BASE_URL",
    editableBaseURL: true,
  },
  {
    id: "openai-compatible",
    label: "OpenAI-compatible",
    kind: "compatible",
    envKey: "OPENAI_COMPATIBLE_API_KEY",
    needsKey: false,
    defaultBaseURL: "",
    baseURLEnv: "OPENAI_COMPATIBLE_BASE_URL",
    editableBaseURL: true,
  },
];

export function getProvider(id: string): ProviderDescriptor | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

// ---------------------------------------------------------------------------
// Key + base URL resolution (keys never touch the SQLite DB)
// ---------------------------------------------------------------------------

interface ConfigFile {
  [providerId: string]: { apiKey?: string; baseURL?: string } | undefined;
}

function readConfigFile(): ConfigFile {
  try {
    const raw = fs.readFileSync(path.join(PARROT_DIR, "config.json"), "utf8");
    return JSON.parse(raw) as ConfigFile;
  } catch {
    return {};
  }
}

/** Resolve an API key: env var first, then ~/.parrot/config.json. */
export function resolveKey(id: string): string | undefined {
  const desc = getProvider(id);
  if (!desc) return undefined;
  return process.env[desc.envKey] || readConfigFile()[id]?.apiKey || undefined;
}

/** Resolve the base URL: saved pref → env var → config file → provider default. */
export function resolveBaseURL(id: string, prefs?: AiPrefs): string {
  const desc = getProvider(id);
  if (!desc) return "";
  const fromPrefs = prefs?.baseURLs?.[id];
  const fromEnv = desc.baseURLEnv ? process.env[desc.baseURLEnv] : undefined;
  return fromPrefs || fromEnv || readConfigFile()[id]?.baseURL || desc.defaultBaseURL;
}

/** Whether a usable key is available (or the provider needs none). */
export function hasKey(id: string): boolean {
  const desc = getProvider(id);
  if (!desc) return false;
  return !desc.needsKey || Boolean(resolveKey(id));
}

// ---------------------------------------------------------------------------
// Model construction
// ---------------------------------------------------------------------------

export function getModel(prefs: AiPrefs): LanguageModel {
  const id = prefs.activeProvider;
  const desc = getProvider(id);
  if (!desc) throw new Error(`Unknown provider: ${id}`);

  const modelId = prefs.models?.[id] || desc.defaultModel;
  if (!modelId) throw new Error(`No model selected for ${desc.label}. Pick one in Settings.`);

  const apiKey = resolveKey(id);
  if (desc.needsKey && !apiKey) {
    throw new Error(`No API key found for ${desc.label}. Set ${desc.envKey} in app/.env.local.`);
  }
  const baseURL = resolveBaseURL(id, prefs);
  if (!baseURL) throw new Error(`No base URL configured for ${desc.label}.`);

  if (desc.kind === "anthropic") {
    return createAnthropic({ apiKey, baseURL })(modelId);
  }
  if (desc.kind === "openai") {
    return createOpenAI({ apiKey, baseURL })(modelId);
  }
  return createOpenAICompatible({ name: id, baseURL, apiKey })(modelId);
}

// ---------------------------------------------------------------------------
// Model listing (auto-fetch where the provider exposes an endpoint)
// ---------------------------------------------------------------------------

interface ModelsResponse {
  data?: Array<{ id: string }>;
}

/** Fetch the provider's available model ids; returns [] on any failure. */
export async function listModels(id: string, prefs?: AiPrefs): Promise<string[]> {
  const desc = getProvider(id);
  if (!desc) return [];

  const baseURL = resolveBaseURL(id, prefs);
  if (!baseURL) return [];
  const apiKey = resolveKey(id);
  if (desc.needsKey && !apiKey) return [];

  const headers: Record<string, string> = {};
  if (desc.kind === "anthropic") {
    if (apiKey) headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  try {
    const res = await fetch(`${baseURL.replace(/\/$/, "")}/models`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as ModelsResponse;
    const ids = (json.data ?? []).map((m) => m.id).filter(Boolean);
    return ids.sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}
