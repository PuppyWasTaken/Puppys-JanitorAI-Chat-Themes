const DEFAULT_OVERRIDES = {
  background: {
    selector: '[class*="_chatLayoutBackground_"]',
    property: "background-image",
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
];

const STORAGE_KEYS = {
  activeTheme: "activeTheme",
  perThemeOverrides: "perThemeOverrides",
  legacyBgImageUrl: "bgImageUrl",
  legacyTextColors: "textColors",
  preferredThemes: "preferredThemes",
  setupNoticeDismissed: "setupNoticeDismissed"
};

const MAX_POPUP_THEMES = 3;

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

function getPopupThemes(preferredIds) {
  if (preferredIds && preferredIds.length > 0) {
    const picked = preferredIds.map((id) => THEMES.find((t) => t.id === id)).filter(Boolean);
    if (picked.length > 0) return picked.slice(0, MAX_POPUP_THEMES);
  }
  return THEMES.slice(-MAX_POPUP_THEMES);
}
