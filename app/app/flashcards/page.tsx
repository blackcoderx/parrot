import { listStudyCards, listSubjects } from "@/lib/db";
import { FlashcardsLibrary } from "@/components/flashcards/FlashcardsLibrary";

// Cards and their schedules come straight from SQLite, so render per request.
export const dynamic = "force-dynamic";

export default function FlashcardsPage() {
  const subjects = listSubjects().map(({ id, name, created_at }) => ({ id, name, created_at }));
  return <FlashcardsLibrary initialCards={listStudyCards()} subjects={subjects} />;
}
