/**
 * background.js
 * -------------
 * Two related problems, one file:
 *
 * 1. Chrome only attaches a manifest-declared content script to pages
 *    loaded AFTER the extension is active. A JanitorAI chat tab that
 *    was already open when you ran "Load unpacked" — or that's just
 *    sitting open when you reload the extension in chrome://extensions
 *    while developing — never gets content.js injected into it.
 *
 * 2. JanitorAI is a single-page app: moving between chats (or from a
 *    non-chat page into a chat) changes the URL via history.pushState,
 *    NOT a real page load. Manifest content_scripts only fire on real
 *    navigations, so a tab that reaches /chats/... purely through
 *    in-app navigation — the normal way anyone actually gets there —
 *    never gets content.js injected either, even on a freshly opened
 *    tab.
 *
 * Either way, there's nothing on that page listening for storage
 * changes, so radio-selecting a theme silently does nothing.
 *
 * This file covers both: on install/update/reload it injects into
 * every already-open matching tab (#1), and it listens for JanitorAI's
 * client-side route changes via webNavigation.onHistoryStateUpdated and
 * injects there too (#2). content.js's own injection guard (see its
 * top) makes a repeat injection into an already-running page a no-op,
 * so switching between two chats that are both already working doesn't
 * double up listeners.
 */
const CONTENT_SCRIPT_FILES = ["themes-manifest.js", "content.js"];
const MATCH_PATTERN = "https://janitorai.com/chats/*";

async function injectTab(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: CONTENT_SCRIPT_FILES
    });
  } catch (err) {
    // Tab may have since navigated away, or be a page Chrome doesn't
    // allow programmatic injection into — safe to skip.
    console.warn("[JAI Theme Overlay] Could not inject into tab", tabId, err);
  }
}

async function injectIntoOpenTabs() {
  let tabs;
  try {
    tabs = await chrome.tabs.query({ url: MATCH_PATTERN });
  } catch (err) {
    console.error("[JAI Theme Overlay] Could not query open tabs:", err);
    return;
  }
  for (const tab of tabs) {
    if (tab.id) injectTab(tab.id);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  injectIntoOpenTabs();
});

// JanitorAI is a single-page app: moving from one chat to another (or
// from the site's non-chat pages into a chat) updates the URL via
// history.pushState, not a real page load — so the manifest's
// declarative content_scripts (which only fire on real navigations)
// never re-run, even though the tab's URL now matches our pattern.
// webNavigation.onHistoryStateUpdated fires on these client-side route
// changes too, so re-run the injection there. content.js's own
// __jaiThemeOverlayInjected guard makes this a no-op on a page that's
// already running the script (e.g. switching between two open chats),
// and a real (first) injection on a page that reached /chats/... only
// via in-app navigation.
chrome.webNavigation.onHistoryStateUpdated.addListener(
  (details) => {
    if (details.frameId !== 0) return; // top-level frame only
    injectTab(details.tabId);
  },
  { url: [{ hostEquals: "janitorai.com", pathContains: "/chats/" }] }
);
