import "server-only";

import { subjectNameTaken } from "@/lib/db";

const MAX_NAME = 80;

/** Validate a subject name: the trimmed name, or an error Response to return. */
export function subjectName(value: unknown, exceptId?: string): string | Response {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) return Response.json({ error: "name must be non-empty text" }, { status: 400 });
  if (name.length > MAX_NAME) return Response.json({ error: "name is too long" }, { status: 400 });
  if (subjectNameTaken(name, exceptId)) {
    return Response.json({ error: "A subject with that name already exists" }, { status: 409 });
  }
  return name;
}
