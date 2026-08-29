"use client";

import { Popover } from "@base-ui-components/react/popover";
import styles from "./Reader.module.css";

interface Props {
  anchorRect: DOMRect | null;
  onCopy: () => void;
  onHighlight: () => void;
  onAsk: () => void;
  onNote: () => void;
  onClose: () => void;
}

/** Popup shown over a text selection: Copy / Highlight / Ask Parrot / Note. */
export function SelectionMenu({ anchorRect, onCopy, onHighlight, onAsk, onNote, onClose }: Props) {
  const open = anchorRect !== null;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Popover.Portal>
        <Popover.Positioner
          side="top"
          sideOffset={6}
          anchor={anchorRect ? () => ({ getBoundingClientRect: () => anchorRect }) : undefined}
        >
          <Popover.Popup className={styles.selectionMenu}>
            <button className={styles.menuItem} onClick={onCopy}>
              Copy
            </button>
            <button className={styles.menuItem} onClick={onHighlight}>
              Highlight
            </button>
            <button className={styles.menuItem} onClick={onAsk}>
              Ask Parrot
            </button>
            <button className={styles.menuItem} onClick={onNote}>
              Note
            </button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
