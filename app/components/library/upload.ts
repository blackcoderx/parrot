// Uploading a PDF from the home screen or a subject page.

const LAST_SUBJECT_KEY = "parrot.lastSubject";

/** Upload a PDF, filed under a subject (null = Unsorted). Resolves to the new document's id. */
export async function uploadPdf(file: File, subjectId: string | null): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  if (subjectId) form.append("subject", subjectId);
  const res = await fetch("/api/documents", { method: "POST", body: form });
  if (!res.ok) throw new Error("Upload failed");
  rememberSubject(subjectId);
  const doc: { id: string } = await res.json();
  return doc.id;
}

/** The subject the last upload went to ("" = Unsorted), or null if none is remembered. */
export function lastSubject(): string | null {
  try {
    return localStorage.getItem(LAST_SUBJECT_KEY);
  } catch {
    return null;
  }
}

function rememberSubject(subjectId: string | null) {
  try {
    localStorage.setItem(LAST_SUBJECT_KEY, subjectId ?? "");
  } catch {
    // Storage unavailable (private window): the chooser just won't preselect.
  }
}
