import { DEFAULT_PARROT_URL, getParrotUrl } from "./config.js";

const input = document.getElementById("url");
const status = document.getElementById("status");

input.value = await getParrotUrl();

document.getElementById("save").addEventListener("click", async () => {
  let url;
  try {
    url = new URL(input.value.trim() || DEFAULT_PARROT_URL);
  } catch {
    return report(false, "That isn't a valid address.");
  }
  // The extension may only reach this computer (see host_permissions in manifest.json).
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
    return report(false, "Parrot runs on this computer: use localhost or 127.0.0.1.");
  }
  const base = url.origin;
  await chrome.storage.sync.set({ parrotUrl: base });
  input.value = base;
  try {
    const res = await fetch(`${base}/api/subjects`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    report(true, "Saved. Parrot is reachable.");
  } catch {
    report(false, "Saved, but Parrot isn't answering there yet. Is it running?");
  }
});

function report(ok, text) {
  status.dataset.ok = String(ok);
  status.textContent = text;
}
