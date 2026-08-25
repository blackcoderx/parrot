import { NextRequest } from "next/server";
import { getPrefs, setPrefs, type AiPrefs } from "@/lib/settings";
import { PROVIDERS, hasKey, resolveBaseURL } from "@/lib/providers";

// GET /api/settings — current prefs + provider metadata (never the raw keys).
export async function GET() {
  const prefs = getPrefs();
  const providers = PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    needsKey: p.needsKey,
    editableBaseURL: p.editableBaseURL,
    defaultModel: p.defaultModel ?? "",
    keyDetected: hasKey(p.id),
    baseURL: resolveBaseURL(p.id, prefs),
  }));
  return Response.json({ prefs, providers });
}

// PUT /api/settings — save non-secret prefs.
export async function PUT(request: NextRequest) {
  const body = (await request.json()) as Partial<AiPrefs>;
  const current = getPrefs();
  const next: AiPrefs = {
    activeProvider: body.activeProvider ?? current.activeProvider,
    models: body.models ?? current.models,
    baseURLs: body.baseURLs ?? current.baseURLs,
  };
  setPrefs(next);
  return Response.json(next);
}
