"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@base-ui-components/react/alert-dialog";
import { Dialog } from "@base-ui-components/react/dialog";
import { Menu } from "@base-ui-components/react/menu";
import { getJson, sendJson } from "@/components/api";
import {
  formatStudied,
  formatStudiedShort,
  isStale,
  pickStudyNext,
  type StudyNextAction,
} from "@/components/subjects/studied";
import type { Subject, SubjectSummary } from "@/types";
import styles from "./Library.module.css";

const byName = (a: Subject, b: Subject) => a.name.localeCompare(b.name);

const NEXT_LABEL: Record<StudyNextAction, string> = {
  study: "Study now",
  read: "Continue reading",
  add: "Add a file",
};

/**
 * The home screen's suggestion: the one subject that needs you most (see `pickStudyNext`),
 * with a single action — study its cards, read its last file, or give it a file.
 */
export function StudyNext({ subjects, now }: { subjects: SubjectSummary[]; now: number }) {
  if (subjects.length === 0) return null;
  const pick = pickStudyNext(subjects, now);
  if (!pick) {
    return (
      <p className={styles.onTrack}>
        You&apos;re on track: nothing is due and every subject was studied this week.
      </p>
    );
  }

  const { subject: s, action } = pick;
  const href =
    action === "study"
      ? `/subjects/${s.id}?study=1`
      : action === "read"
        ? `/read/${s.last_doc_id}`
        : `/subjects/${s.id}`;
  const newCards = s.study_count - s.due;

  return (
    <section className={styles.next} aria-label="Study next">
      <div className={styles.nextText}>
        <span className={styles.nextLabel}>Study next</span>
        <Link href={`/subjects/${s.id}`} className={styles.nextName}>
          {s.name}
        </Link>
        <span className={styles.nextMeta}>
          <span className={styles.studied} data-stale={isStale(s.last_studied, now) || undefined}>
            {s.last_studied === null
              ? "Not studied yet"
              : `Last studied ${formatStudied(s.last_studied, now)}`}
          </span>
          {s.due > 0
            ? ` · ${s.due} due`
            : newCards > 0 && ` · ${newCards} new card${newCards === 1 ? "" : "s"}`}
        </span>
      </div>
      <Link href={href} className={styles.nextAction}>
        {NEXT_LABEL[action]}
        <ArrowRightIcon />
      </Link>
    </section>
  );
}

/**
 * The home screen's subjects as a grid of tiles, least recently studied first so neglected
 * ones lead: open one, add one, or rename / remove one from its ⋯ menu. `onChange` hears
 * about every change.
 */
export function SubjectGrid({
  subjects,
  now,
  onChange,
}: {
  subjects: SubjectSummary[];
  now: number;
  onChange: (subjects: SubjectSummary[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () =>
    getJson<SubjectSummary[]>("/api/subjects")
      .then(onChange)
      .catch(() => {});

  async function add(name: string | null) {
    setAdding(false);
    setError(null);
    if (!name) return;
    const res = await sendJson("/api/subjects", "POST", { name }).catch(() => null);
    if (!res?.ok) {
      setError(res?.status === 409 ? `“${name}” already exists.` : "Couldn't add that subject.");
      return;
    }
    reload();
  }

  async function rename(id: string, name: string) {
    setError(null);
    const res = await sendJson(`/api/subjects/${id}`, "PATCH", { name }).catch(() => null);
    if (!res?.ok) setError(res?.status === 409 ? `“${name}” already exists.` : "Couldn't rename it.");
    reload();
  }

  async function remove(id: string) {
    onChange(subjects.filter((s) => s.id !== id)); // optimistic
    await fetch(`/api/subjects/${id}`, { method: "DELETE" }).catch(() => {});
    reload();
  }

  return (
    <section className={styles.recent}>
      <div className={styles.recentHeader}>
        <h2 className={styles.recentTitle}>
          Subjects
          {subjects.length > 1 && <span className={styles.recentHint}> · most neglected first</span>}
        </h2>
        <button
          className={styles.allTrigger}
          onClick={() => setAdding(true)}
          aria-label="Add a subject"
          title="Add a subject"
        >
          <PlusIcon />
        </button>
      </div>

      {subjects.length === 0 && !adding ? (
        <p className={styles.empty}>Add the subjects you&apos;re taking to file your PDFs under them.</p>
      ) : (
        <ul className={styles.grid}>
          {subjects.map((s) => (
            <SubjectTile
              key={s.id}
              subject={s}
              now={now}
              onRename={(name) => rename(s.id, name)}
              onRemove={() => remove(s.id)}
            />
          ))}
          {adding && (
            <li className={styles.tile}>
              <TitleInput label="Subject name" placeholder="Linear Algebra" onDone={add} />
            </li>
          )}
        </ul>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </section>
  );
}

/** One subject: its name, cards due and how long since it was studied; ⋯ renames or removes it. */
function SubjectTile({
  subject: s,
  now,
  onRename,
  onRemove,
}: {
  subject: SubjectSummary;
  now: number;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (editing) {
    return (
      <li className={styles.tile}>
        <TitleInput
          label="Subject name"
          defaultValue={s.name}
          onDone={(name) => {
            setEditing(false);
            if (name && name !== s.name) onRename(name);
          }}
        />
      </li>
    );
  }

  return (
    <li className={styles.tile}>
      <button className={styles.tileMain} onClick={() => router.push(`/subjects/${s.id}`)}>
        <span className={styles.tileName} title={s.name}>
          {s.name}
        </span>
        <span className={styles.tileMeta}>
          {s.due > 0 && (
            <span className={styles.dueBadge} title="Cards due for review">
              {s.due}
            </span>
          )}
          <span
            className={styles.studied}
            data-stale={isStale(s.last_studied, now) || undefined}
            title={
              s.last_studied === null
                ? "Not studied yet"
                : `Last studied ${formatStudied(s.last_studied, now)}`
            }
          >
            {formatStudiedShort(s.last_studied, now)}
          </span>
        </span>
      </button>

      <Menu.Root>
        <Menu.Trigger className={styles.tileMenu} aria-label={`More for ${s.name}`} title="More">
          <DotsIcon />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className={styles.menuPositioner} side="bottom" align="end" sideOffset={4}>
            <Menu.Popup className={styles.menuPopup}>
              <Menu.Item className={styles.menuItem} onClick={() => setEditing(true)}>
                Rename
              </Menu.Item>
              <Menu.Item
                className={`${styles.menuItem} ${styles.menuDanger}`}
                onClick={() => setConfirming(true)}
              >
                Remove
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <AlertDialog.Root open={confirming} onOpenChange={setConfirming}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className={styles.dialogBackdrop} />
          <AlertDialog.Popup className={styles.dialogPopup}>
            <AlertDialog.Title className={styles.dialogTitle}>Remove “{s.name}”?</AlertDialog.Title>
            <AlertDialog.Description className={styles.dialogDesc}>
              {s.doc_count === 0
                ? "It has no files."
                : `Its ${s.doc_count === 1 ? "file stays" : `${s.doc_count} files stay`} in your library as Unsorted, with every note and flashcard.`}
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
    </li>
  );
}

/**
 * An inline name editor that replaces a row while renaming or adding. Enter or blur commits
 * (`onDone(trimmed)`, or null when empty), Escape cancels (`onDone(null)`).
 */
export function TitleInput({
  label,
  defaultValue,
  placeholder,
  maxLength = 80,
  onDone,
}: {
  label: string;
  defaultValue?: string;
  placeholder?: string;
  maxLength?: number;
  onDone: (value: string | null) => void;
}) {
  // Enter/Escape end the edit and unmount the input, which may also fire blur — commit once.
  const finished = useRef(false);

  function finish(value: string | null) {
    if (finished.current) return;
    finished.current = true;
    onDone(value?.trim() || null);
  }

  return (
    <input
      className={styles.rowInput}
      defaultValue={defaultValue}
      placeholder={placeholder}
      maxLength={maxLength}
      aria-label={label}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(e.currentTarget.value);
        else if (e.key === "Escape") finish(null);
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
    />
  );
}

/** A row action that files a document under another subject (or Unsorted). */
export function MoveMenu({
  title,
  current,
  subjects,
  onMove,
}: {
  title: string;
  current: string | null;
  subjects: Subject[];
  onMove: (subjectId: string | null) => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className={`${styles.rowAction} ${styles.rowEdit}`}
        aria-label={`Move ${title} to a subject`}
        title="Move to subject"
      >
        <FolderIcon />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className={styles.menuPositioner} side="bottom" align="end" sideOffset={4}>
          <Menu.Popup className={styles.menuPopup}>
            <Menu.RadioGroup
              value={current ?? ""}
              onValueChange={(v: string) => {
                if (v !== (current ?? "")) onMove(v || null);
              }}
            >
              {[...subjects].sort(byName).map((s) => (
                <Menu.RadioItem key={s.id} value={s.id} className={styles.menuItem}>
                  <span className={styles.menuItemText}>{s.name}</span>
                  <Menu.RadioItemIndicator className={styles.menuCheck}>✓</Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
              <Menu.Separator className={styles.menuSeparator} />
              <Menu.RadioItem value="" className={styles.menuItem}>
                <span className={styles.menuItemText}>Unsorted</span>
                <Menu.RadioItemIndicator className={styles.menuCheck}>✓</Menu.RadioItemIndicator>
              </Menu.RadioItem>
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * Asked after picking a PDF on the home screen: which subject to file it under. The last
 * subject used comes first in focus. `onChoose(null)` files it as Unsorted.
 */
export function SubjectChooser({
  open,
  subjects,
  preselect,
  onChoose,
  onCancel,
}: {
  open: boolean;
  subjects: Subject[];
  /** The subject id to focus first ("" = Unsorted), or null for the first subject. */
  preselect: string | null;
  onChoose: (subjectId: string | null) => void;
  onCancel: () => void;
}) {
  const sorted = [...subjects].sort(byName);
  const focus = preselect !== null && (preselect === "" || sorted.some((s) => s.id === preselect))
    ? preselect
    : sorted[0]?.id;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.dialogBackdrop} />
        <Dialog.Popup className={styles.dialogPopup}>
          <Dialog.Title className={styles.dialogTitle}>Which subject is this for?</Dialog.Title>
          <ul className={styles.chooserList}>
            {sorted.map((s) => (
              <li key={s.id}>
                <button
                  className={styles.chooserItem}
                  autoFocus={s.id === focus}
                  onClick={() => onChoose(s.id)}
                >
                  {s.name}
                </button>
              </li>
            ))}
            <li>
              <button
                className={`${styles.chooserItem} ${styles.chooserUnsorted}`}
                autoFocus={focus === ""}
                onClick={() => onChoose(null)}
              >
                Unsorted
              </button>
            </li>
          </ul>
          <div className={styles.dialogActions}>
            <Dialog.Close className={styles.dialogCancel}>Cancel</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4zM13.5 6.5l4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Tabler's outline "arrow-right" (MIT). */
function ArrowRightIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12l14 0" />
      <path d="M13 18l6 -6" />
      <path d="M13 6l6 6" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.6l2 2.2h7.4a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
