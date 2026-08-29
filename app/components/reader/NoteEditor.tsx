"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NOTE_COLOR, type Highlight, type NormRect } from "./types";
import { NoteIcon } from "./NoteIcon";
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

interface Pos {
  left: number;
  top: number;
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

export function NoteEditor({ documentId, anchorRect, anchor, onClose, onSaved }: Props) {
  const [text, setText] = useState(anchor.kind === "existing" ? anchor.highlight.note ?? "" : "");
  const [saving, setSaving] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

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
      style={{ left: pos?.left, top: pos?.top, visibility: pos ? undefined : "hidden" }}
    >
      <div
        className={styles.noteHeader}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
      >
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
