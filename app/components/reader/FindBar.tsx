"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { findMatches, type PageText } from "./find";
import styles from "./FindBar.module.css";

interface Props {
  /** Resolves the document's text (cached by the caller, so reopening the bar is instant). */
  loadText: (onProgress: (done: number, total: number) => void) => Promise<PageText>;
  /** Changes whenever Ctrl/Cmd+F is pressed again while the bar is open, to refocus it. */
  focusKey: number;
  onQueryChange: (query: string) => void;
  onJump: (page: number, y: number) => void;
  onClose: () => void;
}

/**
 * Find in document. The browser's own find can't see pages that aren't rendered (the viewer
 * only mounts pages near the viewport), so this searches the text pdf.js extracts instead.
 */
export function FindBar({ loadText, focusKey, onQueryChange, onJump, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [text, setText] = useState<PageText | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Index of the match last jumped to; -1 until the first Enter after a new query.
  const [index, setIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadText((done, total) => !cancelled && setProgress({ done, total })).then(
      (t) => !cancelled && setText(t),
    );
    return () => {
      cancelled = true;
    };
  }, [loadText]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusKey]);

  const matches = useMemo(() => (text ? findMatches(text, query) : []), [text, query]);

  function step(delta: 1 | -1) {
    if (!matches.length) return;
    const next = index === -1 ? (delta === 1 ? 0 : matches.length - 1) : index + delta;
    const wrapped = (next + matches.length) % matches.length;
    setIndex(wrapped);
    onJump(matches[wrapped].page, matches[wrapped].y);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key.toLowerCase() === "f" && (e.ctrlKey || e.metaKey)) {
      // Already in the bar: keep the browser's find out of the way, just reselect.
      e.preventDefault();
      inputRef.current?.select();
    }
  }

  let status: string;
  if (!text) status = progress ? `Indexing ${progress.done}/${progress.total}` : "Indexing…";
  else if (!query.trim()) status = "";
  else if (!matches.length) status = "No matches";
  else status = index === -1 ? `${matches.length} found` : `${index + 1} / ${matches.length}`;

  return (
    <div className={styles.findBar} role="search">
      <input
        ref={inputRef}
        className={styles.findInput}
        value={query}
        placeholder="Find in document"
        aria-label="Find in document"
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(-1);
          onQueryChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      <span className={styles.findStatus} aria-live="polite">
        {status}
      </span>
      <button
        className={styles.findBtn}
        onClick={() => step(-1)}
        disabled={!matches.length}
        aria-label="Previous match"
        title="Previous (Shift+Enter)"
      >
        <Chevron up />
      </button>
      <button
        className={styles.findBtn}
        onClick={() => step(1)}
        disabled={!matches.length}
        aria-label="Next match"
        title="Next (Enter)"
      >
        <Chevron />
      </button>
      <button className={styles.findBtn} onClick={onClose} aria-label="Close find" title="Close (Esc)">
        ×
      </button>
    </div>
  );
}

function Chevron({ up }: { up?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
