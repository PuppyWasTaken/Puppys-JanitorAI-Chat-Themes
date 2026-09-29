/**
 * THEMES
 * ------
 * Central registry of every CSS theme the extension can overlay.
 *
 * Add a new theme in two steps:
 *   1. Drop the theme's .css file into /themes/. If the file was written
 *      for Stylus/Firefox and wrapped in
 *        @-moz-document url-prefix("https://janitorai.com/chats/") { ... }
 *      strip that wrapper line and its matching closing "}" before saving
 *      it here — the content script already restricts injection to chat
 *      pages (see manifest.json), and @-moz-document isn't supported by
 *      Chrome, so leaving it in would make the whole file inert.
 *   2. Add an entry to the THEMES array below.
 *
 * Fields:
 *   id       - unique, stable string (never change once shipped; it's used
 *              as the storage key for "is this theme enabled")
 *   name     - label shown in the popup
 *   file     - path to the CSS file, relative to the extension root
 *   overrides (optional) - only needed if this theme's background image or
 *              message text live on different selectors than usual. If
 *              omitted, DEFAULT_OVERRIDES is used (see below) — that
 *              covers every theme built against JanitorAI's normal chat
 *              layout, since the site's own component classnames
 *              (messageBody_, _chatLayoutBackground_, etc.) are the same
 *              regardless of which theme is skinning them.
 *
 *              Partial overrides are fine — you don't have to repeat the
 *              parts that stay standard. A theme can set just
 *              `overrides: { background: {...} }` and its text slots will
 *              still fall back to DEFAULT_OVERRIDES.text, and vice versa.
 *              This is merged in content.js via mergeOverrides(), one
 *              level deep, per text slot key.
 */

/**
 * DEFAULT_OVERRIDES
 * -----------------
 * The things the popup lets a user customize, and exactly where each one
 * lives in JanitorAI's DOM:
 *
 *   background - the theme's background-image layer.
 *   text       - an object with one entry per kind of chat text, each
 *                independently colorable: normal paragraph text, inline
 *                (backtick) code, italics, bold, and the "dialogue" span
 *                JanitorAI wraps quoted speech in.
 */
const DEFAULT_OVERRIDES = {
  background: {
    // The dedicated background-image layer JanitorAI themes paint behind
    // the chat. Value is a full image URL the user pastes in.
    selector: '[class*="_chatLayoutBackground_"]',
    property: "background-image",
    // Wraps the raw URL the user enters into a valid CSS url() value.
    format: (value) => `url("${value}")`
  },
  text: {
    // Each key here is a TEXT_SLOTS id (see below) — one selector, one
    // color, independently.
    normal: {
      selector: '[class*="messageBody_"] p',
      property: "color",
      format: (value) => value
    },
    code: {
      selector: '[class*="messageBody_"] code:not(pre > code)',
      property: "color",
      format: (value) => value
    },
    italic: {
      selector: '[class*="messageBody_"] em',
      property: "color",
      format: (value) => value
    },
    bold: {
      selector: '[class*="messageBody_"] strong',
      property: "color",
      format: (value) => value
    },
    dialogue: {
      selector: '[class*="messageBody_"] span',
      property: "color",
      format: (value) => value
    }
  }
};

/**
 * TEXT_SLOTS
 * ----------
 * Drives the popup's list of text-color pickers, in display order. `key`
 * must match a key in every theme's `overrides.text` (or DEFAULT_OVERRIDES
 * .text) object, and is also the chrome.storage.local key suffix used to
 * persist that slot's chosen color (see STORAGE_KEYS.textColors in
 * content.js/popup.js).
 *
 * The settings page (manage.html) also offers a per-slot *background*
 * color behind each of these same kinds of text (e.g. the box behind
 * dialogue or inline code). It reuses each slot's `selector` from
 * DEFAULT_OVERRIDES.text / a theme's own overrides.text and just writes
 * `background` instead of `color`, so no extra selector config is needed.
 */
const TEXT_SLOTS = [
  { key: "normal", label: "Normal text", defaultColor: "#c59f71" },
  { key: "code", label: "Backtick text", defaultColor: "#c59f71" },
  { key: "italic", label: "Italic text", defaultColor: "#c59f71" },
  { key: "bold", label: "Bold text", defaultColor: "#c59f71" },
  { key: "dialogue", label: "Dialogue text", defaultColor: "#c59f71" }
];

const THEMES = [
  {
    id: "puppy-analog-horror",
    name: "Analog Horror / VHS-CRT",
    file: "themes/puppy-analog-horror.css"
    // overrides omitted -> uses DEFAULT_OVERRIDES
  },
  {
    id: "puppy-cottage-core",
    name: "Cottage Core",
    file: "themes/puppy-cottage-core.css"
    // overrides omitted -> uses DEFAULT_OVERRIDES
  },
  {
    id: "puppy-cyberpunk-synth",
    name: "Cyberpunk / Synth",
    file: "themes/puppy-cyberpunk-synth.css"
    // overrides omitted -> uses DEFAULT_OVERRIDES
  },
  {
    id: "puppy-instant-messenger-xp",
    name: "Instant Messenger / XP",
    file: "themes/puppy-instant-messenger-xp.css"
    // overrides omitted -> uses DEFAULT_OVERRIDES
  }
  // Add more theme entries here as they're uploaded to /themes/. New
  // entries should be appended to the END of this array — the popup's
  // default "3 most recent" theme list (see getPopupThemes() below)
  // is just the tail of this array.
];

/**
 * STORAGE_KEYS
 * ------------
 * Single source of truth for every chrome.storage.local key this
 * extension uses. Loaded by content.js (content-script world) AND by
 * settings-panel.js (popup.html / manage.html world), so the two never
 * drift out of sync on key names.
 *
 *   activeTheme       - theme id or null. Only one theme applies at a time.
 *   perThemeOverrides - { [themeId]: { bgImageUrl, textColors, textBgColors } }. Each
 *                       theme remembers its own background URL and text
 *                       colors, so switching from Theme A to Theme B and
 *                       back restores whatever was set for each theme,
 *                       instead of one shared set of colors bleeding
 *                       across every theme.
 *   legacyBgImageUrl / legacyTextColors - the old, pre-per-theme storage
 *                       shape. Kept only as a one-time fallback: a theme
 *                       that has no perThemeOverrides entry of its own
 *                       yet falls back to these instead of losing a
 *                       customization made before this update. Nothing
 *                       writes to these two keys anymore.
 *   preferredThemes   - up to MAX_POPUP_THEMES theme ids, in display
 *                       order, chosen (via manage.html) to show as radio
 *                       options in the compact toolbar popup. Empty or
 *                       missing -> the popup falls back to the
 *                       MAX_POPUP_THEMES most recently added themes.
 */
const STORAGE_KEYS = {
  activeTheme: "activeTheme",
  perThemeOverrides: "perThemeOverrides",
  legacyBgImageUrl: "bgImageUrl",
  legacyTextColors: "textColors",
  preferredThemes: "preferredThemes"
};

// Max number of theme radio options shown in the compact toolbar popup.
// The full list is always available on the settings page (manage.html).
const MAX_POPUP_THEMES = 3;

/**
 * Resolves the background URL + text colors that should apply for one
 * theme id, given a storage snapshot (whatever keys were passed to
 * chrome.storage.local.get). Falls back to the pre-per-theme global
 * values only when this particular theme has never had its own entry
 * saved yet.
 */
function getEffectiveOverridesForTheme(storageData, themeId) {
  const perTheme = (storageData[STORAGE_KEYS.perThemeOverrides] || {})[themeId];
  if (perTheme) {
    return {
      bgImageUrl: perTheme.bgImageUrl || null,
      textColors: perTheme.textColors || {},
      // { [slotKey]: "#rrggbb" | "transparent" } — background behind that
      // kind of text. A missing key means "leave the theme's own
      // background alone".
      textBgColors: perTheme.textBgColors || {}
    };
  }
  return {
    bgImageUrl: storageData[STORAGE_KEYS.legacyBgImageUrl] || null,
    textColors: storageData[STORAGE_KEYS.legacyTextColors] || {},
    textBgColors: {}
  };
}

/**
 * Which themes should render as radio options in the compact popup:
 * the user's chosen preferredThemes (set on the settings page), or, if
 * they haven't picked any yet, the MAX_POPUP_THEMES most recently added
 * themes (the tail of THEMES).
 */
function getPopupThemes(preferredIds) {
  if (preferredIds && preferredIds.length > 0) {
    const picked = preferredIds.map((id) => THEMES.find((t) => t.id === id)).filter(Boolean);
    if (picked.length > 0) return picked.slice(0, MAX_POPUP_THEMES);
  }
  return THEMES.slice(-MAX_POPUP_THEMES);
}
