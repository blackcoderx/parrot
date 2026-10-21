import { notFound } from "next/navigation";
import { getDocument } from "@/lib/db";
import { Reader } from "@/components/reader/Reader";

// /read/[id]?page=N opens at page N (e.g. a flashcard's source link) instead of where the
// reader left off.
export default async function ReadPage({ params, searchParams }: PageProps<"/read/[id]">) {
  const { id } = await params;
  const doc = getDocument(id);
  if (!doc) notFound();

  const { page } = await searchParams;
  const requested = Number(page);
  const initialPage =
    Number.isInteger(requested) && requested >= 1 && (doc.page_count === null || requested <= doc.page_count)
      ? requested
      : doc.last_page;

  return <Reader documentId={doc.id} title={doc.title} initialPage={initialPage} />;
}
