"use client";

import { useEffect, useRef, useState } from "react";
import { AnnotationList } from "./AnnotationList";
import { activeOutlineId, ancestorIds, type OutlineNode } from "./outline";
import type { Highlight } from "./types";
import styles from "./OutlinePanel.module.css";

type Tab = "contents" | "notes";
const TAB_KEY = "parrot.sidebarTab";

interface Props {
  /** null while the outline is still loading. */
  nodes: OutlineNode[] | null;
  highlights: Highlight[];
  currentPage: number;
  onSelect: (node: OutlineNode) => void;
  onJump: (page: number, y: number) => void;
  onClose: () => void;
}

/** The reader sidebar: the PDF's contents, or a list of this document's highlights and notes. */
export function OutlinePanel({ nodes, highlights, currentPage, onSelect, onJump, onClose }: Props) {
  // Only ever mounted client-side (after the PDF loads or a click), so reading storage here
  // can't cause a hydration mismatch.
  const [tab, setTab] = useState<Tab>(() => {
    try {
      return localStorage.getItem(TAB_KEY) === "notes" ? "notes" : "contents";
    } catch {
      return "contents";
    }
  });
  function selectTab(next: Tab) {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {}
  }

  const activeId = nodes ? activeOutlineId(nodes, currentPage) : null;
  // Explicit user toggles; anything not listed falls back to the default (collapsed).
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const listRef = useRef<HTMLDivElement>(null);

  // The active section's ancestors are always expanded so its row is visible.
  const forced = new Set(activeId ? ancestorIds(activeId) : []);
  const isOpen = (id: string) => toggled[id] ?? forced.has(id);

  // Keep the active row in view as the reader scrolls (and when switching back to Contents).
  useEffect(() => {
    listRef.current
      ?.querySelector("[data-active]")
      ?.scrollIntoView({ block: "nearest" });
  }, [activeId, tab]);

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
    <aside className={styles.outline} aria-label="Sidebar">
      <div className={styles.outlineHeader}>
        <div className={styles.tabs} role="tablist">
          <button
            role="tab"
            className={styles.tab}
            aria-selected={tab === "contents"}
            onClick={() => selectTab("contents")}
          >
            Contents
          </button>
          <button
            role="tab"
            className={styles.tab}
            aria-selected={tab === "notes"}
            onClick={() => selectTab("notes")}
          >
            Notes{highlights.length > 0 && <span className={styles.tabCount}>{highlights.length}</span>}
          </button>
        </div>
        <button className={styles.outlineClose} onClick={onClose} aria-label="Close sidebar">
          ×
        </button>
      </div>
      <div className={styles.outlineBody} ref={listRef} role="tabpanel">
        {tab === "notes" ? (
          <AnnotationList highlights={highlights} onJump={onJump} />
        ) : nodes === null ? (
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
