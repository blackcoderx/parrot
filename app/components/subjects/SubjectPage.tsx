"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tabs } from "@base-ui-components/react/tabs";
import { sendJson } from "@/components/api";
import { ClipList } from "@/components/clips/ClipList";
import { CardDeck } from "@/components/flashcards/CardDeck";
import { LibraryRow, type LibraryDoc } from "@/components/library/Library";
import { uploadPdf } from "@/components/library/upload";
import { KindMarker } from "@/components/reader/AnnotationList";
import Markdown from "@/components/reader/Markdown";
import { TimerButton } from "@/components/timer/TimerButton";
import { useNow } from "@/components/timer/TimerProvider";
import type { Clip, StudyCard, Subject, SubjectAnnotation, SubjectSummary } from "@/types";
import { matchesFilter } from "@/components/search/filter";
import { formatStudied, isStale } from "./studied";
import studyStyles from "@/components/flashcards/Study.module.css";
import libraryStyles from "@/components/library/Library.module.css";
import styles from "./SubjectPage.module.css";

interface Props {
  subject: SubjectSummary;
  /** Every subject, for moving files. */
  subjects: Subject[];
  initialDocs: LibraryDoc[];
  annotations: SubjectAnnotation[];
  /** Web clips filed under this subject (browser extension). */
  initialClips: Clip[];
  initialCards: StudyCard[];
  /** Start a study session straight away (the home screen's Study now, `?study=1`). */
  autoStudy: boolean;
}

/**
 * A subject's page: study its flashcards, review its notes and highlights and its web clips,
 * manage its files.
 */
export function SubjectPage({
  subject,
  subjects,
  initialDocs,
  annotations,
  initialClips,
  initialCards,
  autoStudy,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState(initialDocs);
  const [clips, setClips] = useState(initialClips);
  const [uploading, setUploading] = useState(false);
  const [studying, setStudying] = useState(false);
  const now = useNow(true, 60_000);

  // Drop ?study=1 so a refresh or Back doesn't start another session.
  useEffect(() => {
    if (autoStudy) window.history.replaceState(null, "", `/subjects/${subject.id}`);
  }, [autoStudy, subject.id]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setUploading(true);
    try {
      router.push(`/read/${await uploadPdf(file, subject.id)}`);
    } catch {
      setUploading(false);
    }
  }

  async function rename(id: string, title: string) {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, title } : d)));
    await sendJson(`/api/documents/${id}`, "PATCH", { title }).catch(() => null);
  }

  async function move(id: string, subjectId: string | null) {
    setDocs((prev) => prev.filter((d) => d.id !== id)); // it no longer belongs here
    await sendJson(`/api/documents/${id}`, "PATCH", { subject_id: subjectId }).catch(() => null);
    router.refresh(); // its notes and cards leave this page too
  }

  async function remove(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id));
    await fetch(`/api/documents/${id}`, { method: "DELETE" }).catch(() => null);
    router.refresh();
  }

  const stale = isStale(subject.last_studied, now);

  return (
    <div className={studyStyles.page}>
      <header className={studyStyles.header}>
        <Link href="/" className={studyStyles.back}>
          ← Library
        </Link>
        <div className={styles.titleRow}>
          <h1 className={studyStyles.title}>{subject.name}</h1>
          <button
            className={styles.addFile}
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Opening…" : "Add file"}
          </button>
          <input ref={inputRef} type="file" accept="application/pdf" hidden onChange={onFile} />
        </div>
        {!studying && (
          <p className={studyStyles.subtitle}>
            {plural(docs.length, "file")} · {plural(subject.card_count, "card")} ·{" "}
            <span className={styles.studied} data-stale={stale || undefined}>
              {subject.last_studied === null
                ? "not studied yet"
                : `last studied ${formatStudied(subject.last_studied, now)}`}
            </span>
          </p>
        )}
      </header>

      <Tabs.Root defaultValue="cards" className={styles.tabs}>
        {!studying && (
          <Tabs.List className={styles.tabList}>
            <Tabs.Tab value="cards" className={styles.tab}>
              Flashcards
            </Tabs.Tab>
            <Tabs.Tab value="notes" className={styles.tab}>
              Notes &amp; highlights
              <span className={styles.tabCount}>{annotations.length}</span>
            </Tabs.Tab>
            <Tabs.Tab value="clips" className={styles.tab}>
              Web clips
              <span className={styles.tabCount}>{clips.length}</span>
            </Tabs.Tab>
            <Tabs.Tab value="files" className={styles.tab}>
              Files
              <span className={styles.tabCount}>{docs.length}</span>
            </Tabs.Tab>
            <Tabs.Indicator className={styles.tabIndicator} />
          </Tabs.List>
        )}

        <Tabs.Panel value="cards" className={styles.panel}>
          <CardDeck
            initialCards={initialCards}
            subjectId={subject.id}
            autoStudy={autoStudy}
            onStudyingChange={setStudying}
          />
        </Tabs.Panel>

        <Tabs.Panel value="notes" className={styles.panel}>
          <AnnotationsByFile annotations={annotations} />
        </Tabs.Panel>

        <Tabs.Panel value="clips" className={styles.panel}>
          <ClipList
            clips={clips}
            setClips={setClips}
            subjects={subjects}
            scope={subject.id}
            emptyText="No web clips yet. Save passages from websites with the Parrot browser extension."
          />
        </Tabs.Panel>

        <Tabs.Panel value="files" className={styles.panel}>
          {docs.length === 0 ? (
            <p className={studyStyles.muted}>
              No files yet. Use <strong>Add file</strong>, or move one here from the library.
            </p>
          ) : (
            <ul className={libraryStyles.list}>
              {docs.map((doc) => (
                <LibraryRow
                  key={doc.id}
                  doc={doc}
                  subjectName={null}
                  subjects={subjects}
                  onOpen={() => router.push(`/read/${doc.id}`)}
                  onRename={(title) => rename(doc.id, title)}
                  onMove={(subjectId) => move(doc.id, subjectId)}
                  onRemove={() => remove(doc.id)}
                />
              ))}
            </ul>
          )}
        </Tabs.Panel>
      </Tabs.Root>

      <div className={studyStyles.corner}>
        <TimerButton className={studyStyles.timerBtn} clockClassName={studyStyles.timerClock} />
      </div>
    </div>
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Every note, highlight and saved thread in the subject, grouped by file (most recently read
 * first) in page order, with a box to filter them by their text. Each opens its file at that
 * spot (and a note opens itself).
 */
function AnnotationsByFile({ annotations }: { annotations: SubjectAnnotation[] }) {
  const [filter, setFilter] = useState("");

  if (annotations.length === 0) {
    return (
      <p className={studyStyles.muted}>
        No notes or highlights yet. Select text while reading to highlight it or add a note.
      </p>
    );
  }

  const files: { id: string; title: string; items: SubjectAnnotation[] }[] = [];
  for (const a of annotations) {
    if (!matchesFilter(`${a.note ?? ""} ${a.text}`, filter)) continue;
    const last = files[files.length - 1];
    if (last?.id === a.document_id) last.items.push(a);
    else files.push({ id: a.document_id, title: a.document_title, items: [a] });
  }

  return (
    <div className={styles.files}>
      <input
        className={styles.filter}
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter notes and highlights"
        aria-label="Filter notes and highlights"
      />
      {files.length === 0 && <p className={studyStyles.muted}>Nothing matches.</p>}
      {files.map((file) => (
        <section key={file.id} className={styles.file}>
          <Link href={`/read/${file.id}`} className={styles.fileTitle}>
            {file.title}
          </Link>
          <ul className={styles.notes}>
            {[...file.items]
              .sort((a, b) => a.page - b.page || (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0))
              .map((a) => (
                <li key={a.id}>
                  <Link href={`/read/${a.document_id}?page=${a.page}&note=${a.id}`} className={styles.note}>
                    <KindMarker highlight={a} />
                    <span className={styles.noteBody}>
                      {a.note ? (
                        <>
                          <span className={styles.noteText}>
                            <Markdown inline>{a.note}</Markdown>
                          </span>
                          {a.text && <span className={styles.noteQuote}>{a.text}</span>}
                        </>
                      ) : (
                        <span className={styles.noteText}>
                          {a.text || (a.chat_id ? "Ask Parrot thread on a region" : "Selected region")}
                        </span>
                      )}
                    </span>
                    <span className={styles.notePage}>p. {a.page}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
