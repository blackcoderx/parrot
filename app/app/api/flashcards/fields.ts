const MAX_LENGTH = 5000;

interface CardFields {
  question?: string;
  hint?: string | null;
  answer?: string;
}

/**
 * Validate a flashcard request body. Question and answer must be non-empty when present
 * (and are required unless `partial`); an empty hint is stored as null.
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

  return out;
}
