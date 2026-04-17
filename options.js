// WordEase Options v2.0
'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();

  const slider = document.getElementById('duration');
  slider.addEventListener('input', () => {
    document.getElementById('dur-val').textContent = `${slider.value}s`;
  });

  document.getElementById('save').addEventListener('click', saveSettings);
  document.getElementById('clear').addEventListener('click', clearHistory);
});

async function loadAll() {
  try {
    const sync = await chrome.storage.sync.get([
      'targetLanguage', 'displayDuration', 'showTTS', 'history',
    ]);

    // Language
    if (sync.targetLanguage) {
      document.getElementById('language').value = sync.targetLanguage;
    }

    // Duration
    const durSec = Math.round((sync.displayDuration || 5000) / 1000);
    document.getElementById('duration').value    = durSec;
    document.getElementById('dur-val').textContent = `${durSec}s`;

    // Toggles
    document.getElementById('show-tts').checked = sync.showTTS !== false;

    // History count
    const count = sync.history?.length || 0;
    document.getElementById('history-meta').textContent =
      `📜 ${count} translation${count !== 1 ? 's' : ''} saved in history`;

    // Stats
    const { stats } = await chrome.storage.local.get('stats');
    renderStats(stats);

  } catch (err) {
    console.error('Load error:', err);
    showStatus('⚠️ Failed to load settings', 'error');
  }
}

function renderStats(stats) {
  if (!stats) return;

  document.getElementById('stat-total').textContent = stats.totalTranslations || 0;

  // Top language by count
  const langs   = stats.languages || {};
  const topLang = Object.entries(langs).sort((a, b) => b[1] - a[1])[0];
  document.getElementById('stat-lang').textContent =
    topLang ? topLang[0].toUpperCase() : '—';

  // Days since install
  if (stats.installDate) {
    const days = Math.floor((Date.now() - new Date(stats.installDate)) / 86_400_000);
    document.getElementById('stat-days').textContent = days || '<1';
  }
}

async function saveSettings() {
  try {
    const lang = document.getElementById('language').value;
    const dur  = parseInt(document.getElementById('duration').value, 10) * 1000;
    const tts  = document.getElementById('show-tts').checked;

    await chrome.storage.sync.set({
      targetLanguage:  lang,
      displayDuration: dur,
      showTTS:         tts,
    });

    showStatus('✅ Settings saved!', 'success');
  } catch (err) {
    showStatus('❌ Failed to save', 'error');
    console.error(err);
  }
}

async function clearHistory() {
  if (!confirm('Clear all translation history?\nThis cannot be undone.')) return;
  try {
    await chrome.storage.sync.remove('history');
    document.getElementById('history-meta').textContent = '📜 0 translations saved in history';
    showStatus('✅ History cleared!', 'success');
  } catch (err) {
    showStatus('❌ Failed to clear', 'error');
    console.error(err);
  }
}

function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className   = type;
  setTimeout(() => { el.textContent = ''; el.className = ''; }, 3000);
}