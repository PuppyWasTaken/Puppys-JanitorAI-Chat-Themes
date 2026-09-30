

document.getElementById("open-manage").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});


document.getElementById("dot-close").addEventListener("click", () => {
  window.close();
});

document.getElementById("dot-clear").addEventListener("click", () => {
  clearActiveTheme(document.getElementById("theme-list"));
});

document.getElementById("dot-settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});


document.querySelectorAll(".circle[role='button']").forEach((el) => {
  el.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      el.click();
    }
  });
});


document.getElementById("open-manage-colors").addEventListener("click", () => {
  window.open(chrome.runtime.getURL("manage.html#text-colors"), "_blank");
});


document.querySelectorAll('.links a[href^="https://"]').forEach((link) => {
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", link.hostname === "github.com" ? "GitHub repository" : "Puppy's personal site");
  link.addEventListener("click", (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: link.href });
  });
});

async function initSetupNotice() {
  const notice = document.getElementById("setup-notice");
  const dismissButton = document.getElementById("dismiss-setup-notice");
  const data = await chrome.storage.local.get(STORAGE_KEYS.setupNoticeDismissed);
  notice.hidden = data[STORAGE_KEYS.setupNoticeDismissed] === true;

  dismissButton.addEventListener("click", async () => {
    dismissButton.disabled = true;
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.setupNoticeDismissed]: true });
      notice.hidden = true;
    } finally {
      dismissButton.disabled = false;
    }
  });
}

initSetupNotice();
initSettingsPanel();
