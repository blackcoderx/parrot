import { NextRequest } from "next/server";
import { deleteHighlight } from "@/lib/db";

// DELETE /api/highlights/[id] — remove a single highlight.
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/highlights/[id]">) {
  const { id } = await ctx.params;
  deleteHighlight(id);
  return new Response(null, { status: 204 });
}
