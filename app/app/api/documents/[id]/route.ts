import { NextRequest } from "next/server";
import { getDocument, touchDocument, deleteDocument, renameDocument } from "@/lib/db";
import { invalidJson, readJson } from "@/lib/http";
import { deletePdf } from "@/lib/storage";

// GET /api/documents/[id] — document metadata.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  const doc = getDocument(id);
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(doc);
}

const MAX_TITLE = 200;

// PATCH /api/documents/[id] — rename ({ title }) or update reading progress
// ({ last_page?, page_count? }). A rename doesn't count as opening the document.
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  const body = await readJson<{ title: string; last_page: number; page_count: number }>(request);
  if (!body) return invalidJson();

  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return Response.json({ error: "title must be non-empty text" }, { status: 400 });
    if (title.length > MAX_TITLE) return Response.json({ error: "title is too long" }, { status: 400 });
    const doc = renameDocument(id, title);
    if (!doc) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(doc);
  }

  const pageNumber = (n: unknown) => (Number.isInteger(n) && (n as number) > 0 ? (n as number) : undefined);
  const doc = touchDocument(id, {
    last_page: pageNumber(body.last_page),
    page_count: pageNumber(body.page_count),
  });
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(doc);
}

// DELETE /api/documents/[id] — remove the row (cascades highlights/chats) and the file.
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  deleteDocument(id);
  await deletePdf(id);
  return new Response(null, { status: 204 });
}
