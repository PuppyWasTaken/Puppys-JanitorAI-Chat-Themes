/**
 * settings-panel.js
 * -----------------
 * All the logic behind the theme picker (radio buttons, one active theme
 * at a time, from THEMES — see themes-manifest.js), the background-image
 * URL field, one color picker per text slot (from TEXT_SLOTS), and (on
 * manage.html only) the "which themes show up in the popup" checkbox
 * picker. All backed by chrome.storage.local. content.js listens for
 * storage changes and re-applies styles on the active tab automatically,
 * so this file only needs to read/write storage.
 *
 * Shared between popup.html (popup.js) and manage.html (manage.js) — both
 * pages have the same theme-list / bg-url / reset-bg / text-color-list
 * element ids, so the same initSettingsPanel() call wires up either one.
 * manage.html additionally has a #popup-theme-picker element; popup.html
 * doesn't, and that picker is skipped when it's absent.
 *
 * Per-theme storage: background URL and text colors live under
 * STORAGE_KEYS.perThemeOverrides, keyed by theme id (see
 * themes-manifest.js) — switching from Theme A to Theme B and back
 * restores whatever was saved for each theme individually, instead of
 * one shared set of values applying to every theme.
 */

// Set once initSettingsPanel() has wired up this document's fields, so
// onThemeSelect()/clearActiveTheme() — both fired from theme-list radios
// that don't otherwise know about the bg-url/text-color fields — can ask
// this document to refresh them after a theme switch.
let panel = null;

function renderThemeList(themeListEl, activeThemeId, themes) {
  themeListEl.innerHTML = "";
  themes.forEach((theme) => {
    // Every .input must be a direct sibling of the others (not nested in
    // its own wrapper) — the "checked ~ .input" chain-glow CSS relies on
    // the general sibling combinator, which only matches elements that
    // share the same parent. The label is linked via for="" instead of
    // wrapping the input, so it stays flat too.
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "active-theme";
    radio.className = "input";
    radio.id = `theme-radio-${theme.id}`;
    radio.checked = activeThemeId === theme.id;
    radio.addEventListener("change", () => onThemeSelect(theme.id));

    const label = document.createElement("label");
    label.className = "radio-label";
    label.setAttribute("for", radio.id);
    label.textContent = theme.name;

    themeListEl.appendChild(radio);
    themeListEl.appendChild(label);
  });
}

// Flips .checked on the radios that already exist, instead of tearing the
// list down and rebuilding it. This matters for more than efficiency: the
// glow-travel CSS animates a *property change on a persisting element* —
// destroying and recreating the inputs (as renderThemeList does) gives the
// browser no "before" state to transition from, so the new element just
// paints straight to its final look. Every storage-driven sync after the
// first render must go through this instead of renderThemeList.
function updateThemeSelection(themeListEl, activeThemeId) {
  themeListEl.querySelectorAll('input.input[type="radio"]').forEach((radio) => {
    const themeId = radio.id.replace(/^theme-radio-/, "");
    radio.checked = themeId === activeThemeId;
  });
}

async function onThemeSelect(themeId) {
  await chrome.storage.local.set({ [STORAGE_KEYS.activeTheme]: themeId });
  if (panel) await panel.refreshOverrideFields(themeId);
}

// Used by the yellow traffic-light dot: drops activeTheme from storage
// entirely (not just visually) so content.js's applyState() sees a null
// activeThemeId and strips the injected theme + overrides from the page,
// same as if no theme had ever been picked. updateThemeSelection(el, null)
// then unchecks every radio in this document since none can match a null id.
async function clearActiveTheme(themeListEl) {
  await chrome.storage.local.remove(STORAGE_KEYS.activeTheme);
  updateThemeSelection(themeListEl, null);
  if (panel) await panel.refreshOverrideFields(null);
}

// ---- Per-theme background URL + text color storage ----

async function setPerThemeField(themeId, field, value) {
  if (!themeId) return; // no active theme to attach this override to
  const data = await chrome.storage.local.get([STORAGE_KEYS.perThemeOverrides]);
  const all = { ...(data[STORAGE_KEYS.perThemeOverrides] || {}) };
  all[themeId] = { ...(all[themeId] || {}), [field]: value };
  await chrome.storage.local.set({ [STORAGE_KEYS.perThemeOverrides]: all });
}

async function clearPerThemeField(themeId, field) {
  if (!themeId) return;
  const data = await chrome.storage.local.get([STORAGE_KEYS.perThemeOverrides]);
  const all = { ...(data[STORAGE_KEYS.perThemeOverrides] || {}) };
  if (all[themeId]) {
    const entry = { ...all[themeId] };
    delete entry[field];
    all[themeId] = entry;
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.perThemeOverrides]: all });
}

async function onBgUrlChange(themeId, value) {
  if (value) {
    await setPerThemeField(themeId, "bgImageUrl", value);
  } else {
    await clearPerThemeField(themeId, "bgImageUrl");
  }
}

async function onTextColorChange(themeId, key, value) {
  if (!themeId) return;
  const data = await chrome.storage.local.get([STORAGE_KEYS.perThemeOverrides]);
  const all = { ...(data[STORAGE_KEYS.perThemeOverrides] || {}) };
  const textColors = { ...((all[themeId] || {}).textColors || {}), [key]: value };
  all[themeId] = { ...(all[themeId] || {}), textColors };
  await chrome.storage.local.set({ [STORAGE_KEYS.perThemeOverrides]: all });
}

async function onTextColorReset(themeId, key) {
  if (!themeId) return;
  const data = await chrome.storage.local.get([STORAGE_KEYS.perThemeOverrides]);
  const all = { ...(data[STORAGE_KEYS.perThemeOverrides] || {}) };
  if (all[themeId] && all[themeId].textColors) {
    const textColors = { ...all[themeId].textColors };
    delete textColors[key];
    all[themeId] = { ...all[themeId], textColors };
    await chrome.storage.local.set({ [STORAGE_KEYS.perThemeOverrides]: all });
  }
}

// Text *background* colors. Stored as textBgColors[slotKey] = "#rrggbb"
// or "transparent" (an explicit "no background" — different from being
// unset, which leaves whatever the theme itself paints there).
async function onTextBgChange(themeId, key, value) {
  if (!themeId) return;
  const data = await chrome.storage.local.get([STORAGE_KEYS.perThemeOverrides]);
  const all = { ...(data[STORAGE_KEYS.perThemeOverrides] || {}) };
  const textBgColors = { ...((all[themeId] || {}).textBgColors || {}), [key]: value };
  all[themeId] = { ...(all[themeId] || {}), textBgColors };
  await chrome.storage.local.set({ [STORAGE_KEYS.perThemeOverrides]: all });
}

async function onTextBgReset(themeId, key) {
  if (!themeId) return;
  const data = await chrome.storage.local.get([STORAGE_KEYS.perThemeOverrides]);
  const all = { ...(data[STORAGE_KEYS.perThemeOverrides] || {}) };
  if (all[themeId] && all[themeId].textBgColors) {
    const textBgColors = { ...all[themeId].textBgColors };
    delete textBgColors[key];
    all[themeId] = { ...all[themeId], textBgColors };
    await chrome.storage.local.set({ [STORAGE_KEYS.perThemeOverrides]: all });
  }
}

function isValidHex(value) {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

// Accepts "#abc", "#aabbcc", or the same without the leading "#" (typing
// the "#" is easy to forget), lowercased for consistent storage. Returns
// null if the result still isn't a valid hex color.
function normalizeHex(raw) {
  let value = raw.trim();
  if (!value) return null;
  if (value[0] !== "#") value = `#${value}`;
  value = value.toLowerCase();
  return isValidHex(value) ? value : null;
}

// Renders one color-row per TEXT_SLOTS entry, wired to save against
// `themeId` — the theme currently shown in this document, not
// necessarily the one active when the row was first rendered, since a
// theme switch always re-renders this list from scratch (see
// applyOverrideFields/refreshOverrideFields in initSettingsPanel).
function renderTextColorList(textColorListEl, themeId, textColors) {
  textColorListEl.innerHTML = "";
  // "hex": plain text input + swatch preview, for popup.html — native
  // <input type="color"> pickers get killed mid-drag inside a transient
  // action popup (see README), but a text field has no such problem.
  // "color" (default): the browser's native picker, for manage.html,
  // which is a real tab and doesn't have that problem.
  const mode = textColorListEl.dataset.inputMode === "hex" ? "hex" : "color";

  TEXT_SLOTS.forEach(({ key, label, defaultColor }) => {
    const row = document.createElement("div");
    row.className = "color-row";

    const labelEl = document.createElement("label");
    labelEl.setAttribute("for", `text-color-${key}`);
    labelEl.textContent = label;

    const startValue = textColors[key] || defaultColor;
    let input, swatch;

    if (mode === "hex") {
      swatch = document.createElement("span");
      swatch.className = "color-swatch";
      swatch.style.backgroundColor = startValue;

      input = document.createElement("input");
      input.type = "text";
      input.className = "hex-input";
      input.id = `text-color-${key}`;
      input.placeholder = "#rrggbb";
      input.value = startValue;
      input.maxLength = 7;
      input.addEventListener("input", () => {
        const normalized = normalizeHex(input.value);
        if (normalized) {
          input.classList.remove("invalid");
          swatch.style.backgroundColor = normalized;
          onTextColorChange(themeId, key, normalized);
        } else {
          // Don't write a half-typed value to storage — just flag it so
          // the field is visibly incomplete until it's valid again.
          input.classList.add("invalid");
        }
      });
    } else {
      input = document.createElement("input");
      input.type = "color";
      input.id = `text-color-${key}`;
      input.value = startValue;
      input.addEventListener("input", () => onTextColorChange(themeId, key, input.value));
    }

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "reset-btn";
    resetBtn.textContent = "Reset";
    resetBtn.addEventListener("click", () => {
      input.classList.remove("invalid");
      input.value = defaultColor;
      if (swatch) swatch.style.backgroundColor = defaultColor;
      onTextColorReset(themeId, key);
    });

    row.appendChild(labelEl);
    if (swatch) row.appendChild(swatch);
    row.appendChild(input);
    row.appendChild(resetBtn);
    textColorListEl.appendChild(row);
  });
}

// Renders one row per TEXT_SLOTS entry for the background behind that
// kind of text (manage.html only). Each row has three states, shown in
// its status label: "theme default" (nothing stored), a custom color, or
// "none" (explicit transparent, e.g. to strip the theme's dialogue box).
function renderTextBgList(listEl, themeId, textBgColors) {
  listEl.innerHTML = "";

  TEXT_SLOTS.forEach(({ key, label }) => {
    const stored = textBgColors[key];
    const row = document.createElement("div");
    row.className = "color-row bg-row";

    const labelEl = document.createElement("label");
    labelEl.setAttribute("for", `text-bg-${key}`);
    labelEl.textContent = label.replace(/ text$/i, "") + " background";

    const status = document.createElement("span");
    status.className = "bg-status";

    const input = document.createElement("input");
    input.type = "color";
    input.id = `text-bg-${key}`;
    input.value = stored && isValidHex(stored) ? stored : "#ffffff";

    function paintStatus(value) {
      if (!value) status.textContent = "theme default";
      else if (value === "transparent") status.textContent = "none";
      else status.textContent = value;
    }
    paintStatus(stored);

    input.addEventListener("input", () => {
      paintStatus(input.value);
      onTextBgChange(themeId, key, input.value);
    });

    const noneBtn = document.createElement("button");
    noneBtn.type = "button";
    noneBtn.className = "reset-btn";
    noneBtn.textContent = "None";
    noneBtn.title = "Remove the background behind this text";
    noneBtn.addEventListener("click", () => {
      paintStatus("transparent");
      onTextBgChange(themeId, key, "transparent");
    });

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "reset-btn";
    resetBtn.textContent = "Reset";
    resetBtn.title = "Go back to the theme's own background";
    resetBtn.addEventListener("click", () => {
      input.value = "#ffffff";
      paintStatus(null);
      onTextBgReset(themeId, key);
    });

    row.appendChild(labelEl);
    row.appendChild(status);
    row.appendChild(input);
    row.appendChild(noneBtn);
    row.appendChild(resetBtn);
    listEl.appendChild(row);
  });
}

// ---- Popup theme picker (manage.html only) ----
// Lets the user choose up to MAX_POPUP_THEMES themes to show as radio
// options in the compact toolbar popup. Nothing is written to
// STORAGE_KEYS.preferredThemes until the user touches a checkbox here —
// until then the popup falls back to the most-recently-added themes
// (see getPopupThemes() in themes-manifest.js).

async function getPreferredThemesOrDefault() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.preferredThemes]);
  const stored = data[STORAGE_KEYS.preferredThemes];
  return stored && stored.length ? stored : getPopupThemes(null).map((t) => t.id);
}

function renderPopupThemePicker(containerEl, checkedIds) {
  containerEl.innerHTML = "";
  const atMax = checkedIds.length >= MAX_POPUP_THEMES;

  THEMES.forEach((theme) => {
    const row = document.createElement("div");
    row.className = "checkbox-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `popup-theme-${theme.id}`;
    checkbox.checked = checkedIds.includes(theme.id);
    // Disable (rather than allow-then-truncate) so it's obvious *why* a
    // 4th theme won't check — no silent no-op, no need to un-check one
    // first without feedback.
    checkbox.disabled = !checkbox.checked && atMax;
    checkbox.addEventListener("change", () =>
      onPopupThemeToggle(theme.id, checkbox.checked, containerEl)
    );

    const label = document.createElement("label");
    label.setAttribute("for", checkbox.id);
    label.textContent = theme.name;

    row.appendChild(checkbox);
    row.appendChild(label);
    containerEl.appendChild(row);
  });
}

async function onPopupThemeToggle(themeId, checked, containerEl) {
  let list = await getPreferredThemesOrDefault();
  if (checked) {
    if (!list.includes(themeId) && list.length < MAX_POPUP_THEMES) list = [...list, themeId];
  } else {
    list = list.filter((id) => id !== themeId);
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.preferredThemes]: list });
  renderPopupThemePicker(containerEl, list);
}

async function initPopupThemePicker(containerEl) {
  renderPopupThemePicker(containerEl, await getPreferredThemesOrDefault());

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (STORAGE_KEYS.preferredThemes in changes) {
      const updated = changes[STORAGE_KEYS.preferredThemes].newValue;
      renderPopupThemePicker(
        containerEl,
        updated && updated.length ? updated : getPopupThemes(null).map((t) => t.id)
      );
    }
  });
}

/**
 * Wires up every control in the current document. Call once, after the
 * document's theme-list / bg-url / reset-bg elements exist — works the
 * same whether that document is popup.html or manage.html.
 *
 * text-bg-list (manage.html only) is optional too and renders the
 * per-slot "background behind this text" controls.
 *
 * text-color-list is optional (skipped if absent) and its rendering
 * mode is read from its own data-input-mode attribute: "hex" renders
 * plain text fields (popup.html), anything else renders the browser's
 * native color picker (manage.html). popup-theme-picker is likewise
 * optional and only present on manage.html.
 */
async function initSettingsPanel() {
  const isManagePage = document.body.classList.contains("manage-page");
  const themeListEl = document.getElementById("theme-list");
  const bgUrlInput = document.getElementById("bg-url");
  const resetBgBtn = document.getElementById("reset-bg");
  const textColorListEl = document.getElementById("text-color-list");
  const textBgListEl = document.getElementById("text-bg-list"); // manage.html only
  const popupThemePickerEl = document.getElementById("popup-theme-picker");

  const data = await chrome.storage.local.get([
    STORAGE_KEYS.activeTheme,
    STORAGE_KEYS.perThemeOverrides,
    STORAGE_KEYS.legacyBgImageUrl,
    STORAGE_KEYS.legacyTextColors,
    STORAGE_KEYS.preferredThemes
  ]);

  const activeThemeId = data[STORAGE_KEYS.activeTheme] || null;

  // manage.html's theme-list always shows every theme (it's the full
  // settings page); the popup only shows the user's chosen (or default)
  // subset, capped at MAX_POPUP_THEMES.
  const themesForList = isManagePage ? THEMES : getPopupThemes(data[STORAGE_KEYS.preferredThemes]);
  renderThemeList(themeListEl, activeThemeId, themesForList);

  // Finds whichever theme is checked right now in *this* document's
  // theme-list, so bg-url/text-color edits always save against the
  // theme currently shown, even right after a switch.
  function currentlyShownThemeId() {
    const checked = themeListEl.querySelector('input.input[type="radio"]:checked');
    return checked ? checked.id.replace(/^theme-radio-/, "") : null;
  }

  function paintOverrideFields(themeId, storageData) {
    const { bgImageUrl, textColors, textBgColors } = themeId
      ? getEffectiveOverridesForTheme(storageData, themeId)
      : { bgImageUrl: null, textColors: {}, textBgColors: {} };
    bgUrlInput.value = bgImageUrl || "";
    if (textColorListEl) renderTextColorList(textColorListEl, themeId, textColors);
    if (textBgListEl) renderTextBgList(textBgListEl, themeId, textBgColors);
  }
  paintOverrideFields(activeThemeId, data);

  // Re-fetches storage (rather than trusting the initial `data` snapshot)
  // so a switch some time after this document loaded still reflects
  // whatever was most recently saved for the new theme.
  async function refreshOverrideFields(themeId) {
    const fresh = await chrome.storage.local.get([
      STORAGE_KEYS.perThemeOverrides,
      STORAGE_KEYS.legacyBgImageUrl,
      STORAGE_KEYS.legacyTextColors
    ]);
    paintOverrideFields(themeId, fresh);
  }

  panel = { refreshOverrideFields };

  // Save on blur/Enter rather than every keystroke, since a URL isn't
  // usable until it's complete. Stored under the theme currently shown
  // in this document, so switching themes never overwrites another
  // theme's saved background.
  bgUrlInput.addEventListener("change", () => {
    onBgUrlChange(currentlyShownThemeId(), bgUrlInput.value.trim());
  });

  resetBgBtn.addEventListener("click", () => {
    onBgUrlChange(currentlyShownThemeId(), "");
    bgUrlInput.value = "";
  });

  if (popupThemePickerEl) initPopupThemePicker(popupThemePickerEl);

  // Keep this document's controls in sync if storage changes elsewhere —
  // e.g. the popup is open in one place while manage.html is open in a
  // tab, or vice versa.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (STORAGE_KEYS.activeTheme in changes) {
      const newId = changes[STORAGE_KEYS.activeTheme].newValue || null;
      updateThemeSelection(themeListEl, newId);
      refreshOverrideFields(newId);
    }
    if (STORAGE_KEYS.perThemeOverrides in changes) {
      refreshOverrideFields(currentlyShownThemeId());
    }
  });
}
