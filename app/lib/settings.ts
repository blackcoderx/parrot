import "server-only";

import { db } from "./db";

/** Non-secret AI preferences. API keys are never stored here — see lib/providers.ts. */
export interface AiPrefs {
  activeProvider: string;
  /** Chosen model id per provider. */
  models: Record<string, string>;
  /** Custom base URL per provider (local/compatible runtimes). */
  baseURLs: Record<string, string>;
  /** Web-search tool config. Keys live in env/config.json, never here. */
  search: { enabled: boolean; provider: string };
}

const KEY = "ai";

const DEFAULT_PREFS: AiPrefs = {
  activeProvider: "anthropic",
  models: {},
  baseURLs: {},
  search: { enabled: false, provider: "tavily" },
};

export function getPrefs(): AiPrefs {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(KEY) as
    | { value: string }
    | undefined;
  if (!row) return DEFAULT_PREFS;
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(row.value) as Partial<AiPrefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setPrefs(prefs: AiPrefs): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(KEY, JSON.stringify(prefs));
}
