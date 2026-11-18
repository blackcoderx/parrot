// Where Parrot is running. `bun run dev` serves on 3000; the Windows package on 3737.
export const DEFAULT_PARROT_URL = "http://localhost:3000";

/** The saved Parrot address, without a trailing slash. */
export async function getParrotUrl() {
  const { parrotUrl } = await chrome.storage.sync.get("parrotUrl");
  return (parrotUrl || DEFAULT_PARROT_URL).replace(/\/+$/, "");
}
