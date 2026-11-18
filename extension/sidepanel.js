// The side panel frames Parrot's /ext page and posts it the page + selection that the
// background worker queued in session storage. The page itself does the saving and the chat,
// through Parrot's own API.

import { getParrotUrl } from "./config.js";

const frame = document.getElementById("parrot");
const notice = document.getElementById("notice");
const noticeText = document.getElementById("notice-text");

let parrotOrigin = null;
let ready = false;

async function load() {
  ready = false;
  const base = await getParrotUrl();
  try {
    parrotOrigin = new URL(base).origin;
    const res = await fetch(`${base}/api/subjects`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    frame.hidden = true;
    showNotice(`Parrot isn't running at ${base}. Start it, then try again.`);
    return;
  }
  notice.hidden = true;
  frame.hidden = false;
  frame.src = `${base}/ext`;
}

function showNotice(text) {
  noticeText.textContent = text;
  notice.hidden = false;
}

/** Hand the queued selection to Parrot (once its page has said it's listening). */
async function sendPending() {
  if (!ready || !frame.contentWindow) return;
  const { pending } = await chrome.storage.session.get("pending");
  if (!pending) return;
  if (!/^https?:\/\//.test(pending.url)) {
    frame.hidden = true;
    showNotice("Parrot can only save from web pages (http or https).");
    return;
  }
  notice.hidden = true;
  frame.hidden = false;
  frame.contentWindow.postMessage({ type: "parrot:selection", ...pending }, parrotOrigin);
}

window.addEventListener("message", (e) => {
  if (e.source !== frame.contentWindow || e.origin !== parrotOrigin) return;
  if (e.data?.type === "parrot:ready") {
    ready = true;
    sendPending();
  } else if (e.data?.type === "parrot:close") {
    closePanel();
  }
});

// Esc while focus is on the panel itself (the "not running" notice) rather than inside Parrot.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePanel();
});

/** Close the side panel (window.close() on a side panel page closes the panel). */
function closePanel() {
  window.close();
}

// A new right-click while the panel is already open.
chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.pending) sendPending();
});

// A changed Parrot address in the options page.
chrome.storage.sync.onChanged.addListener((changes) => {
  if (changes.parrotUrl) load();
});

document.getElementById("retry").addEventListener("click", load);
document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

load();
