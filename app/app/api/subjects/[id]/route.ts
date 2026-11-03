import { NextRequest } from "next/server";
import { deleteSubject, renameSubject } from "@/lib/db";
import { invalidJson, readJson } from "@/lib/http";
import { subjectName } from "../fields";

// PATCH /api/subjects/[id] — rename ({ name }).
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/subjects/[id]">) {
  const { id } = await ctx.params;
  const body = await readJson<{ name: string }>(request);
  if (!body) return invalidJson();
  const name = subjectName(body.name, id);
  if (name instanceof Response) return name;
  const subject = renameSubject(id, name);
  if (!subject) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(subject);
}

// DELETE /api/subjects/[id] — remove the subject; its documents become Unsorted.
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/subjects/[id]">) {
  const { id } = await ctx.params;
  deleteSubject(id);
  return new Response(null, { status: 204 });
}
