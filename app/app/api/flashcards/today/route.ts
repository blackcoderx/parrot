import { NextRequest } from "next/server";
import { studyCountsSince } from "@/lib/db";

// GET /api/flashcards/today?since=<epoch ms> — study done since the reader's local midnight
// (sent by the client, so "today" follows their clock): { reviewed, introduced }.
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("since");
  const since = Number(raw);
  if (!raw || !Number.isFinite(since) || since < 0) {
    return Response.json({ error: "since must be a timestamp" }, { status: 400 });
  }
  return Response.json(studyCountsSince(since));
}
