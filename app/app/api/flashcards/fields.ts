import type { CardSource } from "@/types";

const MAX_LENGTH = 5000;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;

interface CardFields {
  question?: string;
  hint?: string | null;
  answer?: string;
  tags?: string[];
}

/**
 * Validate a flashcard request body. Question and answer must be non-empty when present
 * (and are required unless `partial`); an empty hint is stored as null. Tags are trimmed and
 * de-duplicated case-insensitively (the first spelling wins).
 */
export function readCardFields(
  body: Record<string, unknown> | null,
  { partial }: { partial: boolean },
): CardFields | { error: string } {
  const out: CardFields = {};

  for (const key of ["question", "answer"] as const) {
    const value = body?.[key];
    if (value === undefined && partial) continue;
    if (typeof value !== "string" || !value.trim()) return { error: `${key} is required` };
    if (value.length > MAX_LENGTH) return { error: `${key} is too long` };
    out[key] = value.trim();
  }

  const hint = body?.hint;
  if (hint !== undefined) {
    if (hint !== null && typeof hint !== "string") return { error: "hint must be text" };
    if (typeof hint === "string" && hint.length > MAX_LENGTH) return { error: "hint is too long" };
    out.hint = typeof hint === "string" && hint.trim() ? hint.trim() : null;
  }

  const tags = body?.tags;
  if (tags !== undefined) {
    if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string")) {
      return { error: "tags must be a list of text" };
    }
    const seen = new Set<string>();
    out.tags = [];
    for (const raw of tags as string[]) {
      const tag = raw.trim().replace(/\s+/g, " ");
      if (!tag || seen.has(tag.toLowerCase())) continue;
      if (tag.length > MAX_TAG_LENGTH) return { error: "a tag is too long" };
      seen.add(tag.toLowerCase());
      out.tags.push(tag);
    }
    if (out.tags.length > MAX_TAGS) return { error: "too many tags" };
  }

  return out;
}

/** Validate the optional `source` of a new card (where in the document it was made). */
export function readCardSource(
  body: Record<string, unknown> | null,
): CardSource | null | { error: string } {
  const source = body?.source;
  if (source === undefined || source === null) return null;
  if (typeof source !== "object") return { error: "source must be an object" };
  const { page, y, section_id, section } = source as Record<string, unknown>;

  if (typeof page !== "number" || !Number.isInteger(page) || page < 1) {
    return { error: "source.page must be a page number" };
  }
  if (y != null && (typeof y !== "number" || !Number.isFinite(y))) {
    return { error: "source.y must be a number" };
  }
  for (const [key, value, max] of [
    ["section_id", section_id, 200],
    ["section", section, 500],
  ] as const) {
    if (value != null && (typeof value !== "string" || value.length > max)) {
      return { error: `source.${key} is invalid` };
    }
  }

  return {
    page,
    y: typeof y === "number" ? Math.min(1, Math.max(0, y)) : null,
    section_id: typeof section_id === "string" && section_id ? section_id : null,
    section: typeof section === "string" && section.trim() ? section.trim() : null,
  };
}
