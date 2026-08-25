import { NextRequest } from "next/server";
import { getDocument } from "@/lib/db";
import { readPdf } from "@/lib/storage";

// GET /api/files/[id] — the raw PDF bytes, for react-pdf to load.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;

  if (!getDocument(id)) return new Response("Not found", { status: 404 });

  const bytes = await readPdf(id);
  if (!bytes) return new Response("File missing", { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
    },
  });
}
