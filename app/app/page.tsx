import { listDocuments } from "@/lib/db";
import { Library } from "@/components/library/Library";

// The list comes straight from SQLite, so render per request rather than once at build.
export const dynamic = "force-dynamic";

export default function Home() {
  const docs = listDocuments().map(({ id, title }) => ({ id, title }));
  return <Library initialDocs={docs} />;
}
