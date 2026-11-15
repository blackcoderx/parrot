import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { listHighlights, insertHighlight } from "@/lib/db";
import { invalidJson, readJson } from "@/lib/http";
import type { NormRect } from "@/types";

// GET /api/highlights?documentId=... — all highlights for a document.
export async function GET(request: NextRequest) {
  const documentId = request.nextUrl.searchParams.get("documentId");
  if (!documentId) {
    return Response.json({ error: "documentId is required" }, { status: 400 });
  }
  return Response.json(listHighlights(documentId));
}

// POST /api/highlights — create a highlight from normalized rects. A note may have no rects:
// that's a page note, pinned to the page rather than to a spot on it.
export async function POST(request: NextRequest) {
  const body = await readJson<{
    documentId: string;
    page: number;
    rects: NormRect[];
    color: string;
    text: string;
    note: string | null;
  }>(request);
  if (!body) return invalidJson();

  const isNote = typeof body.note === "string" && body.note.trim() !== "";
  if (
    !body.documentId ||
    typeof body.page !== "number" ||
    !Array.isArray(body.rects) ||
    (body.rects.length === 0 && !isNote) ||
    !body.color
  ) {
    return Response.json({ error: "Invalid highlight" }, { status: 400 });
  }

  const highlight = insertHighlight({
    id: randomUUID(),
    document_id: body.documentId,
    page: body.page,
    rects: body.rects,
    color: body.color,
    text: body.text ?? "",
    note: body.note ?? null,
  });

  return Response.json(highlight, { status: 201 });
}
