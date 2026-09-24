"use client";

import { useState } from "react";
import { NOTE_COLOR, type Highlight, type NormRect } from "./types";
import { NoteIcon } from "./NoteIcon";
import { useFloatingWindow } from "./useFloatingWindow";
import styles from "./Reader.module.css";

/** What a note anchors to. */
export type NoteAnchor =
  | { kind: "selection"; page: number; rects: NormRect[]; text: string }
  | { kind: "region"; page: number; rect: NormRect }
  | { kind: "existing"; highlight: Highlight };

interface Props {
  documentId: string;
  /** Rect used only for the window's initial placement (not a live anchor). */
  anchorRect: DOMRect | null;
  anchor: NoteAnchor;
  onClose: () => void;
  onSaved: () => void;
}

export function NoteEditor({ documentId, anchorRect, anchor, onClose, onSaved }: Props) {
  const [text, setText] = useState(anchor.kind === "existing" ? anchor.highlight.note ?? "" : "");
  const [saving, setSaving] = useState(false);
  const { panelRef, style, headerProps } = useFloatingWindow(anchorRect, onClose);

  async function save() {
    const note = text.trim();
    if (!note || saving) return;
    setSaving(true);

    let res: Response;
    if (anchor.kind === "existing") {
      res = await fetch(`/api/highlights/${anchor.highlight.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
    } else {
      const rects = anchor.kind === "selection" ? anchor.rects : [anchor.rect];
      const highlightText = anchor.kind === "selection" ? anchor.text : "";
      res = await fetch("/api/highlights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          page: anchor.page,
          rects,
          color: NOTE_COLOR,
          text: highlightText,
          note,
        }),
      });
    }

    setSaving(false);
    if (res.ok) {
      onSaved();
      onClose();
    }
  }

  async function remove() {
    if (anchor.kind !== "existing") return;
    await fetch(`/api/highlights/${anchor.highlight.id}`, { method: "DELETE" });
    onSaved();
    onClose();
  }

  const isExisting = anchor.kind === "existing";

  return (
    <div
      ref={panelRef}
      popover="manual"
      className={styles.notePanel}
      style={style}
    >
      <div className={styles.noteHeader} {...headerProps}>
        <span className={styles.noteTitleRow}>
          <NoteIcon size={15} />
          <span className={styles.noteTitle}>Note</span>
        </span>
        <button className={styles.askClose} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <textarea
        className={styles.noteTextarea}
        value={text}
        placeholder="Write your note…"
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
        }}
      />

      <div className={styles.noteActions}>
        {isExisting && (
          <button className={styles.noteDelete} onClick={remove}>
            Delete
          </button>
        )}
        <button className={styles.askSave} onClick={save} disabled={!text.trim() || saving}>
          {saving ? "…" : "Save"}
        </button>
      </div>
    </div>
  );
}
