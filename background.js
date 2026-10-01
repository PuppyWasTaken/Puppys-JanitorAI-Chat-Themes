
const CONTENT_SCRIPT_FILES = ["themes-manifest.js", "content.js"];
const MATCH_PATTERN = "https://janitorai.com/chats/*";

function isChatUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === "https://janitorai.com" && url.pathname.startsWith("/chats/");
  } catch {
    return false;
  }
}

async function syncTab(tabId) {
  try {

    const tab = await chrome.tabs.get(tabId);
    if (!isChatUrl(tab.url)) {

      await chrome.tabs.sendMessage(tabId, { type: "jc-sync-route" }, { frameId: 0 }).catch(() => {});
      return;
    }


    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: "jc-sync-route" }, { frameId: 0 });
      if (response && response.ready) return;
    } catch {

    }
    await chrome.scripting.executeScript({
      target: { tabId },
      files: CONTENT_SCRIPT_FILES
    });
  } catch (err) {

    console.warn("[JAI Theme Overlay] Could not sync tab", tabId, err);
  }
}

async function injectIntoOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: MATCH_PATTERN });
    for (const tab of tabs) {
      if (tab.id != null) await syncTab(tab.id);
    }
  } catch (err) {
    console.error("[JAI Theme Overlay] Could not query open tabs:", err);
  }
}

chrome.runtime.onInstalled.addListener(injectIntoOpenTabs);

chrome.webNavigation.onHistoryStateUpdated.addListener(
  (details) => {
    if (details.frameId === 0) syncTab(details.tabId);
  },
  { url: [{ schemes: ["https"], hostEquals: "janitorai.com" }] }
);
