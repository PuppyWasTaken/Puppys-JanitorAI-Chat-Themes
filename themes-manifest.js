const DEFAULT_OVERRIDES = {
  background: {
    selector: '[class*="_chatLayoutBackground_"]',
    property: "background-image",
    format: (value) => `url(${JSON.stringify(value)})`
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
  },
  {
    id: "puppy-text-messages-light",
    name: "Text Messenger / Light",
    file: "themes/puppy-text-messages-light.css"
  },
  {
    id: "puppy-text-messages-dark",
    name: "Text Messenger / Dark",
    file: "themes/puppy-text-messages-dark.css"
  },
  {
    id: "puppy-discord-dark",
    name: "Discord Dark",
    file: "themes/puppy-discord-dark.css"
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
const CURSOR_SIZES = [16, 24, 32, 48, 64, 96, 128];

function getCursorSettings(storageData, themeId) {
  const entry = (storageData[STORAGE_KEYS.perThemeOverrides] || {})[themeId] || {};
  return {
    enabled: entry.cursorEnabled !== false,
    size: CURSOR_SIZES.includes(entry.cursorSize) ? entry.cursorSize : null
  };
}

function getEffectiveOverridesForTheme(storageData, themeId) {
  const perTheme = (storageData[STORAGE_KEYS.perThemeOverrides] || {})[themeId];
  if (perTheme) {
    return {
      bgImageUrl: perTheme.bgImageUrl || null,
      textColors: perTheme.textColors || {},
      // { [slotKey]: "#rrggbb" | "transparent" } — background behind that
      // kind of text. A missing key means "leave the theme's own
      // background alone".
      textBgColors: perTheme.textBgColors || {},
      textDecorationColors: perTheme.textDecorationColors || {}
    };
  }
  return {
    bgImageUrl: storageData[STORAGE_KEYS.legacyBgImageUrl] || null,
    textColors: storageData[STORAGE_KEYS.legacyTextColors] || {},
    textBgColors: {},
    textDecorationColors: {}
  };
}

function getPopupThemes(preferredIds) {
  if (preferredIds && preferredIds.length > 0) {
    const picked = preferredIds.map((id) => THEMES.find((t) => t.id === id)).filter(Boolean);
    if (picked.length > 0) return picked.slice(0, MAX_POPUP_THEMES);
  }
  return THEMES.slice(-MAX_POPUP_THEMES);
}

const MESSAGE_SCOPES = {
  char: ':is(div[data-index$="0"], div[data-index$="2"], div[data-index$="4"], div[data-index$="6"], div[data-index$="8"])',
  user: ':is(div[data-index$="1"], div[data-index$="3"], div[data-index$="5"], div[data-index$="7"], div[data-index$="9"])'
};
const themeTextConfigs = new Map();

function colorToHex(value, fallback) {
  if (!value || value === "currentcolor" || value === "inherit") return fallback;
  const context = document.createElement("canvas").getContext("2d");
  context.fillStyle = fallback;
  context.fillStyle = value;
  return /^#[\da-f]{6}$/i.test(context.fillStyle) ? context.fillStyle : fallback;
}

// Parse with the browser's CSS parser, including nested rules. This stylesheet
// is never attached to the page; imports and external assets are not loaded.
function parseThemeTextConfig(css) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css.replace(/@import\s+[^;]+;/gi, ""));
  const declarations = { all: {}, char: {}, user: {} };
  let separateMessages = false;
  function visit(rules, parentSelector = "") {
    for (const rule of rules) {
      const selector = rule.selectorText
        ? `${parentSelector} ${rule.selectorText}`.trim() : parentSelector;
      const scope = /data-index\$=["']1["']/.test(selector) ? "user"
        : /data-index\$=["']0["']/.test(selector) ? "char" : "all";
      if (rule.style && !selector.includes("::")) {
        for (const { key } of TEXT_SLOTS) {
          const slotSelector = DEFAULT_OVERRIDES.text[key].selector;
          if (!selector.endsWith(slotSelector)) continue;
          const values = declarations[scope][key] ||= {};
          for (const property of ["color", "text-decoration-line", "text-decoration-style", "text-decoration-thickness", "text-decoration-color"]) {
            const value = rule.style.getPropertyValue(property);
            if (value) values[property] = value;
          }
          if (scope !== "all" && rule.style.color) separateMessages = true;
        }
      }
      if (rule.cssRules) visit(rule.cssRules, selector);
    }
  }
  visit(sheet.cssRules);
  const scopes = separateMessages ? ["char", "user"] : ["all"];
  const slots = scopes.flatMap((scope) => TEXT_SLOTS.map((slot) => {
    const values = { ...declarations.all[slot.key], ...declarations[scope][slot.key] };
    const normal = { ...declarations.all.normal, ...declarations[scope].normal };
    const defaultColor = colorToHex(values.color || normal.color, slot.defaultColor);
    const line = values["text-decoration-line"];
    return {
      ...slot,
      key: scope === "all" ? slot.key : `${scope}.${slot.key}`,
      baseKey: slot.key,
      label: scope === "all" ? slot.label : `${scope === "char" ? "Character" : "User"} — ${slot.label}`,
      selector: `${scope === "all" ? "" : MESSAGE_SCOPES[scope] + " "}${DEFAULT_OVERRIDES.text[slot.key].selector}`,
      defaultColor,
      defaultDecorationColor: colorToHex(values["text-decoration-color"], defaultColor),
      decorationLine: line && line !== "initial" ? line : "underline",
      decorationStyle: values["text-decoration-style"] || "solid",
      decorationThickness: values["text-decoration-thickness"] && values["text-decoration-thickness"] !== "auto"
        ? values["text-decoration-thickness"] : "1px"
    };
  }));
  return { separateMessages, slots };
}

async function loadThemeTextConfig(themeId) {
  if (!themeTextConfigs.has(themeId)) {
    themeTextConfigs.set(themeId, (async () => {
      const theme = THEMES.find((item) => item.id === themeId);
      if (!theme) return parseThemeTextConfig("");
      try {
        const response = await fetch(chrome.runtime.getURL(theme.file));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return parseThemeTextConfig(await response.text());
      } catch (error) {
        console.error("Could not read theme text defaults:", error);
        return parseThemeTextConfig("");
      }
    })());
  }
  return themeTextConfigs.get(themeId);
}

function buildTextOverrideRules(config, textColors, textDecorationColors) {
  const rules = [];
  // Keep existing all-message colour overrides working; scoped values win.
  for (const slot of config.slots) {
    const color = textColors[slot.key] || textColors[slot.baseKey];
    const decoration = textDecorationColors[slot.key] || textDecorationColors[slot.baseKey];
    if (/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color || "")) {
      rules.push(`${slot.selector} { color: ${color} !important; }`);
    }
    if (/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(decoration || "")) {
      rules.push(`${slot.selector} { text-decoration-line: ${slot.decorationLine} !important; text-decoration-style: ${slot.decorationStyle} !important; text-decoration-thickness: ${slot.decorationThickness} !important; text-decoration-color: ${decoration} !important; }`);
    }
  }
  return rules;
}
