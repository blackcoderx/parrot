import { NextRequest } from "next/server";
import { getChatByHighlight, listMessages, saveThread, type NormRect } from "@/lib/db";

interface SaveBody {
  documentId: string;
  highlightId?: string;
  /** Provided when the thread isn't anchored to an existing highlight yet. */
  highlight?: { page: number; rects: NormRect[]; color: string; text: string };
  messages: { role: string; content: string; image?: string | null }[];
}

// POST /api/chats — save/upsert a thread, anchoring it to a highlight.
export async function POST(request: NextRequest) {
  const body = (await request.json()) as SaveBody;
  if (!body.documentId || !body.messages?.length) {
    return Response.json({ error: "documentId and messages are required" }, { status: 400 });
  }

  if (!body.highlightId && !body.highlight) {
    return Response.json({ error: "highlight or highlightId is required" }, { status: 400 });
  }

  // Resolve (or create) the anchor highlight and chat, then replace the messages — in one
  // transaction.
  const h = body.highlight;
  const saved = saveThread({
    documentId: body.documentId,
    highlightId: body.highlightId,
    highlight: h && { page: h.page, rects: h.rects, color: h.color, text: h.text },
    messages: body.messages,
  });

  return Response.json(saved, { status: 201 });
}

// GET /api/chats?highlightId=... — the saved thread for a highlight.
export async function GET(request: NextRequest) {
  const highlightId = request.nextUrl.searchParams.get("highlightId");
  if (!highlightId) {
    return Response.json({ error: "highlightId is required" }, { status: 400 });
  }
  const chat = getChatByHighlight(highlightId);
  if (!chat) return Response.json({ chatId: null, messages: [] });
  return Response.json({ chatId: chat.id, messages: listMessages(chat.id) });
}
