import { NextRequest } from "next/server";
import { getFlashcardSrs, recordReview } from "@/lib/db";
import { invalidJson, readJson } from "@/lib/http";
import { review } from "@/lib/srs";
import type { Grade } from "@/types";

// POST /api/flashcards/[id]/review — grade a card while studying ({ rating: 1 Again .. 4 Easy }).
// Returns the rescheduled card (a StudyCard, with fresh intervals).
export async function POST(request: NextRequest, ctx: RouteContext<"/api/flashcards/[id]/review">) {
  const { id } = await ctx.params;
  const body = await readJson<{ rating: number }>(request);
  if (!body) return invalidJson();
  const rating = body.rating;
  if (rating !== 1 && rating !== 2 && rating !== 3 && rating !== 4) {
    return Response.json({ error: "rating must be 1, 2, 3 or 4" }, { status: 400 });
  }

  const before = getFlashcardSrs(id);
  if (before === undefined) return Response.json({ error: "Not found" }, { status: 404 });
  const now = Date.now();
  const card = recordReview(id, rating as Grade, before, review(before, rating, now), now);
  if (!card) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(card);
}
