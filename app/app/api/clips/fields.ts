import "server-only";

import { getSubject } from "@/lib/db";
import type { ClipMessage } from "@/types";

const MAX_URL = 2048;
const MAX_TITLE = 300;
const MAX_QUOTE = 20_000;
const MAX_NOTE = 50_000;
const MAX_MESSAGES = 200;
const MAX_MESSAGE = 100_000;

const bad = (error: string) => Response.json({ error }, { status: 400 });

/** An http(s) URL, or an error Response. */
export function clipUrl(value: unknown): string | Response {
  if (typeof value !== "string" || value.length > MAX_URL) return bad("url must be a web address");
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return bad("url must be http or https");
    return u.toString();
  } catch {
    return bad("url must be a web address");
  }
}

/** Optional text capped at `max` (null when missing or blank), or an error Response. */
export function optionalText(value: unknown, field: string, max: number): string | null | Response {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return bad(`${field} must be text`);
  if (value.length > max) return bad(`${field} is too long`);
  return value.trim() ? value : null;
}

export const LIMITS = { MAX_TITLE, MAX_QUOTE, MAX_NOTE };

/** A subject id that exists, null for Unsorted, or an error Response. */
export function clipSubject(value: unknown): string | null | Response {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !getSubject(value)) return bad("subject not found");
  return value;
}

/** A thread of { role: "user" | "assistant", content }, or an error Response. */
export function clipMessages(value: unknown): ClipMessage[] | Response {
  if (!Array.isArray(value) || value.length > MAX_MESSAGES) return bad("messages must be a list");
  const out: ClipMessage[] = [];
  for (const m of value) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      return bad("each message needs a role (user / assistant) and content");
    }
    if (content.length > MAX_MESSAGE) return bad("a message is too long");
    out.push({ role, content });
  }
  return out;
}
