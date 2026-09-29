/**
 * manage.js
 * ---------
 * The full-page settings view opened from the popup's "More themes &
 * settings" button (via chrome.runtime.openOptionsPage(), registered as
 * this extension's options_page in manifest.json). Same controls as the
 * popup, just laid out full-page — all the actual logic lives in
 * settings-panel.js, shared with popup.js.
 */

initSettingsPanel();
