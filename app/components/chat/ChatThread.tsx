"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "@/components/reader/Markdown";
import styles from "@/components/reader/AskParrot.module.css";
import { textOf, type ParrotChat } from "./useParrotChat";

// Claude-Code-style cycling words shown in the "thinking" pill.
const THINKING_WORDS = [
  "Reading",
  "Parsing",
  "Digesting",
  "Pondering",
  "Cross-referencing",
  "Untangling jargon",
  "Consulting the text",
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

/**
 * The conversation: the reader's messages, Parrot's replies (Markdown + LaTeX, with a caret
 * while streaming), a thinking / searching pill until the first words arrive, and any error.
 * Scrolls itself to the latest message.
 */
export function ChatMessages({ chat, emptyText }: { chat: ParrotChat; emptyText: string }) {
  const { messages, status, error, busy } = chat;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the thread scrolled to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

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

  return (
    <div className={styles.askMessages} ref={scrollRef}>
      {messages.length === 0 && <p className={styles.askEmpty}>{emptyText}</p>}
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
  );
}

/**
 * The rounded message bar with its round send button. Enter sends; Ctrl/Cmd+Enter is left to
 * bubble so hosts can bind it to Save.
 */
export function ChatComposer({ chat, onSent }: { chat: ParrotChat; onSent?: () => void }) {
  const [input, setInput] = useState("");
  const { busy } = chat;

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    chat.send(text);
    setInput("");
    onSent?.();
  }

  return (
    <div className={styles.askInputRow}>
      <div className={styles.composer}>
        <input
          className={styles.askInput}
          value={input}
          placeholder="Type a message…"
          aria-label="Message"
          // data-autofocus: focused when a floating window opens; autoFocus: on later remounts.
          data-autofocus
          autoFocus
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) submit();
          }}
        />
        <button
          className={styles.composerSend}
          onClick={submit}
          disabled={busy || !input.trim()}
          data-busy={busy || undefined}
          aria-label="Send"
          title="Send (Enter)"
        >
          <ArrowUpIcon />
        </button>
      </div>
    </div>
  );
}

// Tabler outline "arrow-up" and "bookmark" (MIT).

function ArrowUpIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 5l0 14" />
      <path d="M18 11l-6 -6" />
      <path d="M6 11l6 -6" />
    </svg>
  );
}

/** Outline until the thread is saved, then filled. */
export function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 7v14l-6 -4l-6 4v-14a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4z" />
    </svg>
  );
}
