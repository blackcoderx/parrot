import { listStudyCards } from "@/lib/db";
import { FlashcardsLibrary } from "@/components/flashcards/FlashcardsLibrary";

// Cards and their schedules come straight from SQLite, so render per request.
export const dynamic = "force-dynamic";

export default function FlashcardsPage() {
  return <FlashcardsLibrary initialCards={listStudyCards()} />;
}
