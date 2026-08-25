import { NextRequest } from "next/server";
import { listModels } from "@/lib/providers";
import { getPrefs } from "@/lib/settings";

// GET /api/models?provider=<id> — auto-fetched model ids, or [] if unavailable.
export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get("provider");
  if (!provider) {
    return Response.json({ error: "provider is required" }, { status: 400 });
  }
  const models = await listModels(provider, getPrefs());
  return Response.json({ models });
}
