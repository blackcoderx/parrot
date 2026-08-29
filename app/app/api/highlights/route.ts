import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { listHighlights, insertHighlight, type NormRect } from "@/lib/db";

// GET /api/highlights?documentId=... — all highlights for a document.
export async function GET(request: NextRequest) {
  const documentId = request.nextUrl.searchParams.get("documentId");
  if (!documentId) {
    return Response.json({ error: "documentId is required" }, { status: 400 });
  }
  return Response.json(listHighlights(documentId));
}

// POST /api/highlights — create a highlight from normalized rects.
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    documentId?: string;
    page?: number;
    rects?: NormRect[];
    color?: string;
    text?: string;
    note?: string | null;
  };

  if (!body.documentId || typeof body.page !== "number" || !body.rects?.length || !body.color) {
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
