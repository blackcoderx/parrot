import { notFound } from "next/navigation";
import {
  listStudyCards,
  listSubjectAnnotations,
  listSubjectDocuments,
  listSubjects,
} from "@/lib/db";
import { SubjectPage } from "@/components/subjects/SubjectPage";

// Cards, notes and files come straight from SQLite, so render per request.
export const dynamic = "force-dynamic";

/**
 * One subject: its flashcards to study, every note and highlight, and its files.
 * `?study=1` (the home screen's Study now) starts a study session on arrival.
 */
export default async function Page({ params, searchParams }: PageProps<"/subjects/[id]">) {
  const { id } = await params;
  const { study } = await searchParams;
  const all = listSubjects();
  const subject = all.find((s) => s.id === id);
  if (!subject) notFound();

  const docs = listSubjectDocuments(id).map(({ id, title, last_page, page_count, subject_id }) => ({
    id,
    title,
    last_page,
    page_count,
    subject_id,
  }));

  return (
    <SubjectPage
      subject={subject}
      subjects={all.map(({ id, name, created_at }) => ({ id, name, created_at }))}
      initialDocs={docs}
      annotations={listSubjectAnnotations(id)}
      initialCards={listStudyCards().filter((c) => c.subject_id === id)}
      autoStudy={study === "1"}
    />
  );
}
