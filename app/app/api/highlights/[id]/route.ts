import { NextRequest } from "next/server";
import { deleteHighlight, updateHighlightNote } from "@/lib/db";

// PATCH /api/highlights/[id] — update the note text on a highlight.
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/highlights/[id]">) {
  const { id } = await ctx.params;
  const body = (await request.json()) as { note?: string };
  if (typeof body.note !== "string") {
    return Response.json({ error: "note is required" }, { status: 400 });
  }
  if (!updateHighlightNote(id, body.note)) {
    return Response.json({ error: "Highlight not found" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}

// DELETE /api/highlights/[id] — remove a single highlight.
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/highlights/[id]">) {
  const { id } = await ctx.params;
  deleteHighlight(id);
  return new Response(null, { status: 204 });
}
