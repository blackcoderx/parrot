import { NextRequest } from "next/server";
import { getDocument, getOutline, saveOutline } from "@/lib/db";

// Bump when the client's OutlineNode shape changes; older cached entries are then ignored.
const VERSION = 1;
const MAX_BYTES = 2_000_000;

// GET /api/documents/[id]/outline — the cached outline array, or null if not cached yet.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/documents/[id]/outline">) {
  const { id } = await ctx.params;
  const data = getOutline(id, VERSION);
  return new Response(data ?? "null", { headers: { "Content-Type": "application/json" } });
}

// PUT /api/documents/[id]/outline — cache the outline the client resolved from the PDF.
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/documents/[id]/outline">) {
  const { id } = await ctx.params;
  if (!getDocument(id)) return Response.json({ error: "Not found" }, { status: 404 });

  const text = await request.text();
  if (text.length > MAX_BYTES) return Response.json({ error: "Too large" }, { status: 413 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(parsed)) return Response.json({ error: "Expected an array" }, { status: 400 });

  saveOutline(id, VERSION, text);
  return new Response(null, { status: 204 });
}
