"use client";

import { useCallback, useLayoutEffect, useState } from "react";

export type ReadingMode = "light" | "sepia" | "dark";

export const READING_MODES: { value: ReadingMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "sepia", label: "Sepia" },
  { value: "dark", label: "Dark" },
];

const KEY = "parrot.readingMode";

function isMode(v: unknown): v is ReadingMode {
  return v === "light" || v === "sepia" || v === "dark";
}

/**
 * The reader's display mode, remembered per browser. It's applied as `data-reading` on
 * <html> (so portalled popovers inherit the theme tokens in globals.css) and removed when
 * the reader unmounts, leaving the library light.
 */
export function useReadingMode(): [ReadingMode, (mode: ReadingMode) => void] {
  const [mode, setModeState] = useState<ReadingMode>("light");

  // Read client-side only (keeps hydration clean), before paint to avoid a light flash.
  useLayoutEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (isMode(saved)) setModeState(saved);
    } catch {}
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (mode !== "light") root.dataset.reading = mode;
    return () => {
      delete root.dataset.reading;
    };
  }, [mode]);

  const setMode = useCallback((next: ReadingMode) => {
    setModeState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  }, []);

  return [mode, setMode];
}
