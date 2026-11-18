import { NextRequest } from "next/server";
import { deleteClip, updateClip } from "@/lib/db";
import { invalidJson, readJson } from "@/lib/http";
import { LIMITS, clipSubject, optionalText } from "../fields";

// PATCH /api/clips/[id] — { note?, subject_id? } (null note clears it; null subject = Unsorted).
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/clips/[id]">) {
  const { id } = await ctx.params;
  const body = await readJson<{ note: string | null; subject_id: string | null }>(request);
  if (!body) return invalidJson();

  const fields: { note?: string | null; subjectId?: string | null } = {};
  if ("note" in body) {
    const note = optionalText(body.note, "note", LIMITS.MAX_NOTE);
    if (note instanceof Response) return note;
    fields.note = note;
  }
  if ("subject_id" in body) {
    const subjectId = clipSubject(body.subject_id);
    if (subjectId instanceof Response) return subjectId;
    fields.subjectId = subjectId;
  }

  const clip = updateClip(id, fields);
  if (!clip) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(clip);
}

// DELETE /api/clips/[id] — the clip and its saved thread.
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/clips/[id]">) {
  const { id } = await ctx.params;
  deleteClip(id);
  return new Response(null, { status: 204 });
}
