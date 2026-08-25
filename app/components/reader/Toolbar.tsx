"use client";

import { Popover } from "@base-ui-components/react/popover";
import { HIGHLIGHT_COLORS } from "./types";
import styles from "./Reader.module.css";

interface Props {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  activeColor: string;
  onColorChange: (color: string) => void;
  aiMode: boolean;
  onToggleAi: () => void;
}

export function Toolbar({
  scale,
  onZoomIn,
  onZoomOut,
  activeColor,
  onColorChange,
  aiMode,
  onToggleAi,
}: Props) {
  return (
    <div className={styles.toolbar}>
      <button className={styles.toolBtn} onClick={onZoomOut} aria-label="Zoom out">
        −
      </button>
      <span className={styles.zoom}>{Math.round(scale * 100)}%</span>
      <button className={styles.toolBtn} onClick={onZoomIn} aria-label="Zoom in">
        +
      </button>

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
    </div>
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
