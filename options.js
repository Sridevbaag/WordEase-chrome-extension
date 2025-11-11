// Save selected language
document.getElementById("save").addEventListener("click", () => {
  const lang = document.getElementById("language").value;
  chrome.storage.sync.set({ targetLanguage: lang }, () => {
    const status = document.getElementById("status");
    status.textContent = "✅ Language saved!";
    setTimeout(() => (status.textContent = ""), 2000);
  });
});

// Restore saved language when opening the settings
chrome.storage.sync.get("targetLanguage", (data) => {
  if (data.targetLanguage) {
    document.getElementById("language").value = data.targetLanguage;
  }
});
