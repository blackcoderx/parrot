import { listStudyCards } from "@/lib/db";

// GET /api/flashcards/study — every card from every document, with what each grade would
// schedule as of now (StudyCard[]).
export async function GET() {
  return Response.json(listStudyCards());
}
