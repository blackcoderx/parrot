import "server-only";

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { DB_PATH, ensureDirs } from "./paths";


export interface DocumentRow {
  id: string;
  title: string;
  filename: string;
  page_count: number | null;
  last_page: number;
  added_at: number;
  opened_at: number;
}

/** A rectangle in page-normalized coordinates (0..1 of page width/height). */
export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HighlightRow {
  id: string;
  document_id: string;
  page: number;
  rects: NormRect[];
  color: string;
  text: string;
  /** A reader's note attached to this highlight, or null for plain highlights. */
  note: string | null;
  created_at: number;
  /** Id of an attached saved chat thread, or null. Populated via LEFT JOIN. */
  chat_id: string | null;
}

// Shape as stored in SQLite (rects is a JSON string column).
interface HighlightDbRow extends Omit<HighlightRow, "rects"> {
  rects: string;
}

export interface MessageRow {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  image: string | null;
  created_at: number;
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

    -- Created now, used by the AI harness in milestone 2.
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

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migrate databases created before the `note` column existed (CREATE TABLE
  // IF NOT EXISTS above is a no-op for them).
  const hasNote = (db.prepare("PRAGMA table_info(highlights)").all() as { name: string }[]).some(
    (c) => c.name === "note",
  );
  if (!hasNote) db.exec("ALTER TABLE highlights ADD COLUMN note TEXT");

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
  const now = Date.now();
  db.prepare(
    `INSERT INTO documents (id, title, filename, page_count, last_page, added_at, opened_at)
     VALUES (@id, @title, @filename, NULL, 1, @now, @now)`,
  ).run({ ...doc, now });
  return getDocument(doc.id)!;
}

export function touchDocument(
  id: string,
  fields: { last_page?: number; page_count?: number },
): void {
  const current = getDocument(id);
  if (!current) return;
  db.prepare(
    `UPDATE documents
        SET last_page = @last_page, page_count = @page_count, opened_at = @opened_at
      WHERE id = @id`,
  ).run({
    id,
    last_page: fields.last_page ?? current.last_page,
    page_count: fields.page_count ?? current.page_count,
    opened_at: Date.now(),
  });
}

export function deleteDocument(id: string): void {
  db.prepare("DELETE FROM documents WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// Highlight queries
// ---------------------------------------------------------------------------

function parseHighlight(row: HighlightDbRow): HighlightRow {
  return { ...row, rects: JSON.parse(row.rects) as NormRect[] };
}

export function listHighlights(documentId: string): HighlightRow[] {
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
}): HighlightRow {
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

export function deleteHighlight(id: string): void {
  db.prepare("DELETE FROM highlights WHERE id = ?").run(id);
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

export function listMessages(chatId: string): MessageRow[] {
  return db
    .prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC")
    .all(chatId) as MessageRow[];
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
