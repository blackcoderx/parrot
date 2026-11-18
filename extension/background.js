// Parrot's service worker: the right-click menu and the toolbar button. Each one opens the side
// panel (which shows Parrot's /ext page) and leaves the page and its selection in session
// storage for the panel to hand over.

const MENU_SAVE = "parrot-save";
const MENU_ASK = "parrot-ask";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_SAVE,
      title: "Save to Parrot",
      contexts: ["selection", "page"],
    });
    chrome.contextMenus.create({
      id: MENU_ASK,
      title: "Ask Parrot",
      contexts: ["selection", "page"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  // Open first, synchronously: sidePanel.open only works inside the click's user gesture.
  chrome.sidePanel.open({ windowId: tab.windowId });
  capture(tab, info.menuItemId === MENU_ASK ? "ask" : "note", info.selectionText);
});

// The toolbar button (and Alt+Shift+P) saves the current selection, or the page if none.
chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;
  chrome.sidePanel.open({ windowId: tab.windowId });
  capture(tab, "note");
});

/** Read the page's selection and queue it for the side panel. */
async function capture(tab, mode, fallbackText = "") {
  let text = fallbackText ?? "";
  try {
    // activeTab lets us read the selection on the page the user just clicked. Reading it
    // ourselves keeps line breaks, which the context menu's selectionText flattens.
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => String(window.getSelection() ?? ""),
    });
    if (typeof result?.result === "string" && result.result.trim()) text = result.result;
  } catch {
    // Some pages don't allow scripts (chrome:// pages, the Web Store, PDFs): keep the menu's text.
  }
  await chrome.storage.session.set({
    pending: {
      id: crypto.randomUUID(),
      mode,
      url: tab.url ?? "",
      title: tab.title ?? "",
      text: text.trim(),
    },
  });
}
