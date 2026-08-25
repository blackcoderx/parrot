import "server-only";

import os from "node:os";
import path from "node:path";
import fs from "node:fs";

/**
 * Parrot stores everything in an OS app-data folder so a forked clone stays clean
 * and the data survives re-clones:
 *
 *   ~/.parrot/
 *     parrot.db      SQLite database (documents, highlights, chats, settings)
 *     pdfs/          the raw PDF files, named {id}.pdf
 */
export const PARROT_DIR = path.join(os.homedir(), ".parrot");
export const PDF_DIR = path.join(PARROT_DIR, "pdfs");
export const DB_PATH = path.join(PARROT_DIR, "parrot.db");

/** Create the app-data directories if they don't exist yet. Safe to call repeatedly. */
export function ensureDirs(): void {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

/** Absolute path to a stored PDF for a given document id. */
export function pdfPath(id: string): string {
  return path.join(PDF_DIR, `${id}.pdf`);
}
