"use client";

import { useEffect, useRef, useState } from "react";
import { activeOutlineId, ancestorIds, type OutlineNode } from "./outline";
import styles from "./Reader.module.css";

interface Props {
  /** null while the outline is still loading. */
  nodes: OutlineNode[] | null;
  currentPage: number;
  onSelect: (node: OutlineNode) => void;
  onClose: () => void;
}

export function OutlinePanel({ nodes, currentPage, onSelect, onClose }: Props) {
  const activeId = nodes ? activeOutlineId(nodes, currentPage) : null;
  // Explicit user toggles; anything not listed falls back to the default (collapsed).
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const listRef = useRef<HTMLDivElement>(null);

  // The active section's ancestors are always expanded so its row is visible.
  const forced = new Set(activeId ? ancestorIds(activeId) : []);
  const isOpen = (id: string) => toggled[id] ?? forced.has(id);

  // Keep the active row in view as the reader scrolls.
  useEffect(() => {
    listRef.current
      ?.querySelector("[data-active]")
      ?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  function renderList(list: OutlineNode[], depth: number) {
    return (
      <ul className={styles.outlineList}>
        {list.map((node) => {
          const hasChildren = node.children.length > 0;
          const open = hasChildren && isOpen(node.id);
          return (
            <li key={node.id}>
              <div
                className={styles.outlineRow}
                data-active={node.id === activeId || undefined}
                style={{ paddingLeft: 4 + depth * 14 }}
              >
                {hasChildren ? (
                  <button
                    className={styles.outlineChevron}
                    data-open={open || undefined}
                    aria-label={open ? "Collapse" : "Expand"}
                    aria-expanded={open}
                    onClick={() => setToggled((t) => ({ ...t, [node.id]: !open }))}
                  >
                    <ChevronIcon />
                  </button>
                ) : (
                  <span className={styles.outlineChevronSpacer} aria-hidden />
                )}
                <button
                  className={styles.outlineItem}
                  disabled={node.page === null}
                  title={node.title}
                  onClick={() => onSelect(node)}
                >
                  <span className={styles.outlineTitle}>{node.title}</span>
                  {node.page !== null && <span className={styles.outlinePage}>{node.page}</span>}
                </button>
              </div>
              {open && renderList(node.children, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <aside className={styles.outline} aria-label="Contents">
      <div className={styles.outlineHeader}>
        <span>Contents</span>
        <button className={styles.outlineClose} onClick={onClose} aria-label="Close contents">
          ×
        </button>
      </div>
      <div className={styles.outlineBody} ref={listRef}>
        {nodes === null ? (
          <p className={styles.outlineEmpty}>Loading outline…</p>
        ) : nodes.length === 0 ? (
          <p className={styles.outlineEmpty}>This PDF has no outline.</p>
        ) : (
          renderList(nodes, 0)
        )}
      </div>
    </aside>
  );
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
