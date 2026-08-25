"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "@base-ui-components/react/popover";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { NormRect } from "./types";
import styles from "./Reader.module.css";

/** What the thread anchors to when saved. */
export type AskAnchor =
  | { kind: "selection"; page: number; rects: NormRect[]; text: string }
  | { kind: "region"; page: number; rect: NormRect; image: string }
  | { kind: "existing"; highlightId: string };

interface Props {
  documentId: string;
  title: string;
  anchorRect: DOMRect | null;
  anchor: AskAnchor;
  onClose: () => void;
  onSaved: () => void;
}

/** Extract plain text from a UIMessage's parts. */
function textOf(m: UIMessage): string {
  return m.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("");
}

export function AskParrot({ documentId, title, anchorRect, anchor, onClose, onSaved }: Props) {
  const [input, setInput] = useState("");
  const [saved, setSaved] = useState(false);
  const imageSent = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const contextText = anchor.kind === "selection" ? anchor.text : undefined;

  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { context: { title, text: contextText } },
    }),
  });

  // Reopen: seed the saved thread.
  useEffect(() => {
    if (anchor.kind !== "existing") return;
    fetch(`/api/chats?highlightId=${anchor.highlightId}`)
      .then((r) => r.json())
      .then((d: { messages: { role: string; content: string; image?: string | null }[] }) => {
        imageSent.current = true; // history already carries any image
        setMessages(
          d.messages.map((m, i) => ({
            id: `saved-${i}`,
            role: m.role as UIMessage["role"],
            parts: [
              ...(m.image ? [{ type: "file" as const, mediaType: "image/png", url: m.image }] : []),
              { type: "text" as const, text: m.content },
            ],
          })),
        );
      })
      .catch(() => {});
  }, [anchor, setMessages]);

  // Keep the thread scrolled to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const busy = status === "submitted" || status === "streaming";

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    const attachImage = anchor.kind === "region" && !imageSent.current;
    sendMessage({
      text,
      files: attachImage ? [{ type: "file", mediaType: "image/png", url: anchor.image }] : undefined,
    });
    if (attachImage) imageSent.current = true;
    setInput("");
    setSaved(false);
  }

  async function save() {
    const simplified = messages.map((m, i) => ({
      role: m.role,
      content: textOf(m),
      image: i === 0 && anchor.kind === "region" ? anchor.image : null,
    }));

    // Chat highlights render from the accent via CSS; this is only a fallback color.
    const accent =
      getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#71F79F";

    const body =
      anchor.kind === "existing"
        ? { documentId, highlightId: anchor.highlightId, messages: simplified }
        : {
            documentId,
            highlight:
              anchor.kind === "selection"
                ? { page: anchor.page, rects: anchor.rects, color: accent, text: anchor.text }
                : { page: anchor.page, rects: [anchor.rect], color: accent, text: "" },
            messages: simplified,
          };

    const res = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setSaved(true);
      onSaved();
    }
  }

  const regionImage = anchor.kind === "region" ? anchor.image : null;
  const canSave = useMemo(() => messages.length > 0 && !busy, [messages.length, busy]);

  return (
    <Popover.Root open={anchorRect !== null} onOpenChange={(o) => !o && onClose()}>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={8}
          anchor={anchorRect ? () => ({ getBoundingClientRect: () => anchorRect }) : undefined}
        >
          <Popover.Popup className={styles.askPanel}>
            <div className={styles.askHeader}>
              <span className={styles.askTitle}>Ask Parrot</span>
              <button className={styles.askClose} onClick={onClose} aria-label="Close">
                ×
              </button>
            </div>

            {regionImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={regionImage} alt="Selected region" className={styles.askRegion} />
            )}

            <div className={styles.askMessages} ref={scrollRef}>
              {messages.length === 0 && (
                <p className={styles.askEmpty}>
                  {anchor.kind === "region"
                    ? "Ask about the selected region."
                    : "Ask about the selected text."}
                </p>
              )}
              {messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? styles.askUser : styles.askAssistant}>
                  {textOf(m)}
                </div>
              ))}
              {error && <div className={styles.askError}>{error.message}</div>}
            </div>

            <div className={styles.askInputRow}>
              <input
                className={styles.askInput}
                value={input}
                placeholder="Type a message…"
                autoFocus
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
              />
              <button className={styles.askSend} onClick={submit} disabled={busy}>
                {busy ? "…" : "Send"}
              </button>
              <button className={styles.askSave} onClick={save} disabled={!canSave}>
                {saved ? "Saved" : "Save"}
              </button>
            </div>


          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
