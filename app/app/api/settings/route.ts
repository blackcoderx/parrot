import { NextRequest } from "next/server";
import { getPrefs, setPrefs, type AiPrefs } from "@/lib/settings";
import { invalidJson, readJson } from "@/lib/http";
import { PROVIDERS, getProvider, hasKey, resolveBaseURL } from "@/lib/providers";
import { SEARCH_PROVIDERS, getSearchProvider, hasSearchKey } from "@/lib/search";

function isStringMap(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === "string")
  );
}

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
  const searchProviders = SEARCH_PROVIDERS.map((s) => ({
    id: s.id,
    label: s.label,
    keyDetected: hasSearchKey(s.id),
  }));
  return Response.json({ prefs, providers, searchProviders });
}

// PUT /api/settings — save non-secret prefs.
export async function PUT(request: NextRequest) {
  const body = await readJson<AiPrefs>(request);
  if (!body) return invalidJson();

  // Each field is optional, but a present one must have the right shape.
  const { activeProvider, models, baseURLs, search } = body;
  if (activeProvider !== undefined && !getProvider(activeProvider)) {
    return Response.json({ error: "Unknown provider" }, { status: 400 });
  }
  if (
    (models !== undefined && !isStringMap(models)) ||
    (baseURLs !== undefined && !isStringMap(baseURLs))
  ) {
    return Response.json({ error: "models and baseURLs must map ids to strings" }, { status: 400 });
  }
  if (
    search !== undefined &&
    (typeof search?.enabled !== "boolean" || !getSearchProvider(search.provider))
  ) {
    return Response.json({ error: "Invalid search settings" }, { status: 400 });
  }

  const current = getPrefs();
  const next: AiPrefs = {
    activeProvider: activeProvider ?? current.activeProvider,
    models: models ?? current.models,
    baseURLs: baseURLs ?? current.baseURLs,
    search: search ?? current.search,
  };
  setPrefs(next);
  return Response.json(next);
}
