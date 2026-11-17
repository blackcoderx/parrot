import { countDueFlashcards, listDeadlines, listDocuments, listSubjects } from "@/lib/db";
import { Library } from "@/components/library/Library";

// The list comes straight from SQLite, so render per request rather than once at build.
export const dynamic = "force-dynamic";

export default function Home() {
  const docs = listDocuments().map(({ id, title, last_page, page_count, subject_id }) => ({
    id,
    title,
    last_page,
    page_count,
    subject_id,
  }));
  return (
    <Library
      initialDocs={docs}
      initialSubjects={listSubjects()}
      initialDeadlines={listDeadlines()}
      dueCards={countDueFlashcards()}
    />
  );
}
