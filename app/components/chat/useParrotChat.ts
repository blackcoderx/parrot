"use client";

import { useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";

/** What the model is told the reader is looking at (see `buildSystem` in /api/chat). */
export interface ChatContext {
  title?: string;
  /** The selected passage. */
  text?: string;
  /** Set for web pages (the browser extension), so the model hears "web page", not "paper". */
  url?: string;
}

/** A message as saved in the database. */
export interface SavedMessage {
  role: string;
  content: string;
  image?: string | null;
}

/** Plain text of a UIMessage's parts. */
export function textOf(m: UIMessage): string {
  return m.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("");
}

/**
 * An Ask Parrot conversation streamed from /api/chat with the reader's configured provider.
 * `image` (an AI-pen region as a PNG data URL) goes with the first message sent. Hosts render
 * it with `ChatMessages` / `ChatComposer` and save `messages` however they anchor threads.
 */
export function useParrotChat(context: ChatContext, image?: string | null) {
  // Created once: useChat keeps its first transport, so rebuilding it each render was waste.
  const [transport] = useState(
    () => new DefaultChatTransport({ api: "/api/chat", body: { context } }),
  );
  const { messages, sendMessage, setMessages, status, error } = useChat({ transport });
  const imageSent = useRef(false);
  const busy = status === "submitted" || status === "streaming";

  function send(text: string) {
    const attach = !!image && !imageSent.current;
    sendMessage({
      text,
      files: attach ? [{ type: "file", mediaType: "image/png", url: image }] : undefined,
    });
    if (attach) imageSent.current = true;
  }

  /** Load a saved thread to continue it. */
  function seed(saved: SavedMessage[]) {
    imageSent.current = true; // the history already carries any image
    setMessages(
      saved.map((m, i) => ({
        id: `saved-${i}`,
        role: m.role as UIMessage["role"],
        parts: [
          ...(m.image ? [{ type: "file" as const, mediaType: "image/png", url: m.image }] : []),
          { type: "text" as const, text: m.content },
        ],
      })),
    );
  }

  return { messages, status, error, busy, send, seed };
}

export type ParrotChat = ReturnType<typeof useParrotChat>;
