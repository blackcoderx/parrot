import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import {
  insertHighlight,
  insertChat,
  getChatByHighlight,
  listMessages,
  replaceMessages,
  type NormRect,
} from "@/lib/db";

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

  // Resolve (or create) the anchor highlight.
  let highlightId = body.highlightId;
  if (!highlightId) {
    if (!body.highlight) {
      return Response.json({ error: "highlight or highlightId is required" }, { status: 400 });
    }
    const created = insertHighlight({
      id: randomUUID(),
      document_id: body.documentId,
      page: body.highlight.page,
      rects: body.highlight.rects,
      color: body.highlight.color,
      text: body.highlight.text,
    });
    highlightId = created.id;
  }

  // Resolve (or create) the chat, then replace its messages.
  let chat = getChatByHighlight(highlightId);
  if (!chat) {
    const id = randomUUID();
    insertChat({ id, document_id: body.documentId, highlight_id: highlightId });
    chat = { id };
  }
  replaceMessages(chat.id, body.messages);

  return Response.json({ highlightId, chatId: chat.id }, { status: 201 });
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
