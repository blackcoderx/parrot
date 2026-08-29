"use client";

import { useRef, useState } from "react";
import type { NormRect } from "./types";
import styles from "./Reader.module.css";

interface Props {
  pageNumber: number;
  onRegion: (page: number, rect: NormRect, anchorRect: DOMRect) => void;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Active in note-pen mode: drag a rectangle over the page and hand back the
 * region as a normalized rect (a note anchors to the region — no image needed).
 * Mirrors AiPenLayer's drag, without the canvas crop.
 */
export function NotePenLayer({ pageNumber, onRegion }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState<Box | null>(null);

  function localPoint(e: React.MouseEvent) {
    const rect = ref.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onMouseDown(e: React.MouseEvent) {
    start.current = localPoint(e);
    setBox({ ...start.current, w: 0, h: 0 });
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!start.current) return;
    const p = localPoint(e);
    setBox({
      x: Math.min(start.current.x, p.x),
      y: Math.min(start.current.y, p.y),
      w: Math.abs(p.x - start.current.x),
      h: Math.abs(p.y - start.current.y),
    });
  }

  function onMouseUp() {
    const layer = ref.current;
    const b = box;
    start.current = null;
    setBox(null);
    if (!layer || !b || b.w < 8 || b.h < 8) return;

    const rect = layer.getBoundingClientRect();
    const norm: NormRect = {
      x: b.x / rect.width,
      y: b.y / rect.height,
      w: b.w / rect.width,
      h: b.h / rect.height,
    };
    const anchorRect = new DOMRect(rect.left + b.x, rect.top + b.y, b.w, b.h);
    onRegion(pageNumber, norm, anchorRect);
  }

  return (
    <div
      ref={ref}
      className={styles.notePenLayer}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {box && (
        <div
          className={styles.notePenBox}
          style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        />
      )}
    </div>
  );
}
