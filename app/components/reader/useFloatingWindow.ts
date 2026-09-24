"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

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

/**
 * A draggable top-layer window (Popover API, `popover="manual"`), shared by Ask Parrot and
 * the note editor. Opens near `anchorRect` (or centered), stays clamped to the viewport,
 * closes on Escape, and drags by whatever element receives `headerProps`.
 */
export function useFloatingWindow(anchorRect: DOMRect | null, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);

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
    // Initial placement only — the anchor isn't live.
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
  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button")) return; // let the close button work
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = 'url("/closedhand.svg") 16 16, grabbing';
  }
  function onPointerMove(e: React.PointerEvent) {
    const el = panelRef.current;
    if (!drag.current || !el) return;
    const p = clampPos(e.clientX - drag.current.dx, e.clientY - drag.current.dy, el.offsetWidth, el.offsetHeight);
    el.style.left = `${p.left}px`;
    el.style.top = `${p.top}px`;
  }
  function onPointerUp(e: React.PointerEvent) {
    const el = panelRef.current;
    if (!drag.current || !el) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    setPos({ left: parseFloat(el.style.left), top: parseFloat(el.style.top) });
  }

  const style: React.CSSProperties = {
    left: pos?.left,
    top: pos?.top,
    visibility: pos ? undefined : "hidden",
  };

  return { panelRef, style, headerProps: { onPointerDown, onPointerMove, onPointerUp } };
}
