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
  const CURSOR_ASSET_ROOT = "https://file.garden/aWyedZylm2AE_XoC/Extension%20Assets/";
  const CURSOR_ASSET_FILES = [
    "puppyanalogcursor.png",
    "puppycottagecursor.png",
    "puppycybercusor.png",
    "puppyminimaldarkcusor.png",
    "puppyminimallightcursor.png",
    "puppyxpcursor.png"
  ];


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
  let themeStyle = null;
  let overrideStyle = null;
  let cursorDeclarations = [];
  let cursorSheet = null;
  let themeImports = "";
  const resizedCursors = new Map();
  let reorderCount = 0;
  let reorderWindowStart = 0;

  function ensureStyleOrder(fromMutation = false) {
    const root = document.documentElement;
    if (!isChatPage() || !root) return;
    const styles = [themeStyle, overrideStyle].filter(Boolean);
    if (styles.length === 0) return;
    let node = root.lastChild;
    for (let i = styles.length - 1; i >= 0; --i) {
      if (node !== styles[i]) {
        if (fromMutation) {
          const now = performance.now();
          if (now - reorderWindowStart > 250) {
            reorderWindowStart = now;
            reorderCount = 0;
          }
          if (++reorderCount > 10) return;
        }
        styles.forEach((style) => root.appendChild(style));
        return;
      }
      node = node.previousSibling;
    }
  }

  function clearPageStyles() {
    ++applyGeneration; 
    reorderCount = 0;
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
    if (themeStyle) themeStyle.remove();
    themeStyle = null;
    cursorDeclarations = [];
    cursorSheet = null;
    themeImports = "";
    document
      .querySelectorAll(`style[${THEME_STYLE_ATTR}]`)
      .forEach((el) => el.remove());
  }

  function removeOverrideStyle() {
    if (overrideStyle) overrideStyle.remove();
    overrideStyle = null;
    const existing = document.getElementById(OVERRIDE_STYLE_ID);
    if (existing) existing.remove();
  }

  async function injectTheme(theme, generation) {
    try {
      const url = chrome.runtime.getURL(theme.file);
      const res = await fetch(url);
      let css = await res.text();
      // Use packaged originals for both native-size and resized cursors,
      // avoiding remote-image CORS and canvas-loading failures.
      for (const file of CURSOR_ASSET_FILES) {
        css = css.replaceAll(CURSOR_ASSET_ROOT + file, chrome.runtime.getURL(`cursors/${file}`));
      }

      if (!isChatPage() || generation !== applyGeneration) return;
      // Work on a detached sheet so moving the live <style> cannot discard
      // cursor edits. Preserve complete import URLs, including semicolons.
      const importPattern = /@import\s+(?:url\(\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^)]*)\s*\)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')[^;]*;/gi;
      themeImports = (css.match(importPattern) || []).join("\n");
      cursorSheet = new CSSStyleSheet();
      cursorSheet.replaceSync(css.replace(importPattern, ""));
      collectCursorDeclarations(cursorSheet.cssRules);
      const style = document.createElement("style");
      style.setAttribute(THEME_STYLE_ATTR, theme.id);
      style.textContent = css;
      themeStyle = style;
      document.documentElement.appendChild(style);
    } catch (err) {
      console.error(`[JAI Theme Overlay] Failed to load theme "${theme.id}":`, err);
    }
  }

  function renderCursorTheme() {
    if (!themeStyle || !cursorSheet) return;
    const css = themeImports + "\n" + [...cursorSheet.cssRules].map((rule) => rule.cssText).join("\n");
    // Persist edits in textContent so style reordering cannot reset the cursor.
    if (themeStyle.textContent !== css) themeStyle.textContent = css;
  }

  // Keep the original declarations so disabling a custom cursor removes only
  // the theme's image, not native link/text cursors or other theme styling.
  function collectCursorDeclarations(rules) {
    for (const rule of rules) {
      if (rule.style) {
        const value = rule.style.getPropertyValue("cursor");
        if (/url\(/i.test(value)) {
          cursorDeclarations.push({
            style: rule.style,
            value,
            priority: rule.style.getPropertyPriority("cursor")
          });
        }
      }
      if (rule.cssRules) collectCursorDeclarations(rule.cssRules);
    }
  }

  function resizeCursorImage(url, size) {
    const key = `${url}:${size}`;
    if (!resizedCursors.has(key)) {
      const result = (async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Could not load cursor image: HTTP ${response.status}`);
        // Decode packaged bytes directly into an origin-clean bitmap.
        const image = await createImageBitmap(await response.blob());
        try {
          const scale = size / Math.max(image.width, image.height);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas is unavailable for cursor resizing");
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          return { url: canvas.toDataURL("image/png"), scale, width: canvas.width, height: canvas.height };
        } finally {
          image.close();
        }
      })();
      resizedCursors.set(key, result);
      // Failed requests may be retried on the next settings change.
      result.catch(() => resizedCursors.delete(key));
    }
    return resizedCursors.get(key);
  }

  async function resizeCursorValue(value, size) {
    // Preserve fallback cursors and scale explicit click hotspots as well.
    const pattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)(?:\s+(\d+)\s+(\d+))?/gi;
    const matches = [...value.matchAll(pattern)];
    const replacements = await Promise.all(matches.map(async (match) => {
      const url = match[1] ?? match[2] ?? match[3];
      if (!url) return match[0];
      const resized = await resizeCursorImage(url, size);
      const x = Math.min(resized.width - 1, Math.round(Number(match[4] || 0) * resized.scale));
      const y = Math.min(resized.height - 1, Math.round(Number(match[5] || 0) * resized.scale));
      return `url(${JSON.stringify(resized.url)}) ${x} ${y}`;
    }));
    let index = 0;
    return value.replace(pattern, () => replacements[index++]);
  }

  async function applyCursorSettings(settings, generation) {
    const declarations = cursorDeclarations;
    // Restore immediately, so an old size never lingers while a new one loads.
    for (const { style, value, priority } of declarations) {
      if (settings.enabled) style.setProperty("cursor", value, priority);
      else style.removeProperty("cursor");
    }
    renderCursorTheme();
    if (!settings.enabled || settings.size === null) return;
    await Promise.all(declarations.map(async ({ style, value, priority }) => {
      try {
        const resized = await resizeCursorValue(value, settings.size);
        if (!isChatPage() || generation !== applyGeneration) return;
        style.setProperty("cursor", resized, priority);
      } catch (error) {
        // Keep the original packaged cursor if decoding or resizing fails.
        console.warn("[JAI Theme Overlay] Could not resize custom cursor:", error);
      }
    }));
    if (isChatPage() && generation === applyGeneration) renderCursorTheme();
  }


  function mergeOverrides(themeOverrides) {
    if (!themeOverrides) return DEFAULT_OVERRIDES;
    return {
      background: themeOverrides.background || DEFAULT_OVERRIDES.background,
      text: { ...DEFAULT_OVERRIDES.text, ...(themeOverrides.text || {}) }
    };
  }

  function injectOverrides(activeThemeId, bgImageUrl, textColors, textBgColors, textDecorationColors, textConfig) {
    removeOverrideStyle();
    if (!isChatPage()) return;
    const hasTextColor = textColors && Object.keys(textColors).length > 0;
    const hasTextBg = textBgColors && Object.keys(textBgColors).length > 0;
    const hasDecoration = Object.keys(textDecorationColors).length > 0;
    if (!bgImageUrl && !hasTextColor && !hasTextBg && !hasDecoration) return;

    const theme = activeThemeId ? themeById(activeThemeId) : null;
    if (!theme) return;
    const overrides = mergeOverrides(theme.overrides);

    const rules = [];

    if (bgImageUrl && overrides.background) {
      const { selector, property, format } = overrides.background;
      rules.push(`${selector} { ${property}: ${format(bgImageUrl)} !important; }`);
    }

    rules.push(...buildTextOverrideRules(textConfig, textColors, textDecorationColors));


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
    overrideStyle = style;
    document.documentElement.appendChild(style);
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

    const { bgImageUrl, textColors, textBgColors, textDecorationColors = {} } = activeThemeId
      ? getEffectiveOverridesForTheme(data, activeThemeId)
      : { bgImageUrl: null, textColors: {}, textBgColors: {} };

    const textConfig = await loadThemeTextConfig(activeThemeId);
    if (!isChatPage() || generation !== applyGeneration) return;


    if (activeThemeId !== appliedThemeId) {
      removeInjectedThemeStyles();


      const theme = activeThemeId ? themeById(activeThemeId) : null;
      if (theme) {
        await injectTheme(theme, generation);

        if (!isChatPage() || generation !== applyGeneration) return;
      }
      appliedThemeId = activeThemeId;
    }

    injectOverrides(activeThemeId, bgImageUrl, textColors, textBgColors, textDecorationColors, textConfig);
    ensureStyleOrder();
    await applyCursorSettings(getCursorSettings(data, activeThemeId), generation);
  }


  function start() {
    if (document.documentElement) {
      applyState();
    } else {
      new MutationObserver((_, obs) => {
        if (document.documentElement) {
          obs.disconnect();
          applyState();
        }
      }).observe(document, { childList: true, subtree: true });
    }
  }
  start();


  new MutationObserver(() => {
    syncRoute();
    ensureStyleOrder(true);
  }).observe(document, { childList: true, subtree: true });
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
