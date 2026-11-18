"use client";

import { useEffect, useState } from "react";
import { AlertDialog } from "@base-ui-components/react/alert-dialog";
import { Dialog } from "@base-ui-components/react/dialog";
import { getJson, sendJson } from "@/components/api";
import { TrashIcon } from "@/components/TrashIcon";
import { BookmarkIcon, ChatComposer, ChatMessages } from "@/components/chat/ChatThread";
import { textOf, useParrotChat, type SavedMessage } from "@/components/chat/useParrotChat";
import { MoveMenu, PencilIcon } from "@/components/library/Subjects";
import libraryStyles from "@/components/library/Library.module.css";
import Markdown from "@/components/reader/Markdown";
import { ModeToggle } from "@/components/reader/ModeToggle";
import askStyles from "@/components/reader/AskParrot.module.css";
import type { Clip, Subject } from "@/types";
import { formatDay, hostOf, sourceLink } from "./links";
import styles from "./ClipList.module.css";

/**
 * Web clips as cards: the page (linking back to the exact passage), the quote, the note, and
 * actions to edit the note, move it to a subject, continue its Ask Parrot thread, or remove it.
 * Controlled: the parent owns `clips`. `scope` is the subject the list shows (null = Unsorted,
 * undefined = every subject), so a clip moved out of it leaves the list.
 */
export function ClipList({
  clips,
  setClips,
  subjects,
  scope,
  emptyText,
}: {
  clips: Clip[];
  setClips: React.Dispatch<React.SetStateAction<Clip[]>>;
  subjects: Subject[];
  scope?: string | null;
  emptyText: React.ReactNode;
}) {
  const replace = (clip: Clip) =>
    setClips((prev) =>
      scope !== undefined && clip.subject_id !== scope
        ? prev.filter((c) => c.id !== clip.id)
        : prev.map((c) => (c.id === clip.id ? clip : c)),
    );

  async function patch(id: string, body: { note?: string | null; subject_id?: string | null }) {
    const res = await sendJson(`/api/clips/${id}`, "PATCH", body).catch(() => null);
    if (res?.ok) replace((await res.json()) as Clip);
    return !!res?.ok;
  }

  async function remove(id: string) {
    setClips((prev) => prev.filter((c) => c.id !== id)); // optimistic
    const res = await fetch(`/api/clips/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      const query = scope === undefined ? "" : `?subject=${scope ?? "unsorted"}`;
      getJson<Clip[]>(`/api/clips${query}`)
        .then(setClips)
        .catch(() => {});
    }
  }

  if (clips.length === 0) return <p className={styles.empty}>{emptyText}</p>;

  return (
    <ul className={styles.list}>
      {clips.map((clip) => (
        <ClipCard
          key={clip.id}
          clip={clip}
          subjects={subjects}
          subjectName={
            scope === undefined
              ? (subjects.find((s) => s.id === clip.subject_id)?.name ?? "Unsorted")
              : null
          }
          onPatch={(body) => patch(clip.id, body)}
          onRemove={() => remove(clip.id)}
          onThreadSaved={replace}
        />
      ))}
    </ul>
  );
}

function ClipCard({
  clip,
  subjects,
  subjectName,
  onPatch,
  onRemove,
  onThreadSaved,
}: {
  clip: Clip;
  subjects: Subject[];
  subjectName: string | null;
  onPatch: (body: { note?: string | null; subject_id?: string | null }) => Promise<boolean>;
  onRemove: () => void;
  onThreadSaved: (clip: Clip) => void;
}) {
  const [editing, setEditing] = useState(false);
  const host = hostOf(clip.url);

  return (
    <li className={styles.card} id={`clip-${clip.id}`}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <a
            className={styles.title}
            href={sourceLink(clip.url, clip.quote)}
            target="_blank"
            rel="noreferrer"
            title="Open the page at this passage"
          >
            {clip.page_title}
          </a>
          <span className={styles.meta}>
            {host} · {formatDay(clip.created_at)}
            {subjectName && ` · ${subjectName}`}
          </span>
        </div>

        <div className={styles.actions}>
          <button
            className={`${libraryStyles.rowAction} ${libraryStyles.rowEdit}`}
            onClick={() => setEditing(true)}
            aria-label={clip.note ? "Edit note" : "Add a note"}
            title={clip.note ? "Edit note" : "Add a note"}
          >
            <PencilIcon />
          </button>
          <MoveMenu
            title={clip.page_title}
            current={clip.subject_id}
            subjects={subjects}
            onMove={(subjectId) => onPatch({ subject_id: subjectId })}
          />
          <RemoveClip title={clip.page_title} onRemove={onRemove} />
        </div>
      </div>

      {clip.quote && <blockquote className={styles.quote}>{clip.quote}</blockquote>}

      {editing ? (
        <NoteEditor
          initial={clip.note ?? ""}
          onCancel={() => setEditing(false)}
          onSave={async (note) => {
            if (await onPatch({ note: note.trim() ? note : null })) setEditing(false);
          }}
        />
      ) : (
        clip.note && (
          <div className={styles.note} onDoubleClick={() => setEditing(true)}>
            <Markdown>{clip.note}</Markdown>
          </div>
        )
      )}

      <ClipThread clip={clip} onSaved={onThreadSaved} />
    </li>
  );
}

/** Inline note editor with Write / Preview, like the reader's note window. */
function NoteEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial: string;
  onCancel: () => void;
  onSave: (note: string) => void;
}) {
  const [text, setText] = useState(initial);
  const [preview, setPreview] = useState(false);
  return (
    <div className={styles.editor}>
      {preview ? (
        <div className={styles.editorPreview}>
          {text.trim() ? <Markdown>{text}</Markdown> : <p className={styles.empty}>Nothing yet.</p>}
        </div>
      ) : (
        <textarea
          className={styles.editorText}
          value={text}
          autoFocus
          placeholder="Your note… Markdown and LaTeX: $x^2$ inline, $$…$$ on its own line"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSave(text);
            if (e.key === "Escape") onCancel();
          }}
        />
      )}
      <div className={styles.editorBar}>
        <ModeToggle preview={preview} onChange={setPreview} />
        <span className={styles.spacer} />
        <button className={libraryStyles.dialogCancel} onClick={onCancel}>
          Cancel
        </button>
        <button className={styles.primary} onClick={() => onSave(text)}>
          Save
        </button>
      </div>
    </div>
  );
}

function RemoveClip({ title, onRemove }: { title: string; onRemove: () => void }) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger
        className={`${libraryStyles.rowAction} ${libraryStyles.rowDelete}`}
        aria-label={`Remove clip from ${title}`}
        title="Remove"
      >
        <TrashIcon />
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={libraryStyles.dialogBackdrop} />
        <AlertDialog.Popup className={libraryStyles.dialogPopup}>
          <AlertDialog.Title className={libraryStyles.dialogTitle}>Remove this clip?</AlertDialog.Title>
          <AlertDialog.Description className={libraryStyles.dialogDesc}>
            This permanently deletes the clip, its note and its Ask Parrot thread. The web page
            itself isn&apos;t affected.
          </AlertDialog.Description>
          <div className={libraryStyles.dialogActions}>
            <AlertDialog.Close className={libraryStyles.dialogCancel}>Cancel</AlertDialog.Close>
            <AlertDialog.Close className={libraryStyles.dialogConfirm} onClick={onRemove}>
              Remove
            </AlertDialog.Close>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/** "Ask Parrot" / "Thread · n messages": continue (or start) the clip's thread in a dialog. */
function ClipThread({ clip, onSaved }: { clip: Clip; onSaved: (clip: Clip) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={styles.threadChip} data-has={clip.message_count > 0 || undefined}>
        {clip.message_count > 0
          ? `Ask Parrot thread · ${clip.message_count} message${clip.message_count === 1 ? "" : "s"}`
          : "Ask Parrot"}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={libraryStyles.allBackdrop} />
        <Dialog.Popup className={`${libraryStyles.allPopup} ${styles.threadPopup}`}>
          {open && <ThreadBody clip={clip} onSaved={onSaved} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ThreadBody({ clip, onSaved }: { clip: Clip; onSaved: (clip: Clip) => void }) {
  const chat = useParrotChat({ title: clip.page_title, text: clip.quote || undefined, url: clip.url });
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load the saved thread once, when the dialog opens.
  useEffect(() => {
    if (clip.message_count === 0) return;
    getJson<SavedMessage[]>(`/api/clips/${clip.id}/messages`)
      .then((m) => chat.seed(m))
      .catch(() => setError("Couldn't load the saved thread."));
    // Only on open: saving bumps message_count, and the thread on screen is already current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.id]);

  async function save() {
    const messages = chat.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: textOf(m) }));
    const res = await sendJson(`/api/clips/${clip.id}/messages`, "PUT", { messages }).catch(
      () => null,
    );
    if (!res?.ok) return setError("Couldn't save the thread.");
    setError(null);
    setSaved(true);
    onSaved((await res.json()) as Clip);
  }

  const canSave = chat.messages.length > 0 && !chat.busy && !saved;
  return (
    <>
      <div className={libraryStyles.allHeader}>
        <Dialog.Title className={`${libraryStyles.allTitle} ${styles.threadTitle}`}>
          Ask Parrot · {clip.page_title}
        </Dialog.Title>
        <button
          className={`${askStyles.askIconBtn} ${askStyles.askSaveBtn}`}
          onClick={save}
          disabled={!canSave}
          data-saved={(saved && chat.messages.length > 0) || undefined}
          aria-label={saved ? "Saved" : "Save thread"}
          title={saved ? "Saved" : "Save thread"}
        >
          <BookmarkIcon filled={saved && chat.messages.length > 0} />
        </button>
        <Dialog.Close className={libraryStyles.allClose} aria-label="Close">
          ×
        </Dialog.Close>
      </div>
      {clip.quote && <blockquote className={`${styles.quote} ${styles.threadQuote}`}>{clip.quote}</blockquote>}
      <ChatMessages
        chat={chat}
        emptyText={clip.quote ? "Ask about this passage." : "Ask about this page."}
      />
      {error && <p className={libraryStyles.error}>{error}</p>}
      <ChatComposer chat={chat} onSent={() => setSaved(false)} />
    </>
  );
}
