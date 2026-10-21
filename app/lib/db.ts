import "server-only";

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { DB_PATH, ensureDirs } from "./paths";
import { intervals, statusOf, type Srs } from "./srs";
import type {
  CardSource,
  DocumentRow,
  Flashcard,
  Grade,
  Highlight,
  Message,
  NormRect,
  StudyCard,
  StudyToday,
} from "@/types";

// Shape as stored in SQLite (rects is a JSON string column).
interface HighlightDbRow extends Omit<Highlight, "rects"> {
  rects: string;
}

// Shape as stored in SQLite (tags and srs are JSON string columns; status, reps and lapses are
// derived from srs).
interface FlashcardDbRow extends Omit<Flashcard, "tags" | "status" | "reps" | "lapses"> {
  tags: string;
  srs: string | null;
}

type StudyCardDbRow = FlashcardDbRow & { document_title: string };

const globalForDb = globalThis as unknown as { parrotDb?: Database.Database };

function createDb(): Database.Database {
  ensureDirs();
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      filename   TEXT NOT NULL,
      page_count INTEGER,
      last_page  INTEGER NOT NULL DEFAULT 1,
      added_at   INTEGER NOT NULL,
      opened_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS highlights (
      id          TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      page        INTEGER NOT NULL,
      rects       TEXT NOT NULL,
      color       TEXT NOT NULL,
      text        TEXT NOT NULL DEFAULT '',
      note        TEXT,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_highlights_document ON highlights(document_id);

    -- Saved Ask Parrot threads, each anchored to a highlight.
    CREATE TABLE IF NOT EXISTS chats (
      id           TEXT PRIMARY KEY,
      document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      highlight_id TEXT REFERENCES highlights(id) ON DELETE SET NULL,
      created_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         TEXT PRIMARY KEY,
      chat_id    TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      image      TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chats_highlight ON chats(highlight_id);
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Study flashcards, scoped to one document.
    CREATE TABLE IF NOT EXISTS flashcards (
      id          TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      question    TEXT NOT NULL,
      hint        TEXT,
      answer      TEXT NOT NULL,
      page        INTEGER,
      y           REAL,
      section_id  TEXT,
      section     TEXT,
      tags        TEXT NOT NULL DEFAULT '[]',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      srs         TEXT,    -- FSRS memory state (lib/srs.ts); NULL until first studied
      due         INTEGER  -- srs.due, kept as a column for querying
    );
    CREATE INDEX IF NOT EXISTS idx_flashcards_document ON flashcards(document_id);

    -- Every grade given while studying. state is the card's FSRS state before the grade
    -- (0 = new), so first-time studies can be counted.
    CREATE TABLE IF NOT EXISTS flashcard_reviews (
      id          TEXT PRIMARY KEY,
      card_id     TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
      rating      INTEGER NOT NULL,
      state       INTEGER NOT NULL,
      reviewed_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_card ON flashcard_reviews(card_id);
    CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_time ON flashcard_reviews(reviewed_at);

    -- Resolved PDF outline (table of contents), cached so it's instant on reopen.
    -- Stored PDFs never change, so an entry stays valid until its format version bumps.
    CREATE TABLE IF NOT EXISTS outlines (
      document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
      version     INTEGER NOT NULL,
      data        TEXT NOT NULL
    );

    -- Finished Pomodoro focus sessions. day is the reader's local calendar day
    -- (YYYY-MM-DD, sent by the client) so streaks follow their midnight, not UTC's.
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id          TEXT PRIMARY KEY,
      day         TEXT NOT NULL,
      started_at  INTEGER NOT NULL,
      minutes     INTEGER NOT NULL,
      document_id TEXT REFERENCES documents(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_focus_sessions_day ON focus_sessions(day);
  `);

  // Migrate databases created before a column existed (CREATE TABLE IF NOT EXISTS above is a
  // no-op for them).
  function addColumn(table: string, name: string, ddl: string) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((c) => c.name === name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
    }
  }
  addColumn("highlights", "note", "TEXT");
  addColumn("flashcards", "page", "INTEGER");
  addColumn("flashcards", "y", "REAL");
  addColumn("flashcards", "section_id", "TEXT");
  addColumn("flashcards", "section", "TEXT");
  addColumn("flashcards", "tags", "TEXT NOT NULL DEFAULT '[]'");
  addColumn("flashcards", "srs", "TEXT");
  addColumn("flashcards", "due", "INTEGER");
  db.exec("CREATE INDEX IF NOT EXISTS idx_flashcards_due ON flashcards(due)");

  // Threads orphaned by highlight deletes before deleteHighlight removed them too. Every
  // saved thread has an anchor, so an anchorless chat can never be reopened.
  db.exec("DELETE FROM chats WHERE highlight_id IS NULL");

  return db;
}

export const db: Database.Database = globalForDb.parrotDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.parrotDb = db;

// ---------------------------------------------------------------------------
// Document queries
// ---------------------------------------------------------------------------

export function listDocuments(): DocumentRow[] {
  return db
    .prepare("SELECT * FROM documents ORDER BY opened_at DESC")
    .all() as DocumentRow[];
}

export function getDocument(id: string): DocumentRow | undefined {
  return db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as
    | DocumentRow
    | undefined;
}

export function insertDocument(doc: {
  id: string;
  title: string;
  filename: string;
}): DocumentRow {
  return db
    .prepare(
      `INSERT INTO documents (id, title, filename, page_count, last_page, added_at, opened_at)
       VALUES (@id, @title, @filename, NULL, 1, @now, @now)
       RETURNING *`,
    )
    .get({ ...doc, now: Date.now() }) as DocumentRow;
}

/** Record reading progress (omitted fields keep their value). Returns the row, or undefined if missing. */
export function touchDocument(
  id: string,
  fields: { last_page?: number; page_count?: number },
): DocumentRow | undefined {
  return db
    .prepare(
      `UPDATE documents
          SET last_page  = COALESCE(@last_page, last_page),
              page_count = COALESCE(@page_count, page_count),
              opened_at  = @opened_at
        WHERE id = @id
       RETURNING *`,
    )
    .get({
      id,
      last_page: fields.last_page ?? null,
      page_count: fields.page_count ?? null,
      opened_at: Date.now(),
    }) as DocumentRow | undefined;
}

/** Change a document's title. Leaves opened_at alone so renaming doesn't reorder the library. */
export function renameDocument(id: string, title: string): DocumentRow | undefined {
  return db.prepare("UPDATE documents SET title = ? WHERE id = ? RETURNING *").get(title, id) as
    | DocumentRow
    | undefined;
}

export function deleteDocument(id: string): void {
  db.prepare("DELETE FROM documents WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// Outline cache
// ---------------------------------------------------------------------------

/** The cached outline JSON for a document, or null if absent or from another format version. */
export function getOutline(documentId: string, version: number): string | null {
  const row = db
    .prepare("SELECT data FROM outlines WHERE document_id = ? AND version = ?")
    .get(documentId, version) as { data: string } | undefined;
  return row?.data ?? null;
}

export function saveOutline(documentId: string, version: number, data: string): void {
  db.prepare(
    `INSERT INTO outlines (document_id, version, data) VALUES (?, ?, ?)
     ON CONFLICT(document_id) DO UPDATE SET version = excluded.version, data = excluded.data`,
  ).run(documentId, version, data);
}

// ---------------------------------------------------------------------------
// Flashcard queries
// ---------------------------------------------------------------------------

function toFlashcard(row: FlashcardDbRow): Flashcard {
  const { srs: raw, ...rest } = row;
  const srs = parseSrs(raw);
  return {
    ...rest,
    tags: JSON.parse(row.tags) as string[],
    status: statusOf(srs),
    reps: srs?.reps ?? 0,
    lapses: srs?.lapses ?? 0,
  };
}

function parseSrs(raw: string | null): Srs | null {
  return raw ? (JSON.parse(raw) as Srs) : null;
}

function toStudyCard(row: StudyCardDbRow, now: number): StudyCard {
  const { document_title, ...card } = row;
  return { ...toFlashcard(card), document_title, intervals: intervals(parseSrs(row.srs), now) };
}

const STUDY_CARD_SELECT = `SELECT f.*, d.title AS document_title
                             FROM flashcards f JOIN documents d ON d.id = f.document_id`;

/** Every card from every document, with what each grade would schedule as of `now`. */
export function listStudyCards(now = Date.now()): StudyCard[] {
  const rows = db
    .prepare(`${STUDY_CARD_SELECT} ORDER BY d.opened_at DESC, f.created_at ASC`)
    .all() as StudyCardDbRow[];
  return rows.map((row) => toStudyCard(row, now));
}

/** Cards studied before and due again by `now` (new cards aren't counted). */
export function countDueFlashcards(now = Date.now()): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM flashcards WHERE due <= ?").get(now) as {
    n: number;
  };
  return row.n;
}

/** A card's memory state: null if never studied, undefined if there's no such card. */
export function getFlashcardSrs(id: string): Srs | null | undefined {
  const row = db.prepare("SELECT srs FROM flashcards WHERE id = ?").get(id) as
    | { srs: string | null }
    | undefined;
  return row && parseSrs(row.srs);
}

/**
 * Store a grade: `next` (from lib/srs.ts `review`) becomes the card's memory state and the
 * grade is logged, in one transaction. `before` is the state it was graded from. Returns the
 * updated card, or undefined if it no longer exists.
 */
export const recordReview = db.transaction(
  (id: string, grade: Grade, before: Srs | null, next: Srs, now: number): StudyCard | undefined => {
    const updated = db
      .prepare("UPDATE flashcards SET srs = ?, due = ? WHERE id = ?")
      .run(JSON.stringify(next), next.due, id);
    if (!updated.changes) return undefined;
    db.prepare(
      `INSERT INTO flashcard_reviews (id, card_id, rating, state, reviewed_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(randomUUID(), id, grade, before?.state ?? 0, now);
    const row = db.prepare(`${STUDY_CARD_SELECT} WHERE f.id = ?`).get(id) as StudyCardDbRow;
    return toStudyCard(row, now);
  },
);

/** Grades given, and new cards studied for the first time, since `since` (epoch ms). */
export function studyCountsSince(since: number): StudyToday {
  return db
    .prepare(
      `SELECT COUNT(*) AS reviewed, COALESCE(SUM(state = 0), 0) AS introduced
         FROM flashcard_reviews WHERE reviewed_at >= ?`,
    )
    .get(since) as StudyToday;
}

export function listFlashcards(documentId: string): Flashcard[] {
  const rows = db
    .prepare("SELECT * FROM flashcards WHERE document_id = ? ORDER BY created_at ASC")
    .all(documentId) as FlashcardDbRow[];
  return rows.map(toFlashcard);
}

export function insertFlashcard(card: {
  id: string;
  document_id: string;
  question: string;
  hint: string | null;
  answer: string;
  source: CardSource | null;
  tags: string[];
}): Flashcard {
  const { source, tags, ...rest } = card;
  const row = db
    .prepare(
      `INSERT INTO flashcards (id, document_id, question, hint, answer, page, y, section_id,
                               section, tags, created_at, updated_at)
       VALUES (@id, @document_id, @question, @hint, @answer, @page, @y, @section_id,
               @section, @tags, @now, @now)
       RETURNING *`,
    )
    .get({
      ...rest,
      page: source?.page ?? null,
      y: source?.y ?? null,
      section_id: source?.section_id ?? null,
      section: source?.section ?? null,
      tags: JSON.stringify(tags),
      now: Date.now(),
    }) as FlashcardDbRow;
  return toFlashcard(row);
}

/**
 * Edit a card (omitted fields keep their value; a null hint clears it). The source is fixed
 * when the card is created.
 */
export function updateFlashcard(
  id: string,
  fields: { question?: string; hint?: string | null; answer?: string; tags?: string[] },
): Flashcard | undefined {
  const row = db
    .prepare(
      `UPDATE flashcards
          SET question   = COALESCE(@question, question),
              hint       = CASE WHEN @setHint THEN @hint ELSE hint END,
              answer     = COALESCE(@answer, answer),
              tags       = COALESCE(@tags, tags),
              updated_at = @now
        WHERE id = @id
       RETURNING *`,
    )
    .get({
      id,
      question: fields.question ?? null,
      setHint: fields.hint !== undefined ? 1 : 0,
      hint: fields.hint ?? null,
      answer: fields.answer ?? null,
      tags: fields.tags ? JSON.stringify(fields.tags) : null,
      now: Date.now(),
    }) as FlashcardDbRow | undefined;
  return row && toFlashcard(row);
}

export function deleteFlashcard(id: string): void {
  db.prepare("DELETE FROM flashcards WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// Highlight queries
// ---------------------------------------------------------------------------

function parseHighlight(row: HighlightDbRow): Highlight {
  return { ...row, rects: JSON.parse(row.rects) as NormRect[] };
}

export function listHighlights(documentId: string): Highlight[] {
  const rows = db
    .prepare(
      `SELECT h.*, c.id AS chat_id
         FROM highlights h
         LEFT JOIN chats c ON c.highlight_id = h.id
        WHERE h.document_id = ?
        ORDER BY h.created_at ASC`,
    )
    .all(documentId) as HighlightDbRow[];
  return rows.map(parseHighlight);
}

export function insertHighlight(h: {
  id: string;
  document_id: string;
  page: number;
  rects: NormRect[];
  color: string;
  text: string;
  note?: string | null;
}): Highlight {
  const created_at = Date.now();
  const note = h.note ?? null;
  db.prepare(
    `INSERT INTO highlights (id, document_id, page, rects, color, text, note, created_at)
     VALUES (@id, @document_id, @page, @rects, @color, @text, @note, @created_at)`,
  ).run({
    ...h,
    rects: JSON.stringify(h.rects),
    note,
    created_at,
  });
  return {
    ...h,
    note,
    created_at,
    chat_id: null,
  };
}

/** Update the note text on a highlight. Returns false if no such highlight. */
export function updateHighlightNote(id: string, note: string): boolean {
  const info = db.prepare("UPDATE highlights SET note = ? WHERE id = ?").run(note, id);
  return info.changes > 0;
}

/** Delete a highlight and any thread anchored to it (messages cascade from the chat). */
export function deleteHighlight(id: string): void {
  db.transaction(() => {
    // chats.highlight_id is ON DELETE SET NULL, which would leave the thread unreachable.
    db.prepare("DELETE FROM chats WHERE highlight_id = ?").run(id);
    db.prepare("DELETE FROM highlights WHERE id = ?").run(id);
  })();
}

// ---------------------------------------------------------------------------
// Chat + message queries (AI harness)
// ---------------------------------------------------------------------------

export function insertChat(chat: {
  id: string;
  document_id: string;
  highlight_id: string | null;
}): void {
  db.prepare(
    `INSERT INTO chats (id, document_id, highlight_id, created_at)
     VALUES (@id, @document_id, @highlight_id, @created_at)`,
  ).run({ ...chat, created_at: Date.now() });
}

export function getChatByHighlight(highlightId: string): { id: string } | undefined {
  return db.prepare("SELECT id FROM chats WHERE highlight_id = ?").get(highlightId) as
    | { id: string }
    | undefined;
}

export function listMessages(chatId: string): Message[] {
  return db
    .prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC")
    .all(chatId) as Message[];
}

/**
 * Save (upsert) a thread atomically: create its anchor highlight if it doesn't have one
 * yet, create the chat if needed, then replace its messages. All or nothing, so a failure
 * part-way can't leave an orphan highlight behind.
 */
export function saveThread(input: {
  documentId: string;
  highlightId?: string;
  highlight?: { page: number; rects: NormRect[]; color: string; text: string };
  messages: { role: string; content: string; image?: string | null }[];
}): { highlightId: string; chatId: string } {
  return db.transaction(() => {
    let highlightId = input.highlightId;
    if (!highlightId) {
      if (!input.highlight) throw new Error("highlight or highlightId is required");
      highlightId = insertHighlight({
        id: randomUUID(),
        document_id: input.documentId,
        ...input.highlight,
      }).id;
    }

    let chatId = getChatByHighlight(highlightId)?.id;
    if (!chatId) {
      chatId = randomUUID();
      insertChat({ id: chatId, document_id: input.documentId, highlight_id: highlightId });
    }
    replaceMessages(chatId, input.messages);

    return { highlightId, chatId };
  })();
}

/** Replace all messages on a chat (used when saving/updating a thread). */
export function replaceMessages(
  chatId: string,
  msgs: { role: string; content: string; image?: string | null }[],
): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM messages WHERE chat_id = ?").run(chatId);
    const insert = db.prepare(
      `INSERT INTO messages (id, chat_id, role, content, image, created_at)
       VALUES (@id, @chat_id, @role, @content, @image, @created_at)`,
    );
    msgs.forEach((m, i) => {
      insert.run({
        id: randomUUID(),
        chat_id: chatId,
        role: m.role,
        content: m.content,
        image: m.image ?? null,
        created_at: Date.now() + i, // preserve order
      });
    });
  });
  tx();
}

// ---------------------------------------------------------------------------
// Focus (Pomodoro) session queries
// ---------------------------------------------------------------------------

export function insertFocusSession(s: {
  day: string;
  started_at: number;
  minutes: number;
  document_id: string | null;
}): void {
  db.prepare(
    `INSERT INTO focus_sessions (id, day, started_at, minutes, document_id)
     VALUES (@id, @day, @started_at, @minutes, @document_id)`,
  ).run({ id: randomUUID(), ...s });
}

/** Finished focus sessions per local day. */
export function focusDayCounts(): Map<string, number> {
  const rows = db
    .prepare("SELECT day, COUNT(*) AS n FROM focus_sessions GROUP BY day")
    .all() as { day: string; n: number }[];
  return new Map(rows.map((r) => [r.day, r.n]));
}
