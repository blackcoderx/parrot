import "server-only";

import fs from "node:fs";
import fsp from "node:fs/promises";
import { Readable } from "node:stream";
import { ensureDirs, pdfPath } from "./paths";

/** Persist an uploaded PDF's bytes to ~/.parrot/pdfs/{id}.pdf. */
export async function savePdf(id: string, bytes: ArrayBuffer): Promise<void> {
  ensureDirs();
  await fsp.writeFile(pdfPath(id), Buffer.from(bytes));
}

/** Size and modification time of a stored PDF, or null if it's missing. */
export async function statPdf(id: string): Promise<{ size: number; mtimeMs: number } | null> {
  try {
    const { size, mtimeMs } = await fsp.stat(pdfPath(id));
    return { size, mtimeMs };
  } catch {
    return null;
  }
}

/** Stream bytes `start..end` (inclusive) of a stored PDF. */
export function streamPdf(id: string, start: number, end: number): ReadableStream<Uint8Array> {
  return Readable.toWeb(fs.createReadStream(pdfPath(id), { start, end })) as ReadableStream<Uint8Array>;
}

/** Remove a stored PDF from disk. Ignores a missing file. */
export async function deletePdf(id: string): Promise<void> {
  try {
    await fsp.unlink(pdfPath(id));
  } catch {
    // already gone
  }
}
