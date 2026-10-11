"use client";

import { useEffect, useRef, useState } from "react";
import { Popover } from "@base-ui-components/react/popover";
import { HIGHLIGHT_COLORS } from "./types";
import { NoteIcon } from "./NoteIcon";
import { READING_MODES, type ReadingMode } from "./readingMode";
import styles from "./Toolbar.module.css";

interface Props {
  toolbarRef: React.Ref<HTMLDivElement>;
  flashOpen: boolean;
  onToggleFlashcards: () => void;
  onNewFlashcard: () => void;
  outlineOpen: boolean;
  onToggleOutline: () => void;
  currentPage: number;
  numPages: number;
  onGoToPage: (n: number) => void;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  readingMode: ReadingMode;
  onReadingModeChange: (mode: ReadingMode) => void;
  activeColor: string;
  onColorChange: (color: string) => void;
  aiMode: boolean;
  onToggleAi: () => void;
  noteMode: boolean;
  onToggleNote: () => void;
}

export function Toolbar({
  toolbarRef,
  flashOpen,
  onToggleFlashcards,
  onNewFlashcard,
  outlineOpen,
  onToggleOutline,
  currentPage,
  numPages,
  onGoToPage,
  scale,
  onZoomIn,
  onZoomOut,
  readingMode,
  onReadingModeChange,
  activeColor,
  onColorChange,
  aiMode,
  onToggleAi,
  noteMode,
  onToggleNote,
}: Props) {
  const [draft, setDraft] = useState(String(currentPage));
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the box in sync with scrolling, but don't clobber the user mid-type.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(String(currentPage));
  }, [currentPage]);

  function commit() {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n)) onGoToPage(n);
    setDraft(String(currentPage));
  }

  return (
    <div className={styles.toolbar} ref={toolbarRef}>
      <button
        className={`${styles.toolBtn} ${styles.penBtn}`}
        data-active={outlineOpen || undefined}
        onClick={onToggleOutline}
        aria-label="Contents"
        aria-pressed={outlineOpen}
        title="Contents — jump to a section (Ctrl/⌘+B)"
        aria-keyshortcuts="Control+B Meta+B"
      >
        <OutlineIcon />
      </button>
      <span className={styles.divider} aria-hidden />

      {numPages > 0 && (
        <>
          <input
            ref={inputRef}
            className={styles.pageInput}
            style={{ width: `${Math.max(draft.length, String(numPages).length)}ch` }}
            inputMode="numeric"
            aria-label="Current page"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            onBlur={commit}
            onFocus={(e) => e.currentTarget.select()}
          />
          <span className={styles.pageTotal}>of {numPages}</span>
          <span className={styles.divider} aria-hidden />
        </>
      )}
      <button className={styles.toolBtn} onClick={onZoomOut} aria-label="Zoom out">
        −
      </button>
      <span className={styles.zoom}>{Math.round(scale * 100)}%</span>
      <button className={styles.toolBtn} onClick={onZoomIn} aria-label="Zoom in">
        +
      </button>

      <span className={styles.divider} aria-hidden />

      <Popover.Root>
        <Popover.Trigger
          className={styles.toolBtn}
          aria-label="Reading mode"
          title={`Reading mode: ${READING_MODES.find((m) => m.value === readingMode)?.label}`}
        >
          <ReadingModeIcon mode={readingMode} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="top" sideOffset={10}>
            <Popover.Popup className={styles.modePopup}>
              {READING_MODES.map(({ value, label }) => (
                <Popover.Close
                  key={value}
                  className={styles.modeItem}
                  aria-pressed={value === readingMode}
                  data-active={value === readingMode || undefined}
                  onClick={() => onReadingModeChange(value)}
                >
                  <ReadingModeIcon mode={value} />
                  {label}
                </Popover.Close>
              ))}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      <span className={styles.divider} aria-hidden />

      <Popover.Root>
        <Popover.Trigger className={styles.toolBtn} aria-label="Highlight color">
          <span className={styles.penSwatch} style={{ background: activeColor }} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="top" sideOffset={10}>
            <Popover.Popup className={styles.colorPopup}>
              {HIGHLIGHT_COLORS.map((color) => (
                <Popover.Close
                  key={color}
                  className={styles.colorDot}
                  style={{ background: color }}
                  aria-label={`Use ${color}`}
                  data-active={color === activeColor || undefined}
                  onClick={() => onColorChange(color)}
                />
              ))}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      <button
        className={`${styles.toolBtn} ${styles.penBtn}`}
        data-active={aiMode || undefined}
        onClick={onToggleAi}
        aria-label="AI pen"
        aria-pressed={aiMode}
        title="AI pen — select a region to ask about"
      >
        <AiPenIcon />
      </button>

      <button
        className={`${styles.toolBtn} ${styles.penBtn}`}
        data-active={noteMode || undefined}
        onClick={onToggleNote}
        aria-label="Note pen"
        aria-pressed={noteMode}
        title="Note pen — select a region to note"
      >
        <NoteIcon />
      </button>

      <span className={styles.divider} aria-hidden />

      <button
        className={`${styles.toolBtn} ${styles.penBtn}`}
        data-active={flashOpen || undefined}
        onClick={onToggleFlashcards}
        aria-label="Flashcards"
        aria-pressed={flashOpen}
        title="Flashcards — review this document's cards (F)"
        aria-keyshortcuts="F"
      >
        <FlashcardsIcon />
      </button>
      <button
        className={`${styles.toolBtn} ${styles.penBtn}`}
        onClick={onNewFlashcard}
        aria-label="New flashcard"
        title="New flashcard (Shift+F)"
        aria-keyshortcuts="Shift+F"
      >
        <NewFlashcardIcon />
      </button>
    </div>
  );
}

function ReadingModeIcon({ mode }: { mode: ReadingMode }) {
  if (mode === "dark") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (mode === "sepia") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FlashcardsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.5" y="7" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M7.5 4h11A2 2 0 0 1 20.5 6v11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NewFlashcardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.5" y="5" width="17" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 9v6M9 12h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function OutlineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16M8 12h12M8 18h12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AiPenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20l4-1 10-10-3-3L5 16l-1 4z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M14 6l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
