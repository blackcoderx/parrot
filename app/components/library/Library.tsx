"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@base-ui-components/react/alert-dialog";
import { Dialog } from "@base-ui-components/react/dialog";
import { getJson, sendJson } from "@/components/api";
import { SettingsPopover } from "@/components/settings/SettingsPopover";
import { TimerButton } from "@/components/timer/TimerButton";
import { TrashIcon } from "@/components/TrashIcon";
import type { Deadline, DocumentRow, Subject, SubjectSummary } from "@/types";
import { useNow } from "@/components/timer/TimerProvider";
import {
  MoveMenu,
  PencilIcon,
  StudyNext,
  SubjectChooser,
  SubjectGrid,
  TitleInput,
} from "./Subjects";
import { ThemeButton } from "./ThemeButton";
import { WallCalendar } from "./WallCalendar";
import { lastSubject, uploadPdf } from "./upload";
import styles from "./Library.module.css";

export type LibraryDoc = Pick<DocumentRow, "id" | "title" | "last_page" | "page_count" | "subject_id">;

/**
 * The home screen: a wall calendar counting down to the next deadline, the subject to study
 * next, every subject (neglected ones first), the file you were last reading (every file is in
 * the All files dialog), a new PDF, and the flashcards page (`dueCards` is how many are due).
 */
export function Library({
  initialDocs,
  initialSubjects,
  initialDeadlines,
  dueCards,
}: {
  initialDocs: LibraryDoc[];
  initialSubjects: SubjectSummary[];
  initialDeadlines: Deadline[];
  dueCards: number;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<LibraryDoc[]>(initialDocs);
  const [subjects, setSubjects] = useState<SubjectSummary[]>(initialSubjects);
  const [uploading, setUploading] = useState(false);
  // A picked PDF waiting for its subject to be chosen.
  const [pending, setPending] = useState<File | null>(null);
  const [preselect, setPreselect] = useState<string | null>(null);
  // "Last studied" ages move on their own; a minute's resolution is plenty.
  const now = useNow(true, 60_000);

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const reloadSubjects = useCallback(() => {
    getJson<SubjectSummary[]>("/api/subjects")
      .then(setSubjects)
      .catch(() => {});
  }, []);

  async function remove(id: string) {
    setRecent((prev) => prev.filter((d) => d.id !== id)); // optimistic
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    } catch {
      // Failed — resync the list from the server so nothing is silently lost.
      getJson<LibraryDoc[]>("/api/documents")
        .then(setRecent)
        .catch(() => {});
    }
    reloadSubjects();
  }

  async function rename(id: string, title: string) {
    const previous = recent.find((d) => d.id === id)?.title;
    const setTitle = (t: string) =>
      setRecent((prev) => prev.map((d) => (d.id === id ? { ...d, title: t } : d)));
    setTitle(title); // optimistic
    const res = await sendJson(`/api/documents/${id}`, "PATCH", { title }).catch(() => null);
    if (!res?.ok && previous !== undefined) setTitle(previous);
  }

  async function move(id: string, subjectId: string | null) {
    const previous = recent.find((d) => d.id === id)?.subject_id ?? null;
    const setSubject = (s: string | null) =>
      setRecent((prev) => prev.map((d) => (d.id === id ? { ...d, subject_id: s } : d)));
    setSubject(subjectId); // optimistic
    const res = await sendJson(`/api/documents/${id}`, "PATCH", { subject_id: subjectId }).catch(
      () => null,
    );
    if (!res?.ok) setSubject(previous);
    reloadSubjects();
  }

  const subjectName = (id: string | null) => subjects.find((s) => s.id === id)?.name ?? null;

  function renderRow(doc: LibraryDoc) {
    return (
      <LibraryRow
        key={doc.id}
        doc={doc}
        subjectName={subjectName(doc.subject_id)}
        subjects={subjects}
        onOpen={() => router.push(`/read/${doc.id}`)}
        onRename={(title) => rename(doc.id, title)}
        onMove={(subjectId) => move(doc.id, subjectId)}
        onRemove={() => remove(doc.id)}
      />
    );
  }

  async function upload(file: File, subjectId: string | null) {
    setPending(null);
    setUploading(true);
    try {
      router.push(`/read/${await uploadPdf(file, subjectId)}`);
    } catch {
      setUploading(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    if (subjects.length === 0) {
      upload(file, null);
    } else {
      setPreselect(lastSubject());
      setPending(file);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <header className={styles.topBar}>
          <h1 className={styles.wordmark}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/parrot-logo.png" alt="" className={styles.logo} />
            Parrot<span className={styles.dot}>.</span>
          </h1>

          <div className={styles.topActions}>
            <button className={styles.topBtn} onClick={openPicker} disabled={uploading}>
              {uploading ? "Opening…" : "New file"}
            </button>
            <Link href="/flashcards" className={styles.topBtn}>
              Flashcards
              {dueCards > 0 && (
                <span className={styles.dueBadge} title="Cards due for review">
                  {dueCards} due
                </span>
              )}
            </Link>
            <Link href="/clips" className={styles.topBtn}>
              Web clips
            </Link>
          </div>
        </header>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={onFile}
        />
        <SubjectChooser
          open={pending !== null}
          subjects={subjects}
          preselect={preselect}
          onChoose={(subjectId) => pending && upload(pending, subjectId)}
          onCancel={() => setPending(null)}
        />

        <WallCalendar initialDeadlines={initialDeadlines} now={now} />

        <StudyNext subjects={subjects} now={now} />

        <SubjectGrid subjects={subjects} now={now} onChange={setSubjects} />

        {recent.length > 0 && (
          <section className={styles.recent}>
            <div className={styles.recentHeader}>
              <h2 className={styles.recentTitle}>Continue reading</h2>
              <AllFiles docs={recent} renderRow={renderRow} />
            </div>
            <ul className={styles.list}>{renderRow(recent[0])}</ul>
          </section>
        )}
      </main>

      <div className={styles.settings}>
        <SettingsPopover />
        <ThemeButton className={styles.timerBtn} />
        <TimerButton className={styles.timerBtn} clockClassName={styles.timerClock} />
      </div>
    </div>
  );
}

/** Every file, most recently opened first, in a scrollable dialog with a search box. */
function AllFiles({
  docs,
  renderRow,
}: {
  docs: LibraryDoc[];
  renderRow: (doc: LibraryDoc) => React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? docs.filter((d) => d.title.toLowerCase().includes(q)) : docs;

  return (
    <Dialog.Root onOpenChange={(open) => !open && setQuery("")}>
      <Dialog.Trigger className={styles.allTrigger} aria-label="View all files" title="View all">
        <ArrowIcon />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.allBackdrop} />
        <Dialog.Popup className={styles.allPopup}>
          <div className={styles.allHeader}>
            <Dialog.Title className={styles.allTitle}>All files</Dialog.Title>
            <span className={styles.allCount}>{docs.length}</span>
            <Dialog.Close className={styles.allClose} aria-label="Close">
              ×
            </Dialog.Close>
          </div>
          <input
            className={styles.allSearch}
            type="search"
            placeholder="Search files"
            aria-label="Search files"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {shown.length === 0 ? (
            <p className={styles.empty}>No files match.</p>
          ) : (
            <ul className={`${styles.list} ${styles.allList}`}>{shown.map(renderRow)}</ul>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface RowProps {
  doc: LibraryDoc;
  /** The doc's subject, shown after its title; null when Unsorted. */
  subjectName: string | null;
  /** Subjects it can be moved to; the move action is hidden when there are none. */
  subjects: Subject[];
  onOpen: () => void;
  onRename: (title: string) => void;
  onMove: (subjectId: string | null) => void;
  onRemove: () => void;
}

/** One document: open it, rename it inline, move it to a subject, or remove it (after confirming). */
export function LibraryRow({ doc, subjectName, subjects, onOpen, onRename, onMove, onRemove }: RowProps) {
  const [editing, setEditing] = useState(false);

  return (
    <li className={styles.rowWrap}>
      {editing ? (
        <TitleInput
          label="Document title"
          defaultValue={doc.title}
          maxLength={200}
          onDone={(title) => {
            setEditing(false);
            if (title && title !== doc.title) onRename(title);
          }}
        />
      ) : (
        <button className={styles.row} onClick={onOpen}>
          <span className={styles.rowTitle}>{doc.title}</span>
          {subjectName && <span className={styles.rowSubject}>{subjectName}</span>}
        </button>
      )}

      {/* One slot at the right edge: the reading progress, which flips over on hover (or
          keyboard focus) like a card to reveal the rename / move / remove actions on its back. */}
      {!editing && (
        <div className={styles.rowSide}>
          <div className={styles.flip}>
            <span className={`${styles.face} ${styles.front}`} title="Last page read">
              {doc.page_count !== null && `p. ${doc.last_page} / ${doc.page_count}`}
            </span>

            <div className={`${styles.face} ${styles.back}`}>
              <button
                className={`${styles.rowAction} ${styles.rowEdit}`}
                onClick={() => setEditing(true)}
                aria-label={`Rename ${doc.title}`}
                title="Rename"
              >
                <PencilIcon />
              </button>

              {subjects.length > 0 && (
                <MoveMenu
                  title={doc.title}
                  current={doc.subject_id}
                  subjects={subjects}
                  onMove={onMove}
                />
              )}

              <AlertDialog.Root>
                <AlertDialog.Trigger
                  className={`${styles.rowAction} ${styles.rowDelete}`}
                  aria-label={`Remove ${doc.title}`}
                  title="Remove"
                >
                  <TrashIcon />
                </AlertDialog.Trigger>
                <AlertDialog.Portal>
                  <AlertDialog.Backdrop className={styles.dialogBackdrop} />
                  <AlertDialog.Popup className={styles.dialogPopup}>
                    <AlertDialog.Title className={styles.dialogTitle}>
                      Remove “{doc.title}”?
                    </AlertDialog.Title>
                    <AlertDialog.Description className={styles.dialogDesc}>
                      This permanently deletes the file along with its highlights and AI
                      conversations.
                    </AlertDialog.Description>
                    <div className={styles.dialogActions}>
                      <AlertDialog.Close className={styles.dialogCancel}>Cancel</AlertDialog.Close>
                      <AlertDialog.Close className={styles.dialogConfirm} onClick={onRemove}>
                        Remove
                      </AlertDialog.Close>
                    </div>
                  </AlertDialog.Popup>
                </AlertDialog.Portal>
              </AlertDialog.Root>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function ArrowIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 17L17 7M9 7h8v8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
