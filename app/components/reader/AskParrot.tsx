"use client";

import { useEffect, useRef, useState } from "react";
import { getJson, sendJson } from "@/components/api";
import { TrashIcon } from "@/components/TrashIcon";
import { BookmarkIcon, ChatComposer, ChatMessages } from "@/components/chat/ChatThread";
import { textOf, useParrotChat, type SavedMessage } from "@/components/chat/useParrotChat";
import type { NormRect } from "./types";
import { useFloatingWindow } from "@/components/useFloatingWindow";
import buttons from "./buttons.module.css";
import styles from "./AskParrot.module.css";

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

export function AskParrot({ documentId, title, anchorRect, anchor, onClose, onSaved }: Props) {
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The highlight this thread is anchored to once saved. Set from the first
  // save's response so re-saves upsert in place instead of creating duplicates.
  const [savedHighlightId, setSavedHighlightId] = useState<string | null>(
    anchor.kind === "existing" ? anchor.highlightId : null,
  );
  // Once anchored, re-saves upsert in place and the thread can be deleted.
  const anchoredId = anchor.kind === "existing" ? anchor.highlightId : savedHighlightId;
  const { panelRef, style, headerProps } = useFloatingWindow(anchorRect, onClose);
  // Holds the latest save action for the window-level Ctrl/Cmd+Enter shortcut,
  // so the keydown listener can stay stable without a stale closure.
  const saveRef = useRef<() => void>(() => {});

  const regionImage = anchor.kind === "region" ? anchor.image : null;
  const chat = useParrotChat(
    { title, text: anchor.kind === "selection" ? anchor.text : undefined },
    regionImage,
  );
  const { messages, busy, seed } = chat;

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
    getJson<{ messages: SavedMessage[] }>(`/api/chats?highlightId=${anchor.highlightId}`)
      .then((d) => seed(d.messages))
      .catch(() => {});
    // seed is recreated each render; reload only when the anchor changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  async function save() {
    const simplified = messages.map((m, i) => ({
      role: m.role,
      content: textOf(m),
      image: i === 0 && anchor.kind === "region" ? anchor.image : null,
    }));

    // Once anchored to a highlight, re-saves go through the upsert path (the
    // server reuses the chat and replaces its messages) — no duplicate rows.
    // Not anchored yet: send the highlight to create alongside the thread.
    let highlight;
    if (!anchoredId) {
      if (anchor.kind === "existing") return; // always has an id, so this is unreachable
      // Chat highlights render from the accent via CSS; this is only a fallback color.
      const color =
        getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#71F79F";
      highlight =
        anchor.kind === "region"
          ? { page: anchor.page, rects: [anchor.rect], color, text: "" }
          : { page: anchor.page, rects: anchor.rects, color, text: anchor.text };
    }

    const res = await sendJson("/api/chats", "POST", {
      documentId,
      highlightId: anchoredId ?? undefined,
      highlight,
      messages: simplified,
    });
    if (res.ok) {
      const data: { highlightId?: string } = await res.json().catch(() => ({}));
      if (data.highlightId) setSavedHighlightId(data.highlightId);
      setSaved(true);
      onSaved();
    }
  }

  // Delete the thread along with its highlight (the server removes the chat too).
  async function removeThread() {
    if (!anchoredId) return;
    const res = await fetch(`/api/highlights/${anchoredId}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return setConfirmDelete(false);
    onSaved();
    onClose();
  }

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
        <span className={styles.askHeaderActions}>
          <button
            className={`${styles.askIconBtn} ${styles.askSaveBtn}`}
            onClick={save}
            disabled={!canSave}
            data-saved={saved || undefined}
            aria-label={saved ? "Saved" : "Save thread"}
            title={saved ? "Saved" : "Save thread (Ctrl+Enter)"}
          >
            <BookmarkIcon filled={saved} />
          </button>
          {anchoredId && (
            <button
              className={styles.askIconBtn}
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete thread"
              title="Delete thread"
            >
              <TrashIcon size={14} />
            </button>
          )}
          <button className={buttons.askClose} onClick={onClose} aria-label="Close" title="Close (Esc)">
            ×
          </button>
        </span>
      </div>

      {regionImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={regionImage} alt="Selected region" className={styles.askRegion} />
      )}

      <ChatMessages
        chat={chat}
        emptyText={
          anchor.kind === "region" ? "Ask about the selected region." : "Ask about the selected text."
        }
      />

      {confirmDelete ? (
        <div className={styles.askInputRow}>
          <span className={styles.askConfirm}>Delete this thread and its highlight?</span>
          <button className={buttons.askSave} onClick={() => setConfirmDelete(false)} autoFocus>
            Cancel
          </button>
          <button className={styles.askDanger} onClick={removeThread}>
            Delete
          </button>
        </div>
      ) : (
        <ChatComposer chat={chat} onSent={() => setSaved(false)} />
      )}
    </div>
  );
}
