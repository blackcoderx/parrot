"use client";

import { useRef, useState } from "react";
import type { NormRect } from "./types";
import styles from "./Reader.module.css";

interface Props {
  pageNumber: number;
  onRegion: (page: number, rect: NormRect, image: string, anchorRect: DOMRect) => void;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Active in AI-pen mode: drag a rectangle over the page, then crop that region
 * from the rendered page canvas and hand it back as a PNG data URL.
 */
export function AiPenLayer({ pageNumber, onRegion }: Props) {
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
    const canvas = layer.parentElement?.querySelector("canvas");
    if (!canvas) return;

    // Crop the region from the page canvas (canvas covers the page box exactly).
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const tmp = document.createElement("canvas");
    tmp.width = Math.round(b.w * scaleX);
    tmp.height = Math.round(b.h * scaleY);
    const ctx = tmp.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(
      canvas,
      b.x * scaleX,
      b.y * scaleY,
      b.w * scaleX,
      b.h * scaleY,
      0,
      0,
      tmp.width,
      tmp.height,
    );

    const image = tmp.toDataURL("image/png");
    const norm: NormRect = { x: b.x / rect.width, y: b.y / rect.height, w: b.w / rect.width, h: b.h / rect.height };
    const anchorRect = new DOMRect(rect.left + b.x, rect.top + b.y, b.w, b.h);
    onRegion(pageNumber, norm, image, anchorRect);
  }

  return (
    <div
      ref={ref}
      className={styles.aiPenLayer}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {box && (
        <div
          className={styles.aiPenBox}
          style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        />
      )}
    </div>
  );
}
