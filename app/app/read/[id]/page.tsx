import { notFound } from "next/navigation";
import { getDocument } from "@/lib/db";
import { Reader } from "@/components/reader/Reader";

export default async function ReadPage({ params }: PageProps<"/read/[id]">) {
  const { id } = await params;
  const doc = getDocument(id);
  if (!doc) notFound();

  return <Reader documentId={doc.id} title={doc.title} initialPage={doc.last_page} />;
}
