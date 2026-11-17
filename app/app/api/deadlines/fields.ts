import "server-only";

const MAX_TITLE = 80;

/** Validate a deadline body: the trimmed title and YYYY-MM-DD day, or an error Response. */
export function deadlineFields(body: {
  title?: unknown;
  due?: unknown;
}): { title: string; due: string } | Response {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return Response.json({ error: "title must be non-empty text" }, { status: 400 });
  if (title.length > MAX_TITLE) {
    return Response.json({ error: "title is too long" }, { status: 400 });
  }
  const due = typeof body.due === "string" ? body.due : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
  // Round-trip through Date to reject days that don't exist (2026-02-30).
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.toISOString().slice(0, 10) !== due) {
    return Response.json({ error: "due must be a YYYY-MM-DD date" }, { status: 400 });
  }
  return { title, due };
}
