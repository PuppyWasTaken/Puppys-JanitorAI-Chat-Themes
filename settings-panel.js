let panel = null;

function renderThemeList(themeListEl, activeThemeId, themes) {
  themeListEl.innerHTML = "";
  themes.forEach((theme) => {

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

async function clearActiveTheme(themeListEl) {
  await chrome.storage.local.remove(STORAGE_KEYS.activeTheme);
  updateThemeSelection(themeListEl, null);
  if (panel) await panel.refreshOverrideFields(null);
}

let overrideWriteQueue = Promise.resolve();

function updatePerThemeOverrides(themeId, update) {
  if (!themeId) return Promise.resolve();
  const write = overrideWriteQueue.then(async () => {
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.perThemeOverrides, STORAGE_KEYS.legacyBgImageUrl, STORAGE_KEYS.legacyTextColors
    ]);
    const all = { ...(data[STORAGE_KEYS.perThemeOverrides] || {}) };
    const entry = { ...(all[themeId] || getEffectiveOverridesForTheme(data, themeId)) };
    update(entry);
    all[themeId] = entry;
    await chrome.storage.local.set({ [STORAGE_KEYS.perThemeOverrides]: all });
  });
  overrideWriteQueue = write.catch((error) => console.error("Could not save theme overrides:", error));
  return write;
}

function setPerThemeField(themeId, field, value) {
  return updatePerThemeOverrides(themeId, (entry) => { entry[field] = value; });
}

function clearPerThemeField(themeId, field) {
  return updatePerThemeOverrides(themeId, (entry) => { delete entry[field]; });
}

async function onBgUrlChange(themeId, value) {
  if (value) {
    await setPerThemeField(themeId, "bgImageUrl", value);
  } else {
    await clearPerThemeField(themeId, "bgImageUrl");
  }
}

function onTextColorChange(themeId, key, value) {
  return updatePerThemeOverrides(themeId, (entry) => {
    splitSharedColor(entry, key);
    entry.textColors = { ...(entry.textColors || {}), [key]: value };
  });
}

function onTextColorReset(themeId, key) {
  return updatePerThemeOverrides(themeId, (entry) => {
    splitSharedColor(entry, key);
    const textColors = { ...(entry.textColors || {}) };
    delete textColors[key];
    entry.textColors = textColors;
  });
}

function splitSharedColor(entry, key) {
  if (!key.includes(".")) return;
  const baseKey = key.split(".")[1];
  if (!entry.textColors || !entry.textColors[baseKey]) return;
  const colors = { ...entry.textColors };
  for (const scope of ["char", "user"]) {
    if (!colors[`${scope}.${baseKey}`]) colors[`${scope}.${baseKey}`] = colors[baseKey];
  }
  delete colors[baseKey];
  entry.textColors = colors;
}

function onTextBgChange(themeId, key, value) {
  return updatePerThemeOverrides(themeId, (entry) => {
    entry.textBgColors = { ...(entry.textBgColors || {}), [key]: value };
  });
}

function onTextBgReset(themeId, key) {
  return updatePerThemeOverrides(themeId, (entry) => {
    const textBgColors = { ...(entry.textBgColors || {}) };
    delete textBgColors[key];
    entry.textBgColors = textBgColors;
  });
}

function isValidHex(value) {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

function normalizeHex(raw) {
  let value = raw.trim();
  if (!value) return null;
  if (value[0] !== "#") value = `#${value}`;
  value = value.toLowerCase();
  return isValidHex(value) ? value : null;
}


function renderTextColorList(textColorListEl, themeId, textColors, slots) {

  const renderedTheme = themeId || "";
  if (textColorListEl.dataset.renderedTheme === renderedTheme) {
    slots.forEach(({ key, baseKey, defaultColor }) => {
      const input = document.getElementById(`text-color-${key}`);
      const value = colorToHex(textColors[key] || textColors[baseKey], defaultColor);
      // Never reset a focused picker or interrupt a partially typed hex.
      if (document.activeElement === input) return;
      if (input.value !== value) input.value = value;
      input.classList.remove("invalid");
      const swatch = input.parentElement.querySelector(".color-swatch");
      if (swatch) swatch.style.backgroundColor = value;
    });
    return;
  }
  textColorListEl.dataset.renderedTheme = renderedTheme;
  textColorListEl.innerHTML = "";

  const mode = textColorListEl.dataset.inputMode === "hex" ? "hex" : "color";

  slots.forEach(({ key, baseKey, label, defaultColor }) => {
    const row = document.createElement("div");
    row.className = "color-row";

    const labelEl = document.createElement("label");
    labelEl.setAttribute("for", `text-color-${key}`);
    labelEl.textContent = label;

    const startValue = colorToHex(textColors[key] || textColors[baseKey], defaultColor);
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

function renderTextDecorationList(listEl, themeId, colors, slots) {
  const renderedTheme = themeId || "";
  if (listEl.dataset.renderedTheme === renderedTheme) {
    slots.forEach(({ key, defaultDecorationColor }) => {
      const input = document.getElementById(`text-decoration-${key}`);
      if (document.activeElement === input) return;
      input.value = colorToHex(colors[key], defaultDecorationColor);
      input.parentElement.querySelector(".bg-status").textContent = colors[key] || "theme default";
    });
    return;
  }
  listEl.dataset.renderedTheme = renderedTheme;
  listEl.innerHTML = "";
  slots.forEach(({ key, label, defaultDecorationColor }) => {
    const row = document.createElement("div");
    row.className = "color-row bg-row";
    const labelEl = document.createElement("label");
    labelEl.htmlFor = `text-decoration-${key}`;
    labelEl.textContent = label;
    const status = document.createElement("span");
    status.className = "bg-status";
    status.textContent = colors[key] || "theme default";
    const input = document.createElement("input");
    input.type = "color";
    input.id = labelEl.htmlFor;
    input.value = colorToHex(colors[key], defaultDecorationColor);
    input.addEventListener("input", () => {
      const value = input.value;
      status.textContent = value;
      updatePerThemeOverrides(themeId, (entry) => {
        entry.textDecorationColors = { ...(entry.textDecorationColors || {}), [key]: value };
      });
    });
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "reset-btn";
    reset.textContent = "Reset";
    reset.title = "Restore the theme's original text decoration";
    reset.addEventListener("click", () => {
      input.value = defaultDecorationColor;
      status.textContent = "theme default";
      updatePerThemeOverrides(themeId, (entry) => {
        const values = { ...(entry.textDecorationColors || {}) };
        delete values[key];
        entry.textDecorationColors = values;
      });
    });
    row.append(labelEl, status, input, reset);
    listEl.appendChild(row);
  });
}


function renderTextBgList(listEl, themeId, textBgColors) {
  const renderedTheme = themeId || "";
  if (listEl.dataset.renderedTheme === renderedTheme) {
    TEXT_SLOTS.forEach(({ key }) => {
      const input = document.getElementById(`text-bg-${key}`);
      if (document.activeElement === input) return;
      const stored = textBgColors[key];
      const value = stored && isValidHex(stored) ? stored : "#ffffff";
      if (input.value !== value) input.value = value;
      input.parentElement.querySelector(".bg-status").textContent =
        !stored ? "theme default" : stored === "transparent" ? "none" : stored;
    });
    return;
  }
  listEl.dataset.renderedTheme = renderedTheme;
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


async function initSettingsPanel() {
  const isManagePage = document.body.classList.contains("manage-page");
  const themeListEl = document.getElementById("theme-list");
  const bgUrlInput = document.getElementById("bg-url");
  const resetBgBtn = document.getElementById("reset-bg");
  const textColorListEl = document.getElementById("text-color-list");
  const textBgListEl = document.getElementById("text-bg-list"); // manage.html only
  const textDecorationListEl = document.getElementById("text-decoration-list");
  const messageColorHelpEl = document.getElementById("message-color-help");
  const popupThemePickerEl = document.getElementById("popup-theme-picker");
  const cursorEnabledInput = document.getElementById("cursor-enabled"); // settings page only
  const cursorSizeInput = document.getElementById("cursor-size");

  const data = await chrome.storage.local.get([
    STORAGE_KEYS.activeTheme,
    STORAGE_KEYS.perThemeOverrides,
    STORAGE_KEYS.legacyBgImageUrl,
    STORAGE_KEYS.legacyTextColors,
    STORAGE_KEYS.preferredThemes
  ]);

  const activeThemeId = data[STORAGE_KEYS.activeTheme] || null;


  const themesForList = isManagePage ? THEMES : getPopupThemes(data[STORAGE_KEYS.preferredThemes]);
  renderThemeList(themeListEl, activeThemeId, themesForList);


  function currentlyShownThemeId() {
    const checked = themeListEl.querySelector('input.input[type="radio"]:checked');
    return checked ? checked.id.replace(/^theme-radio-/, "") : null;
  }

  let paintGeneration = 0;
  async function paintOverrideFields(themeId, storageData) {
    const generation = ++paintGeneration;
    const config = await loadThemeTextConfig(themeId);
    if (generation !== paintGeneration || themeId !== currentlyShownThemeId()) return;
    const { bgImageUrl, textColors, textBgColors, textDecorationColors = {} } = themeId
      ? getEffectiveOverridesForTheme(storageData, themeId)
      : { bgImageUrl: null, textColors: {}, textBgColors: {} };
    if (document.activeElement !== bgUrlInput) bgUrlInput.value = bgImageUrl || "";
    if (textColorListEl) renderTextColorList(textColorListEl, themeId, textColors, config.slots);
    if (textBgListEl) renderTextBgList(textBgListEl, themeId, textBgColors);
    if (textDecorationListEl) renderTextDecorationList(textDecorationListEl, themeId, textDecorationColors, config.slots);
    if (messageColorHelpEl) messageColorHelpEl.hidden = !config.separateMessages;
    if (cursorEnabledInput && cursorSizeInput) {
      const cursor = getCursorSettings(storageData, themeId);
      cursorEnabledInput.checked = cursor.enabled;
      cursorEnabledInput.disabled = !themeId;
      cursorSizeInput.value = cursor.size === null ? "" : String(cursor.size);
      cursorSizeInput.disabled = !themeId || !cursor.enabled;
    }
    document.querySelectorAll("#text-color-list input, #text-color-list button, #text-bg-list input, #text-bg-list button, #text-decoration-list input, #text-decoration-list button, #bg-url, #reset-bg").forEach((control) => {
      control.disabled = !themeId;
    });
  }
  paintOverrideFields(activeThemeId, data);


  async function refreshOverrideFields(themeId) {
    const fresh = await chrome.storage.local.get([
      STORAGE_KEYS.perThemeOverrides,
      STORAGE_KEYS.legacyBgImageUrl,
      STORAGE_KEYS.legacyTextColors
    ]);

    if (themeId === currentlyShownThemeId()) await paintOverrideFields(themeId, fresh);
  }

  panel = { refreshOverrideFields };


  bgUrlInput.addEventListener("change", () => {
    onBgUrlChange(currentlyShownThemeId(), bgUrlInput.value.trim());
  });

  resetBgBtn.addEventListener("click", () => {
    onBgUrlChange(currentlyShownThemeId(), "");
    bgUrlInput.value = "";
  });

  if (popupThemePickerEl) initPopupThemePicker(popupThemePickerEl);

  if (cursorEnabledInput && cursorSizeInput) {
    cursorEnabledInput.addEventListener("change", () => {
      cursorSizeInput.disabled = !currentlyShownThemeId() || !cursorEnabledInput.checked;
      setPerThemeField(currentlyShownThemeId(), "cursorEnabled", cursorEnabledInput.checked);
    });
    cursorSizeInput.addEventListener("change", () => {
      const themeId = currentlyShownThemeId();
      if (cursorSizeInput.value === "") {
        clearPerThemeField(themeId, "cursorSize");
      } else {
        const size = Number(cursorSizeInput.value);
        if (CURSOR_SIZES.includes(size)) setPerThemeField(themeId, "cursorSize", size);
      }
    });
  }


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
