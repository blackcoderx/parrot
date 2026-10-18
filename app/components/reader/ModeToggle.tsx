"use client";

import styles from "./ModeToggle.module.css";

/** The Write / Preview switch for Markdown + LaTeX text (flashcard form, note editor). */
export function ModeToggle({
  preview,
  onChange,
}: {
  preview: boolean;
  onChange: (preview: boolean) => void;
}) {
  return (
    <div className={styles.toggle} role="group" aria-label="Editor mode">
      <button aria-pressed={!preview} onClick={() => onChange(false)}>
        Write
      </button>
      <button aria-pressed={preview} onClick={() => onChange(true)}>
        Preview
      </button>
    </div>
  );
}
