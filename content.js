/**
 * content.js
 * ----------
 * Runs only on https://janitorai.com/chats/* (see manifest.json).
 *
 * Responsibilities:
 *   1. Read which theme is selected (radio-button, so at most one) + any
 *      user overrides from chrome.storage.local.
 *   2. Inject the selected theme's CSS file as a <style> tag, tagged so we
 *      can find/remove/replace it later.
 *   3. Inject one final <style> tag that overrides only the background
 *      image and message text colors, using DEFAULT_OVERRIDES (or the
 *      theme's own `overrides`, if it defines one) to know which
 *      selectors to target. Injected last so it always wins.
 *   4. React live to changes made in the popup (chrome.storage.onChanged)
 *      without needing a page reload.
 */

(function () {
  // Guard against double injection: this file can now be injected
  // programmatically by background.js (on extension install/reload, and
  // on JanitorAI's client-side chat-to-chat navigation — see
  // background.js) in addition to the normal manifest-declared
  // injection. Both can fire for the same already-running page (e.g.
  // switching from one open chat to another within the SPA), and a
  // second run would attach a second chrome.storage.onChanged listener,
  // double-applying every future change. This flag makes a repeat
  // injection into the same page a harmless no-op.
  if (window.__jaiThemeOverlayInjected) return;
  window.__jaiThemeOverlayInjected = true;

  const THEME_STYLE_ATTR = "data-jc-theme-id";
  const OVERRIDE_STYLE_ID = "jc-user-overrides";

  // STORAGE_KEYS, getEffectiveOverridesForTheme() come from
  // themes-manifest.js, loaded before this file (see manifest.json).
  // Background URL + text colors are stored per theme id now, so only
  // the keys relevant to that (plus the old global fallback keys) are
  // read here — preferredThemes only matters to the popup's UI.
  const RELEVANT_STORAGE_KEYS = [
    STORAGE_KEYS.activeTheme,
    STORAGE_KEYS.perThemeOverrides,
    STORAGE_KEYS.legacyBgImageUrl,
    STORAGE_KEYS.legacyTextColors
  ];

  function themeById(id) {
    return THEMES.find((t) => t.id === id);
  }

  // Which theme id is currently injected on the page, so applyState() can
  // tell a real theme switch apart from a bg-url/text-color-only change
  // and skip re-fetching + re-injecting the (up to tens of KB) theme CSS
  // file when only the override <style> needs to change.
  let appliedThemeId = undefined; // undefined = "not yet applied", distinct from null ("no theme")
  // Bumped on every applyState() call; a fetch that resolves after a newer
  // call has started is stale and must not touch the DOM.
  let applyGeneration = 0;

  function removeInjectedThemeStyles() {
    document
      .querySelectorAll(`style[${THEME_STYLE_ATTR}]`)
      .forEach((el) => el.remove());
  }

  function removeOverrideStyle() {
    const existing = document.getElementById(OVERRIDE_STYLE_ID);
    if (existing) existing.remove();
  }

  async function injectTheme(theme) {
    try {
      const url = chrome.runtime.getURL(theme.file);
      const res = await fetch(url);
      const css = await res.text();
      const style = document.createElement("style");
      style.setAttribute(THEME_STYLE_ATTR, theme.id);
      style.textContent = css;
      document.head.appendChild(style);
    } catch (err) {
      console.error(`[JAI Theme Overlay] Failed to load theme "${theme.id}":`, err);
    }
  }

  // Merges a theme's own (optional, partial) `overrides` on top of
  // DEFAULT_OVERRIDES, one level deep, so a theme only needs to specify
  // the parts it deviates on — e.g. `overrides: { background: {...} }`
  // still gets DEFAULT_OVERRIDES.text for every slot the theme doesn't
  // mention, and a theme that only overrides one text slot still gets
  // DEFAULT_OVERRIDES.text for the rest.
  function mergeOverrides(themeOverrides) {
    if (!themeOverrides) return DEFAULT_OVERRIDES;
    return {
      background: themeOverrides.background || DEFAULT_OVERRIDES.background,
      text: { ...DEFAULT_OVERRIDES.text, ...(themeOverrides.text || {}) }
    };
  }

  function injectOverrides(activeThemeId, bgImageUrl, textColors, textBgColors) {
    removeOverrideStyle();
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

    // Background behind each kind of text. Same selector as the color
    // rule; uses the `background` shorthand so it also wipes any gradient
    // or image the theme put on that element, not just its color.
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
    const generation = ++applyGeneration;

    const data = await chrome.storage.local.get(RELEVANT_STORAGE_KEYS);
    const activeThemeId = data[STORAGE_KEYS.activeTheme] || null;
    // Each theme remembers its own background URL + text colors, so
    // switching themes restores whatever was saved for *this* theme
    // rather than reusing another theme's customizations.
    const { bgImageUrl, textColors, textBgColors } = activeThemeId
      ? getEffectiveOverridesForTheme(data, activeThemeId)
      : { bgImageUrl: null, textColors: {}, textBgColors: {} };

    // Only touch the theme <style> tag when the theme itself changed.
    // A bg-url tweak or a color-picker drag only needs injectOverrides()
    // below, which is synchronous and doesn't refetch anything — this is
    // what used to re-fetch and re-inject the whole theme CSS file (up to
    // ~24KB) on every single "input" event while dragging a color picker.
    if (activeThemeId !== appliedThemeId) {
      removeInjectedThemeStyles();

      // Only the selected theme's CSS is ever injected — the radio-button
      // popup guarantees at most one theme id is stored at a time.
      const theme = activeThemeId ? themeById(activeThemeId) : null;
      if (theme) {
        await injectTheme(theme);
        // A newer applyState() ran while this fetch was in flight (e.g.
        // the user flipped themes again quickly) — its result is what
        // should be on the page, not this stale one.
        if (generation !== applyGeneration) return;
      }
      appliedThemeId = activeThemeId;
    }

    // Overrides always go in last, after the theme's own <style> tag.
    injectOverrides(activeThemeId, bgImageUrl, textColors, textBgColors);
  }

  // Initial load. document_start means <head> may not exist yet on some
  // pages, so wait for it if needed.
  function start() {
    if (document.head) {
      applyState();
    } else {
      new MutationObserver((_, obs) => {
        if (document.head) {
          obs.disconnect();
          applyState();
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  }
  start();

  // Live-update when the popup changes settings while this tab is open.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (RELEVANT_STORAGE_KEYS.some((k) => k in changes)) {
      applyState();
    }
  });
})();
