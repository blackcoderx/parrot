// Small fetch wrappers for talking to the app's own /api routes from client components.

/** GET a JSON response. Rejects on a network error or non-2xx status, so callers' `.catch` handles both. */
export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed (${res.status})`);
  return res.json() as Promise<T>;
}

/** Send a JSON body. Resolves to the raw Response (like fetch), so callers decide what `ok` means. */
export function sendJson(
  url: string,
  method: "POST" | "PUT" | "PATCH",
  body: unknown,
): Promise<Response> {
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
