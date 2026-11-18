import { listClips, listSubjects } from "@/lib/db";
import { ClipsPage } from "@/components/clips/ClipsPage";

// Clips come straight from SQLite, so render per request.
export const dynamic = "force-dynamic";

export default function Page() {
  const subjects = listSubjects().map(({ id, name, created_at }) => ({ id, name, created_at }));
  return <ClipsPage initialClips={listClips()} subjects={subjects} />;
}
