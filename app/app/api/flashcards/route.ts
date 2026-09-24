import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { getDocument, insertFlashcard, listFlashcards } from "@/lib/db";
import { readJson } from "@/lib/http";
import { readCardFields } from "./fields";

// GET /api/flashcards?documentId=... — all flashcards for a document, oldest first.
export async function GET(request: NextRequest) {
  const documentId = request.nextUrl.searchParams.get("documentId");
  if (!documentId) {
    return Response.json({ error: "documentId is required" }, { status: 400 });
  }
  return Response.json(listFlashcards(documentId));
}

// POST /api/flashcards — create a card ({ documentId, question, hint?, answer }).
export async function POST(request: NextRequest) {
  const body = await readJson<Record<string, unknown>>(request);
  const documentId = typeof body?.documentId === "string" ? body.documentId : "";
  if (!documentId || !getDocument(documentId)) {
    return Response.json({ error: "Unknown document" }, { status: 400 });
  }

  const fields = readCardFields(body, { partial: false });
  if ("error" in fields) return Response.json({ error: fields.error }, { status: 400 });

  const card = insertFlashcard({
    id: randomUUID(),
    document_id: documentId,
    question: fields.question!,
    hint: fields.hint ?? null,
    answer: fields.answer!,
  });
  return Response.json(card, { status: 201 });
}
