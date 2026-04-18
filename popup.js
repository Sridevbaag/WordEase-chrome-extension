'use strict';

let allHistory = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadHistory();
  document.getElementById('clear').addEventListener('click', clearHistory);
  document.getElementById('export').addEventListener('click', exportHistory);
  document.getElementById('search').addEventListener('input', filterHistory);
  document.getElementById('history').addEventListener('click', handleClick);
});

async function loadHistory() {
  try {
    const data = await chrome.storage.sync.get('history');
    allHistory  = data.history || [];
    renderHistory(allHistory);
    updateUI(allHistory.length);
  } catch (err) {
    console.error(err);
    document.getElementById('history').innerHTML =
      '<div class="history-empty">⚠️ Failed to load history</div>';
  }
}

function renderHistory(items) {
  const div = document.getElementById('history');

  if (!items.length) {
    div.innerHTML = '<div class="history-empty">No translations yet.<br>Select text on any page!</div>';
    return;
  }

  div.innerHTML = '';
  items.forEach((item) => {
    const el = document.createElement('div');
    el.className          = 'item';
    el.dataset.original   = item.original;
    el.dataset.translated = item.translated;

    el.innerHTML = `
      <div class="item-row">
        <div class="item-texts">
          <span class="original">${escapeHtml(truncate(item.original,  36))}</span>
          <span class="translated">${escapeHtml(truncate(item.translated, 36))}</span>
        </div>
        <div class="item-meta">
          <span class="lang-tag">${item.lang || '??'}</span>
          <span class="time">${formatTime(item.time)}</span>
        </div>
      </div>
      <div class="copy-hint">Click · copy original &nbsp;|&nbsp; Shift+click · copy translation</div>
    `;
    div.appendChild(el);
  });
}

function filterHistory() {
  const q = document.getElementById('search').value.trim().toLowerCase();
  if (!q) { renderHistory(allHistory); return; }

  const filtered = allHistory.filter((h) =>
    h.original.toLowerCase().includes(q) ||
    h.translated.toLowerCase().includes(q)
  );

  if (!filtered.length) {
    document.getElementById('history').innerHTML =
      '<div class="no-match">No matches found</div>';
  } else {
    renderHistory(filtered);
  }
}

function handleClick(e) {
  const item = e.target.closest('.item');
  if (!item) return;

  const text  = e.shiftKey ? item.dataset.translated : item.dataset.original;
  const label = e.shiftKey ? 'Translation' : 'Original';

  navigator.clipboard.writeText(text).then(() => {
    const span = item.querySelector('.original');
    const prev = span.textContent;
    span.textContent  = `📋 ${label} copied!`;
    span.style.color  = '#86efac';
    setTimeout(() => { span.textContent = prev; span.style.color = ''; }, 1600);
  }).catch(console.error);
}

async function clearHistory() {
  if (!confirm('Clear all translation history?')) return;
  await chrome.storage.sync.remove('history');
  allHistory = [];
  renderHistory([]);
  updateUI(0);
}

function exportHistory() {
  if (!allHistory.length) return;
  const blob = new Blob([JSON.stringify(allHistory, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: `wordease-${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

function updateUI(count) {
  document.getElementById('count-pill').textContent  = `${count} saved`;
  const has = count > 0;
  document.getElementById('clear').disabled  = !has;
  document.getElementById('export').disabled = !has;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return iso || ''; }
}
