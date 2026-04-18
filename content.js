// WordEase Content Script v2.0
'use strict';

// ── Translation Cache (session, LRU) ──────────────────────────────────────────
const cache = new Map();
const CACHE_LIMIT = 100;

function getCached(text, lang) {
  return cache.get(`${lang}:${text}`) ?? null;
}

function setCache(text, lang, value) {
  if (cache.size >= CACHE_LIMIT) {
    cache.delete(cache.keys().next().value); // Evict oldest
  }
  cache.set(`${lang}:${text}`, value);
}

// ── Language metadata ─────────────────────────────────────────────────────────
const LANG_META = {
  en: { name: 'English',    bcp: 'en-US' },
  hi: { name: 'Hindi',      bcp: 'hi-IN' },
  bn: { name: 'Bengali',    bcp: 'bn-BD' },
  ta: { name: 'Tamil',      bcp: 'ta-IN' },
  te: { name: 'Telugu',     bcp: 'te-IN' },
  ml: { name: 'Malayalam',  bcp: 'ml-IN' },
  mr: { name: 'Marathi',    bcp: 'mr-IN' },
  gu: { name: 'Gujarati',   bcp: 'gu-IN' },
  kn: { name: 'Kannada',    bcp: 'kn-IN' },
  fr: { name: 'French',     bcp: 'fr-FR' },
  es: { name: 'Spanish',    bcp: 'es-ES' },
  de: { name: 'German',     bcp: 'de-DE' },
  it: { name: 'Italian',    bcp: 'it-IT' },
  pt: { name: 'Portuguese', bcp: 'pt-PT' },
  ru: { name: 'Russian',    bcp: 'ru-RU' },
  nl: { name: 'Dutch',      bcp: 'nl-NL' },
  ja: { name: 'Japanese',   bcp: 'ja-JP' },
  zh: { name: 'Chinese',    bcp: 'zh-CN' },
  ko: { name: 'Korean',     bcp: 'ko-KR' },
  ar: { name: 'Arabic',     bcp: 'ar-SA' },
};

// ── Settings (live-synced) ────────────────────────────────────────────────────
let currentLang = 'bn';
let settings    = { displayDuration: 5000, showTTS: true };

async function loadSettings() {
  const data = await chrome.storage.sync.get(['targetLanguage', 'displayDuration', 'showTTS']);
  currentLang = data.targetLanguage  || 'bn';
  settings    = {
    displayDuration: data.displayDuration ?? 5000,
    showTTS:         data.showTTS         ?? true,
  };
}
loadSettings();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.targetLanguage)  currentLang              = changes.targetLanguage.newValue;
  if (changes.displayDuration) settings.displayDuration = changes.displayDuration.newValue;
  if (changes.showTTS)         settings.showTTS         = changes.showTTS.newValue;
});

// ── Message listener (keyboard shortcut + context menu) ───────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'translateSelection' || msg.action === 'translateContextMenu') {
    const text = (msg.text || window.getSelection().toString()).trim();
    if (text) triggerTranslation(text);
  }
});

// ── Mouse-up trigger ──────────────────────────────────────────────────────────
let debounceTimer = null;

document.addEventListener('mouseup', (e) => {
  if (e.target.closest('#wordease-popup')) return; // Ignore clicks inside popup
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const text = window.getSelection().toString().trim();
    if (!text || text.length > 500) return;
    await triggerTranslation(text);
  }, 150);
});

// ── Core translation flow ─────────────────────────────────────────────────────
async function triggerTranslation(text) {
  removePopup();
  const rect = getSelectionRect();
  if (!rect) return;

  createLoadingPopup(rect);

  // Serve from cache if available
  const cached = getCached(text, currentLang);
  if (cached) {
    updatePopup(cached, text);
    saveHistory(text, cached);
    return;
  }

  const result = await fetchTranslation(text, currentLang);
  if (!result) {
    updatePopup('⚠️ Translation unavailable', text, true);
    return;
  }

  setCache(text, currentLang, result);
  updatePopup(result, text);
  saveHistory(text, result);

  chrome.runtime.sendMessage({
    action: 'translationMade',
    language: currentLang,
    textLength: text.length,
  });
}

// ── Translation API (primary + fallback) ──────────────────────────────────────
async function fetchTranslation(text, lang) {
  const encoded = encodeURIComponent(text);

  let sourceLang = 'en';
  if (lang === 'en') {
    sourceLang = detectPageLanguage();
  }

  const langPair = `${sourceLang}|${lang}`;

  // Primary: MyMemory
  if (sourceLang !== lang) {
    try {
      const res  = await fetch(
        `https://api.mymemory.translated.net/get?q=${encoded}&langpair=${langPair}`,
        { signal: AbortSignal.timeout(6000) }
      );
      const data = await res.json();
      const tr   = data.responseData?.translatedText;
      const isError = tr && tr.toUpperCase().includes('INVALID SOURCE LANGUAGE');
      if (tr && tr.toLowerCase() !== text.toLowerCase()) return tr;
    } catch { /* fallthrough */ }
  }

  // Fallback: Lingva Translate
  try {
    const sourceLang = lang === 'en' ? 'auto' : 'en';
    const res  = await fetch(
      `https://lingva.ml/api/v1/${sourceLang}/${lang}/${encoded}`,
      { signal: AbortSignal.timeout(6000) }
    );
    const data = await res.json();
    if (data.translation) return data.translation;
  } catch { /* both failed */ }

  return null;
}

function detectPageLanguage() {
  // 1. Check <html lang="fr"> — most reliable
  const htmlLang = document.documentElement.lang;
  if (htmlLang) {
    const code = htmlLang.split('-')[0].toLowerCase(); // "zh-CN" → "zh"
    if (code.length === 2 && code !== 'en') return code;
  }

  const metaLang = document.querySelector('meta[http-equiv="content-language"]');
  if (metaLang) {
    const code = metaLang.getAttribute('content')?.split('-')[0].toLowerCase();
    if (code && code.length === 2 && code !== 'en') return code;
  }

  return 'en';
}

// ── Popup: create loading state ───────────────────────────────────────────────
function createLoadingPopup(rect) {
  const popup = document.createElement('div');
  popup.id = 'wordease-popup';

  const langMeta = LANG_META[currentLang] || { name: currentLang };
  popup.innerHTML = `
    <div class="wz-header">
      <span class="wz-badge">🌐 ${langMeta.name}</span>
      <button class="wz-btn wz-close" title="Close">✕</button>
    </div>
    <div class="wz-body">
      <div class="wz-loader"><span></span><span></span><span></span></div>
      <span class="wz-loading-text">Translating…</span>
    </div>
  `;

  positionPopup(popup, rect);
  document.body.appendChild(popup);

  popup.querySelector('.wz-close').addEventListener('click', removePopup);
  attachHoverPause(popup);
  attachOutsideClose();

  requestAnimationFrame(() => requestAnimationFrame(() => popup.classList.add('wz-show')));
}

// ── Popup: fill with translation ──────────────────────────────────────────────
function updatePopup(translatedText, originalText, isError = false) {
  const popup = document.getElementById('wordease-popup');
  if (!popup) return;

  const langMeta   = LANG_META[currentLang] || { name: currentLang };
  const shortOrig  = originalText.length > 42 ? originalText.slice(0, 40) + '…' : originalText;
  const ttsButton  = settings.showTTS && !isError
    ? `<button class="wz-btn wz-tts" title="Listen to translation">🔊</button>`
    : '';

  popup.innerHTML = `
    <div class="wz-header">
      <span class="wz-badge">🌐 ${langMeta.name}</span>
      <div class="wz-actions">
        ${ttsButton}
        <button class="wz-btn wz-copy" title="Copy translation">📋</button>
        <button class="wz-btn wz-close" title="Close">✕</button>
      </div>
    </div>
    <div class="wz-translation${isError ? ' wz-error' : ''}">${escapeHtml(translatedText)}</div>
    <div class="wz-original">"${escapeHtml(shortOrig)}"</div>
    <div class="wz-progress"><div class="wz-bar"></div></div>
  `;

  popup.querySelector('.wz-close').addEventListener('click', removePopup);
  popup.querySelector('.wz-tts')?.addEventListener('click', (e) => {
    e.stopPropagation();
    speakText(translatedText, currentLang);
  });
  popup.querySelector('.wz-copy')?.addEventListener('click', (e) => {
    e.stopPropagation();
    copyToClipboard(translatedText, popup.querySelector('.wz-copy'));
  });

  attachHoverPause(popup);

  if (!isError) {
    scheduleClose();
    // Animate progress bar shrinking
    requestAnimationFrame(() => {
      const bar = popup.querySelector('.wz-bar');
      if (bar) {
        bar.style.transition = `width ${settings.displayDuration}ms linear`;
        bar.style.width = '0%';
      }
    });
  }
}

// ── Popup: positioning (smart, clamped) ───────────────────────────────────────
function positionPopup(popup, rect) {
  const margin  = 12;
  const popW    = 320;
  const popH    = 130;

  let left = rect.left;
  let top  = rect.bottom + 8;

  // ✅ Fixed: position:fixed doesn't need scroll offset added
  if (left + popW > window.innerWidth  - margin) left = window.innerWidth  - popW - margin;
  if (left < margin) left = margin;
  if (top  + popH > window.innerHeight - margin) top  = rect.top - popH - 8; // Flip above
  if (top  < margin) top  = margin;

  popup.style.cssText += `left:${left}px !important; top:${top}px !important;`;
}

// ── Popup: teardown ───────────────────────────────────────────────────────────
let autoCloseTimer = null;

function scheduleClose() {
  clearTimeout(autoCloseTimer);
  autoCloseTimer = setTimeout(removePopup, settings.displayDuration);
}

function attachHoverPause(popup) {
  popup.addEventListener('mouseenter', () => clearTimeout(autoCloseTimer));
  popup.addEventListener('mouseleave', scheduleClose);
}

function attachOutsideClose() {
  setTimeout(() => {
    document.addEventListener('mousedown', outsideHandler, { capture: true, once: true });
  }, 60);
}

function outsideHandler(e) {
  if (!e.target.closest('#wordease-popup')) removePopup();
}

function removePopup() {
  clearTimeout(autoCloseTimer);
  document.removeEventListener('mousedown', outsideHandler, { capture: true });
  const popup = document.getElementById('wordease-popup');
  if (!popup) return;
  popup.classList.remove('wz-show');
  setTimeout(() => popup.remove(), 280);
}

// ── TTS ───────────────────────────────────────────────────────────────────────
function speakText(text, lang) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utt  = new SpeechSynthesisUtterance(text);
  utt.lang   = LANG_META[lang]?.bcp || lang;
  utt.rate   = 0.9;
  speechSynthesis.speak(utt);
}

// ── Clipboard ─────────────────────────────────────────────────────────────────
function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (!btn) return;
    const prev = btn.textContent;
    btn.textContent = '✅';
    setTimeout(() => { btn.textContent = prev; }, 1500);
  }).catch(() => {
    // Fallback for restrictive pages
    const ta = Object.assign(document.createElement('textarea'), {
      value: text,
      style: 'position:fixed;opacity:0',
    });
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  });
}

// ── History ───────────────────────────────────────────────────────────────────
function saveHistory(original, translated) {
  chrome.storage.sync.get('history', ({ history = [] }) => {
    // Deduplicate: remove earlier entry for same original text
    const deduped = history.filter((h) => h.original !== original);
    deduped.unshift({
      original,
      translated,
      lang: currentLang,
      time: new Date().toISOString(), // ✅ ISO string (parseable)
    });
    chrome.storage.sync.set({ history: deduped.slice(0, 30) });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getSelectionRect() {
  const sel = window.getSelection();
  return sel?.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
