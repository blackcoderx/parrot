"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  /** Rect used only for the window's initial placement (not a live anchor). */
  anchorRect: DOMRect | null;
  anchor: AskAnchor;
  onClose: () => void;
  onSaved: () => void;
}

interface Pos {
  left: number;
  top: number;
}

/** Extract plain text from a UIMessage's parts. */
function textOf(m: UIMessage): string {
  return m.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("");
}

/** Keep the whole window inside the viewport (so the header/close stays reachable). */
function clampPos(left: number, top: number, w: number, h: number): Pos {
  const m = 8;
  const maxLeft = Math.max(m, window.innerWidth - w - m);
  const maxTop = Math.max(m, window.innerHeight - h - m);
  return {
    left: Math.min(Math.max(left, m), maxLeft),
    top: Math.min(Math.max(top, m), maxTop),
  };
}

export function AskParrot({ documentId, title, anchorRect, anchor, onClose, onSaved }: Props) {
  const [input, setInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const imageSent = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const contextText = anchor.kind === "selection" ? anchor.text : undefined;

  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { context: { title, text: contextText } },
    }),
  });

  // Render into the top layer, then place the window near the anchor (clamped).
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    try {
      if (!el.matches(":popover-open")) el.showPopover();
    } catch {
      // showPopover unsupported or already open — positioning still works.
    }
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = anchorRect ? anchorRect.left : (window.innerWidth - w) / 2;
    const top = anchorRect ? anchorRect.bottom + 8 : (window.innerHeight - h) / 2;
    setPos(clampPos(left, top, w, h));
    return () => {
      try {
        el.hidePopover();
      } catch {
        // no-op
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape closes; re-clamp if the window is resized.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onResize() {
      const el = panelRef.current;
      if (!el) return;
      setPos((prev) => (prev ? clampPos(prev.left, prev.top, el.offsetWidth, el.offsetHeight) : prev));
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [onClose]);

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

  // ---- Drag the window by its header (writes position straight to the DOM) ----
  function onHeaderPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button")) return; // let the close button work
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = 'url("/closedhand.svg") 16 16, grabbing';
  }
  function onHeaderPointerMove(e: React.PointerEvent) {
    const el = panelRef.current;
    if (!drag.current || !el) return;
    const p = clampPos(e.clientX - drag.current.dx, e.clientY - drag.current.dy, el.offsetWidth, el.offsetHeight);
    el.style.left = `${p.left}px`;
    el.style.top = `${p.top}px`;
  }
  function onHeaderPointerUp(e: React.PointerEvent) {
    const el = panelRef.current;
    if (!drag.current || !el) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    setPos({ left: parseFloat(el.style.left), top: parseFloat(el.style.top) });
  }

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
    <div
      ref={panelRef}
      popover="manual"
      className={styles.askPanel}
      style={{ left: pos?.left, top: pos?.top, visibility: pos ? undefined : "hidden" }}
    >
      <div
        className={styles.askHeader}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
      >
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
    </div>
  );
}
