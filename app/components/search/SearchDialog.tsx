"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Dialog } from "@base-ui-components/react/dialog";
import { getJson } from "@/components/api";
import { hostOf } from "@/components/clips/links";
import { NoteIcon } from "@/components/reader/NoteIcon";
import type { SearchKind, SearchResult, Subject } from "@/types";
import { Snippet } from "./Snippet";
import styles from "./SearchDialog.module.css";

/** Fired by any "Search" button to open the dialog (Ctrl/⌘+K does the same). */
export const OPEN_SEARCH_EVENT = "parrot:search";

export function openSearch() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}

const KINDS: { value: SearchKind | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "note", label: "Notes" },
  { value: "highlight", label: "Highlights" },
  { value: "clip", label: "Web clips" },
];

/** Where a result opens: the PDF at that note, or the clip on the Web clips page. */
export function resultHref(r: SearchResult): string {
  return r.kind === "clip"
    ? `/clips?clip=${r.id}`
    : `/read/${r.document_id}?page=${r.page}&note=${r.id}`;
}

/**
 * Search every note, highlight and web clip, from anywhere (Ctrl/⌘+K). Mounted once in the root
 * layout. Results come from /api/search as you type; ↑/↓ move, Enter opens.
 */
export function SearchDialog() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // The extension's side panel (/ext) is a separate little window: no global search there.
  const enabled = pathname !== "/ext";

  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, [enabled]);

  return (
    <Dialog.Root open={open && enabled} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.popup} aria-label="Search">
          {open && (
            <SearchBody
              onOpen={(href) => {
                setOpen(false);
                router.push(href);
              }}
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SearchBody({ onOpen }: { onOpen: (href: string) => void }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<SearchKind | "all">("all");
  const [subject, setSubject] = useState<string>(""); // "" = every subject
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(""); // the query `results` are for
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    getJson<Subject[]>("/api/subjects")
      .then(setSubjects)
      .catch(() => {});
  }, []);

  // Search as you type (debounced; a newer search cancels the one in flight).
  const q = query.trim();
  useEffect(() => {
    if (!q) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ q });
    if (kind !== "all") params.set("kind", kind);
    if (subject) params.set("subject", subject);
    const t = setTimeout(() => {
      fetch(`/api/search?${params}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((data: SearchResult[]) => {
          setResults(data);
          setSearched(q);
          setActive(0);
          setFailed(false);
        })
        .catch((err) => {
          if (err?.name !== "AbortError") setFailed(true);
        });
    }, 120);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q, kind, subject]);

  // Keep the highlighted result in view while arrowing through the list.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const shown = q ? results : [];
  const subjectName = (id: string | null) =>
    id === null ? "Unsorted" : (subjects.find((s) => s.id === id)?.name ?? null);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && shown[active]) {
      e.preventDefault();
      onOpen(resultHref(shown[active]));
    }
  }

  return (
    <div className={styles.body} onKeyDown={onKeyDown}>
      <div className={styles.searchRow}>
        <SearchIcon />
        <input
          className={styles.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes, highlights and web clips"
          aria-label="Search"
          autoFocus
          spellCheck={false}
        />
        <Dialog.Close className={styles.close} aria-label="Close">
          Esc
        </Dialog.Close>
      </div>

      <div className={styles.filters}>
        {KINDS.map((k) => (
          <button
            key={k.value}
            className={styles.chip}
            aria-pressed={kind === k.value}
            onClick={() => setKind(k.value)}
          >
            {k.label}
          </button>
        ))}
        <select
          className={styles.subject}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          aria-label="Subject"
        >
          <option value="">Every subject</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value="unsorted">Unsorted</option>
        </select>
      </div>

      <ul className={styles.results} ref={listRef} role="listbox" aria-label="Results">
        {shown.map((r, i) => (
          <li key={`${r.kind}:${r.id}`} role="option" aria-selected={i === active}>
            <button
              className={styles.result}
              data-index={i}
              data-active={i === active || undefined}
              onMouseMove={() => setActive(i)}
              onClick={() => onOpen(resultHref(r))}
            >
              <KindIcon kind={r.kind} />
              <span className={styles.resultText}>
                <Snippet text={r.snippet} />
                <span className={styles.meta}>
                  {r.kind === "clip"
                    ? `${hostOf(r.url)} · ${r.page_title}`
                    : `${r.document_title} · p. ${r.page}`}
                  {subjectName(r.subject_id) && ` · ${subjectName(r.subject_id)}`}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {!q ? (
        <p className={styles.hint}>
          Every note, highlight and web clip, across all your files. Add more words to narrow it down.
        </p>
      ) : failed ? (
        <p className={styles.hint}>Search isn&apos;t available right now.</p>
      ) : searched === q && shown.length === 0 ? (
        <p className={styles.hint}>Nothing matches “{q}”.</p>
      ) : null}

      <div className={styles.footer}>
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> to move
        </span>
        <span>
          <kbd>Enter</kbd> to open
        </span>
        <span>
          <kbd>Esc</kbd> to close
        </span>
      </div>
    </div>
  );
}

function KindIcon({ kind }: { kind: SearchKind }) {
  if (kind === "note") {
    return (
      <span className={styles.kind} data-kind="note" aria-label="Note">
        <NoteIcon size={14} />
      </span>
    );
  }
  if (kind === "clip") {
    return (
      <span className={styles.kind} data-kind="clip" aria-label="Web clip">
        <GlobeIcon />
      </span>
    );
  }
  return (
    <span className={styles.kind} data-kind="highlight" aria-label="Highlight">
      <span className={styles.dot} />
    </span>
  );
}

export function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5S9.6 5.9 12 3.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
