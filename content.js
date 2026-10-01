

(function () {
  function isChatPage() {
    return window.location.origin === "https://janitorai.com" &&
      window.location.pathname.startsWith("/chats/") && window.top === window;
  }


  if (!isChatPage()) return;


  if (window.__jaiThemeOverlayInjected) return;
  window.__jaiThemeOverlayInjected = true;

  const THEME_STYLE_ATTR = "data-jc-theme-id";
  const OVERRIDE_STYLE_ID = "jc-user-overrides";


  const RELEVANT_STORAGE_KEYS = [
    STORAGE_KEYS.activeTheme,
    STORAGE_KEYS.perThemeOverrides,
    STORAGE_KEYS.legacyBgImageUrl,
    STORAGE_KEYS.legacyTextColors
  ];

  function themeById(id) {
    return THEMES.find((t) => t.id === id);
  }


  let appliedThemeId = undefined; 

  let applyGeneration = 0;
  let routeActive = true;

  function clearPageStyles() {
    ++applyGeneration; 
    removeInjectedThemeStyles();
    removeOverrideStyle();
    appliedThemeId = undefined;
  }

  function syncRoute() {
    const active = isChatPage();
    if (active === routeActive) return;
    routeActive = active;
    if (active) start();
    else clearPageStyles();
  }

  function removeInjectedThemeStyles() {
    document
      .querySelectorAll(`style[${THEME_STYLE_ATTR}]`)
      .forEach((el) => el.remove());
  }

  function removeOverrideStyle() {
    const existing = document.getElementById(OVERRIDE_STYLE_ID);
    if (existing) existing.remove();
  }

  async function injectTheme(theme, generation) {
    try {
      const url = chrome.runtime.getURL(theme.file);
      const res = await fetch(url);
      const css = await res.text();

      if (!isChatPage() || generation !== applyGeneration) return;
      const style = document.createElement("style");
      style.setAttribute(THEME_STYLE_ATTR, theme.id);
      style.textContent = css;
      document.head.appendChild(style);
    } catch (err) {
      console.error(`[JAI Theme Overlay] Failed to load theme "${theme.id}":`, err);
    }
  }


  function mergeOverrides(themeOverrides) {
    if (!themeOverrides) return DEFAULT_OVERRIDES;
    return {
      background: themeOverrides.background || DEFAULT_OVERRIDES.background,
      text: { ...DEFAULT_OVERRIDES.text, ...(themeOverrides.text || {}) }
    };
  }

  function injectOverrides(activeThemeId, bgImageUrl, textColors, textBgColors) {
    removeOverrideStyle();
    if (!isChatPage()) return;
    const hasTextColor = textColors && Object.keys(textColors).length > 0;
    const hasTextBg = textBgColors && Object.keys(textBgColors).length > 0;
    if (!bgImageUrl && !hasTextColor && !hasTextBg) return;

    const theme = activeThemeId ? themeById(activeThemeId) : null;
    if (!theme) return;
    const overrides = mergeOverrides(theme.overrides);

    const rules = [];

    if (bgImageUrl && overrides.background) {
      const { selector, property, format } = overrides.background;
      rules.push(`${selector} { ${property}: ${format(bgImageUrl)} !important; }`);
    }

    if (hasTextColor && overrides.text) {
      TEXT_SLOTS.forEach(({ key }) => {
        const color = textColors[key];
        const slot = overrides.text[key];
        if (!color || !slot) return;
        const { selector, property, format } = slot;
        rules.push(`${selector} { ${property}: ${format(color)} !important; }`);
      });
    }


    if (hasTextBg && overrides.text) {
      TEXT_SLOTS.forEach(({ key }) => {
        const bg = textBgColors[key];
        const slot = overrides.text[key];
        if (!bg || !slot) return;
        rules.push(`${slot.selector} { background: ${bg} !important; }`);
      });
    }

    if (rules.length === 0) return;

    const style = document.createElement("style");
    style.id = OVERRIDE_STYLE_ID;
    style.textContent = rules.join("\n");
    document.head.appendChild(style);
  }

  async function applyState() {
    if (!isChatPage()) {
      syncRoute();
      clearPageStyles();
      return;
    }
    const generation = ++applyGeneration;

    const data = await chrome.storage.local.get(RELEVANT_STORAGE_KEYS);
    if (!isChatPage() || generation !== applyGeneration) return;
    const activeThemeId = data[STORAGE_KEYS.activeTheme] || null;

    const { bgImageUrl, textColors, textBgColors } = activeThemeId
      ? getEffectiveOverridesForTheme(data, activeThemeId)
      : { bgImageUrl: null, textColors: {}, textBgColors: {} };


    if (activeThemeId !== appliedThemeId) {
      removeInjectedThemeStyles();


      const theme = activeThemeId ? themeById(activeThemeId) : null;
      if (theme) {
        await injectTheme(theme, generation);

        if (!isChatPage() || generation !== applyGeneration) return;
      }
      appliedThemeId = activeThemeId;
    }

    injectOverrides(activeThemeId, bgImageUrl, textColors, textBgColors);
  }


  function start() {
    if (document.head) {
      applyState();
    } else {
      new MutationObserver((_, obs) => {
        if (document.head) {
          obs.disconnect();
          applyState();
        }
      }).observe(document, { childList: true, subtree: true });
    }
  }
  start();


  new MutationObserver(syncRoute).observe(document, { childList: true, subtree: true });
  window.addEventListener("popstate", syncRoute);
  window.addEventListener("pageshow", syncRoute);
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "jc-sync-route") return;
    syncRoute();
    sendResponse({ ready: true });
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (RELEVANT_STORAGE_KEYS.some((k) => k in changes)) {
      applyState();
    }
  });
})();
