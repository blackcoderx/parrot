import { NextRequest } from "next/server";
import { getDocument, insertFocusSession } from "@/lib/db";
import { DAY_RE, focusStats } from "@/lib/focus";
import { invalidJson, readJson } from "@/lib/http";

// POST /api/focus/sessions — record a finished focus session
// ({ day, startedAt, minutes, documentId?, today? }) and return the updated streak as of
// `today` (defaults to `day`; differs when catching up a session that ended yesterday).
export async function POST(request: NextRequest) {
  const body = await readJson<{
    day: string;
    startedAt: number;
    minutes: number;
    documentId: string;
    today: string;
  }>(request);
  if (!body) return invalidJson();

  const { day, startedAt, minutes, documentId, today } = body;
  if (typeof day !== "string" || !DAY_RE.test(day)) {
    return Response.json({ error: "day must be YYYY-MM-DD" }, { status: 400 });
  }
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt)) {
    return Response.json({ error: "startedAt must be a timestamp" }, { status: 400 });
  }
  if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 1) {
    return Response.json({ error: "minutes must be a positive whole number" }, { status: 400 });
  }

  insertFocusSession({
    day,
    started_at: startedAt,
    minutes,
    // The session still counts if its document is unknown (e.g. removed meanwhile).
    document_id: typeof documentId === "string" && getDocument(documentId) ? documentId : null,
  });
  const statsDay = typeof today === "string" && DAY_RE.test(today) ? today : day;
  return Response.json(focusStats(statsDay), { status: 201 });
}
