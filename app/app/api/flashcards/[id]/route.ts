import { NextRequest } from "next/server";
import { deleteFlashcard, updateFlashcard } from "@/lib/db";
import { readCardFields } from "../fields";

// PATCH /api/flashcards/[id] — edit a card ({ question?, hint?, answer? }).
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/flashcards/[id]">) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const fields = readCardFields(body, { partial: true });
  if ("error" in fields) return Response.json({ error: fields.error }, { status: 400 });

  const card = updateFlashcard(id, fields);
  if (!card) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(card);
}

// DELETE /api/flashcards/[id]
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/flashcards/[id]">) {
  const { id } = await ctx.params;
  deleteFlashcard(id);
  return new Response(null, { status: 204 });
}
