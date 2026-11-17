import { NextRequest } from "next/server";
import { deleteDeadline, updateDeadline } from "@/lib/db";
import { invalidJson, readJson } from "@/lib/http";
import { deadlineFields } from "../fields";

// PATCH /api/deadlines/[id] — { title, due } → the updated Deadline.
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/deadlines/[id]">) {
  const { id } = await ctx.params;
  const body = await readJson<{ title: string; due: string }>(request);
  if (!body) return invalidJson();
  const fields = deadlineFields(body);
  if (fields instanceof Response) return fields;
  const deadline = updateDeadline(id, fields.title, fields.due);
  if (!deadline) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(deadline);
}

// DELETE /api/deadlines/[id]
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/deadlines/[id]">) {
  const { id } = await ctx.params;
  deleteDeadline(id);
  return new Response(null, { status: 204 });
}
