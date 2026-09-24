import "server-only";

/**
 * Parse a request's JSON object body. Returns null when the body is missing, malformed, or
 * not an object, so routes can answer 400 instead of throwing a 500. Fields are unchecked
 * (hence Partial) — routes still validate what they use.
 */
export async function readJson<T extends object>(request: Request): Promise<Partial<T> | null> {
  const body: unknown = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Partial<T>) : null;
}

/** The standard 400 for an unreadable body. */
export function invalidJson(): Response {
  return Response.json({ error: "Expected a JSON object body" }, { status: 400 });
}
