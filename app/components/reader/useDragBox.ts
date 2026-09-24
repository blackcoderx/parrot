"use client";

import { useRef, useState } from "react";

/** A dragged rectangle in CSS px, relative to the layer's top-left. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Drags smaller than this (px, either side) are treated as stray clicks. */
const MIN_SIZE = 8;

/**
 * Drag a rectangle over a page overlay (shared by the AI and note pens). `onDone` gets the
 * finished box plus the layer element and its viewport rect; tiny drags are ignored.
 */
export function useDragBox(onDone: (box: Box, layer: HTMLDivElement, layerRect: DOMRect) => void) {
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
    if (!layer || !b || b.w < MIN_SIZE || b.h < MIN_SIZE) return;
    onDone(b, layer, layer.getBoundingClientRect());
  }

  return {
    ref,
    box,
    handlers: { onMouseDown, onMouseMove, onMouseUp, onMouseLeave: onMouseUp },
  };
}

/** A box as page-normalized (0..1) coordinates, plus its viewport rect for anchoring. */
export function normalizeBox(b: Box, layerRect: DOMRect) {
  return {
    norm: {
      x: b.x / layerRect.width,
      y: b.y / layerRect.height,
      w: b.w / layerRect.width,
      h: b.h / layerRect.height,
    },
    anchorRect: new DOMRect(layerRect.left + b.x, layerRect.top + b.y, b.w, b.h),
  };
}
