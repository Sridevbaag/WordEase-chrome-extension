document.addEventListener("mouseup", async () => {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  if (selectedText.length === 0) return;

  // Remove old popup if any
  const existingPopup = document.getElementById("wordease-popup");
  if (existingPopup) existingPopup.remove();

  // Get user-selected language (default = Bengali)
  chrome.storage.sync.get("targetLanguage", async (data) => {
    const targetLang = data.targetLanguage || "bn";

    // Call API
    const translation = await translateText(selectedText, targetLang);

    // Create popup
    const popup = document.createElement("div");
    popup.id = "wordease-popup";
    popup.innerText = `🔤 ${translation}`;
    document.body.appendChild(popup);

    // Position popup safely
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      popup.style.top = `${window.scrollY + rect.bottom + 5}px`;
      popup.style.left = `${window.scrollX + rect.left}px`;
    } else {
      popup.style.top = `${window.scrollY + 100}px`;
      popup.style.left = `${window.scrollX + 100}px`;
    }
  });
});

// General translation function
async function translateText(text, targetLang) {
  try {
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`
    );
    const data = await response.json();
    return data.responseData.translatedText;
  } catch (error) {
    console.error("Translation error:", error);
    return "Translation not available";
  }
}
