import { listClips, listSubjects } from "@/lib/db";
import { ClipsPage } from "@/components/clips/ClipsPage";

// Clips come straight from SQLite, so render per request.
export const dynamic = "force-dynamic";

/** Every web clip. `?clip=<id>` (a search result) scrolls to that clip and flashes it. */
export default async function Page({ searchParams }: PageProps<"/clips">) {
  const { clip } = await searchParams;
  const subjects = listSubjects().map(({ id, name, created_at }) => ({ id, name, created_at }));
  return (
    <ClipsPage
      initialClips={listClips()}
      subjects={subjects}
      focusClipId={typeof clip === "string" ? clip : null}
    />
  );
}
