import { NextRequest } from "next/server";
import { getDocument, touchDocument, deleteDocument } from "@/lib/db";
import { deletePdf } from "@/lib/storage";

// GET /api/documents/[id] — document metadata.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  const doc = getDocument(id);
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(doc);
}

// PATCH /api/documents/[id] — update reading progress ({ last_page?, page_count? }).
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  if (!getDocument(id)) return Response.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json()) as { last_page?: number; page_count?: number };
  touchDocument(id, body);
  return Response.json(getDocument(id));
}

// DELETE /api/documents/[id] — remove the row (cascades highlights/chats) and the file.
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  deleteDocument(id);
  await deletePdf(id);
  return new Response(null, { status: 204 });
}
