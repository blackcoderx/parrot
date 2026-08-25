import "server-only";

import fs from "node:fs";
import fsp from "node:fs/promises";
import { ensureDirs, pdfPath } from "./paths";

/** Persist an uploaded PDF's bytes to ~/.parrot/pdfs/{id}.pdf. */
export async function savePdf(id: string, bytes: ArrayBuffer): Promise<void> {
  ensureDirs();
  await fsp.writeFile(pdfPath(id), Buffer.from(bytes));
}

/** Read a stored PDF back as a Buffer, or null if it's missing. */
export async function readPdf(id: string): Promise<Buffer | null> {
  try {
    return await fsp.readFile(pdfPath(id));
  } catch {
    return null;
  }
}

/** Remove a stored PDF from disk. Ignores a missing file. */
export async function deletePdf(id: string): Promise<void> {
  try {
    await fsp.unlink(pdfPath(id));
  } catch {
    // already gone
  }
}

/** Whether a stored PDF exists on disk. */
export function pdfExists(id: string): boolean {
  return fs.existsSync(pdfPath(id));
}
