import "server-only";

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { DB_PATH, ensureDirs } from "./paths";
import type { CardSource, DocumentRow, Flashcard, Highlight, Message, NormRect } from "@/types";

// Shape as stored in SQLite (rects is a JSON string column).
interface HighlightDbRow extends Omit<Highlight, "rects"> {
  rects: string;
}

// Shape as stored in SQLite (tags is a JSON string column).
interface FlashcardDbRow extends Omit<Flashcard, "tags"> {
  tags: string;
}

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
      updated_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_flashcards_document ON flashcards(document_id);

    -- Resolved PDF outline (table of contents), cached so it's instant on reopen.
    -- Stored PDFs never change, so an entry stays valid until its format version bumps.
    CREATE TABLE IF NOT EXISTS outlines (
      document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
      version     INTEGER NOT NULL,
      data        TEXT NOT NULL
    );
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
  return { ...row, tags: JSON.parse(row.tags) as string[] };
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
