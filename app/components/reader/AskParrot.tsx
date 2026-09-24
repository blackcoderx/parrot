"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { NormRect } from "./types";
import Markdown from "./Markdown";
import { useFloatingWindow } from "./useFloatingWindow";
import styles from "./Reader.module.css";

/** What the thread anchors to when saved. */
export type AskAnchor =
  | { kind: "selection"; page: number; rects: NormRect[]; text: string }
  | { kind: "region"; page: number; rect: NormRect; image: string }
  | { kind: "existing"; highlightId: string };

interface Props {
  documentId: string;
  title: string;
  /** Rect used only for the window's initial placement (not a live anchor). */
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

// Claude-Code-style cycling words shown in the "thinking" pill.
const THINKING_WORDS = [
  "Reading",
  "Parsing",
  "Digesting",
  "Pondering",
  "Cross-referencing",
  "Untangling jargon",
  "Consulting the paper",
  "Connecting ideas",
  "Synthesizing",
];
const SEARCHING_WORDS = [
  "Searching the web",
  "Chasing citations",
  "Scanning sources",
  "Gathering results",
];

/** Cycle through `words` on an interval while `active`. */
function useCyclingWord(active: boolean, words: string[]): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setI((n) => n + 1), 1600);
    return () => clearInterval(id);
  }, [active, words]);
  return words[i % words.length] ?? words[0];
}

export function AskParrot({ documentId, title, anchorRect, anchor, onClose, onSaved }: Props) {
  const [input, setInput] = useState("");
  const [saved, setSaved] = useState(false);
  // The highlight this thread is anchored to once saved. Set from the first
  // save's response so re-saves upsert in place instead of creating duplicates.
  const [savedHighlightId, setSavedHighlightId] = useState<string | null>(
    anchor.kind === "existing" ? anchor.highlightId : null,
  );
  const { panelRef, style, headerProps } = useFloatingWindow(anchorRect, onClose);
  const imageSent = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Holds the latest save action for the window-level Ctrl/Cmd+Enter shortcut,
  // so the keydown listener can stay stable without a stale closure.
  const saveRef = useRef<() => void>(() => {});

  // Created once: useChat keeps its first transport, so rebuilding it each render was waste.
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { context: { title, text: anchor.kind === "selection" ? anchor.text : undefined } },
      }),
  );
  const { messages, sendMessage, setMessages, status, error } = useChat({ transport });

  // Ctrl/Cmd+Enter saves (Escape/resize/drag are handled by useFloatingWindow).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        saveRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  // Thinking/streaming state for the animated pill and caret.
  const lastMsg = messages[messages.length - 1];
  const lastText = lastMsg ? textOf(lastMsg) : "";
  // A web_search tool call is mid-flight when the last message carries a tool
  // part that hasn't produced output yet.
  const searching =
    !!lastMsg &&
    lastMsg.parts.some((p) => {
      const state = (p as { state?: string }).state;
      return (
        typeof p.type === "string" &&
        p.type.startsWith("tool-") &&
        state !== "output-available" &&
        state !== "output-error"
      );
    });
  // Show the pill while we wait for the assistant's first visible text.
  const awaitingAssistant =
    busy && (!lastMsg || lastMsg.role === "user" || lastText.trim() === "");
  const streamingId = status === "streaming" ? lastMsg?.id : undefined;
  const word = useCyclingWord(awaitingAssistant, searching ? SEARCHING_WORDS : THINKING_WORDS);

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

    // Once anchored to a highlight, re-saves go through the upsert path (the
    // server reuses the chat and replaces its messages) — no duplicate rows.
    const existingId = anchor.kind === "existing" ? anchor.highlightId : savedHighlightId;

    // Chat highlights render from the accent via CSS; this is only a fallback color.
    const accent =
      getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#71F79F";

    let body;
    if (existingId) {
      body = { documentId, highlightId: existingId, messages: simplified };
    } else if (anchor.kind === "region") {
      body = {
        documentId,
        highlight: { page: anchor.page, rects: [anchor.rect], color: accent, text: "" },
        messages: simplified,
      };
    } else if (anchor.kind === "selection") {
      body = {
        documentId,
        highlight: { page: anchor.page, rects: anchor.rects, color: accent, text: anchor.text },
        messages: simplified,
      };
    } else {
      return; // "existing" anchor always has an id, so this is unreachable
    }

    const res = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data: { highlightId?: string } = await res.json().catch(() => ({}));
      if (data.highlightId) setSavedHighlightId(data.highlightId);
      setSaved(true);
      onSaved();
    }
  }

  const regionImage = anchor.kind === "region" ? anchor.image : null;
  const canSave = messages.length > 0 && !busy;
  // Keep the shortcut's save action current (guarded like the Save button) so
  // the stable window keydown listener always calls the latest save().
  useEffect(() => {
    saveRef.current = () => {
      if (canSave) save();
    };
  });

  return (
    <div
      ref={panelRef}
      popover="manual"
      className={styles.askPanel}
      style={style}
    >
      <div className={styles.askHeader} {...headerProps}>
        <span className={styles.askTitle}>Ask Parrot</span>
        <button className={styles.askClose} onClick={onClose} aria-label="Close" title="Close (Esc)">
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
        {messages.map((m) => {
          if (m.role === "user") {
            return (
              <div key={m.id} className={styles.askUser}>
                {textOf(m)}
              </div>
            );
          }
          const text = textOf(m);
          // Empty assistant message (not started / tool call in flight) → the
          // thinking pill stands in for it, so skip the empty bubble.
          if (text.trim() === "") return null;
          return (
            <div key={m.id} className={styles.askAssistant}>
              <Markdown>{text}</Markdown>
              {m.id === streamingId && <span className={styles.caret} />}
            </div>
          );
        })}
        {awaitingAssistant && (
          <div className={styles.askThinking}>
            <span className={styles.shimmer}>{word}…</span>
          </div>
        )}
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
            // Plain Enter sends; Ctrl/Cmd+Enter bubbles to the window save handler.
            if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) submit();
          }}
        />
        <button className={styles.askSend} onClick={submit} disabled={busy}>
          {busy ? "…" : "Send"}
        </button>
        <button className={styles.askSave} onClick={save} disabled={!canSave} title="Save (Ctrl+Enter)">
          {saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
