/**
 * popup.js
 * --------
 * The popup itself only does two things: wire up the shared settings
 * panel (see settings-panel.js) against this document's elements, and
 * open the full settings page (manage.html) when asked to. Everything
 * else — rendering the theme list, the color pickers, reading/writing
 * chrome.storage.local — lives in settings-panel.js so manage.html can
 * reuse it unchanged.
 */

document.getElementById("open-manage").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// Traffic-light dots above the heading: red closes the popup, yellow clears
// the active theme (storage + radio state), green opens the same settings
// page as the "Settings ⚙" button below.
document.getElementById("dot-close").addEventListener("click", () => {
  window.close();
});

document.getElementById("dot-clear").addEventListener("click", () => {
  clearActiveTheme(document.getElementById("theme-list"));
});

document.getElementById("dot-settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// The dots are divs with role="button" (not real <button>s, to match the
// plain circle/box markup) so they need their own Enter/Space handling for
// keyboard + screen-reader users — a real <button> would get this for free.
document.querySelectorAll(".circle[role='button']").forEach((el) => {
  el.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      el.click();
    }
  });
});

// chrome.runtime.openOptionsPage() can't target a URL fragment, so this
// one opens manage.html directly via window.open() (a real tab, not the
// transient popup — no "tabs" permission needed for that) scrolled to
// the text-colors section. Same reason those pickers don't live in this
// popup anymore: see the color-picker note in README.md.
document.getElementById("open-manage-colors").addEventListener("click", () => {
  window.open(chrome.runtime.getURL("manage.html#text-colors"), "_blank");
});

initSettingsPanel();
