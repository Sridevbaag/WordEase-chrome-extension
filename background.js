// WordEase Background Service Worker v2.0
'use strict';

console.log('🧠 WordEase v2.0 Service Worker loaded');

// ── Install / Update ──────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await chrome.storage.local.set({
      stats: {
        totalTranslations: 0,
        languages: {},
        installDate: new Date().toISOString(),
      },
    });
    createContextMenu();
    console.log('✅ WordEase installed');
  } else if (reason === 'update') {
    createContextMenu(); // Recreate on update
    console.log('🔄 WordEase updated to v2.0.0');
  }
  ensureAlarm();
});

// ── Context Menu ──────────────────────────────────────────────────────────────
function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'wordease-translate',
      title: 'Translate "%s" with WordEase',
      contexts: ['selection'],
    });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'wordease-translate' && info.selectionText && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'translateContextMenu',
      text: info.selectionText,
    }).catch(() => {}); // Ignore if content script not ready
  }
});

// ── Keyboard Commands ─────────────────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'translate-selection') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'translateSelection' }).catch(() => {});
    }
  }
});

// ── Message Handling ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translationMade') {
    trackTranslation(request.language, request.textLength);
  }
  sendResponse({ success: true });
  return true;
});

// ── Stats Tracking ────────────────────────────────────────────────────────────
async function trackTranslation(language, textLength) {
  try {
    const { stats = {} } = await chrome.storage.local.get('stats');
    const updated = {
      ...stats,
      totalTranslations: (stats.totalTranslations || 0) + 1,
      languages: {
        ...stats.languages,
        [language]: ((stats.languages || {})[language] || 0) + 1,
      },
      lastTranslation: new Date().toISOString(),
    };
    await chrome.storage.local.set({ stats: updated });

    // Milestone notification every 50
    if (updated.totalTranslations % 50 === 0) {
      showNotification(`🎉 ${updated.totalTranslations} translations! You're on fire!`);
    }
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// ── Notifications ─────────────────────────────────────────────────────────────
function showNotification(message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png', // ✅ Fixed path
    title: 'WordEase',
    message,
    priority: 1,
  });
}

// ── History Cleanup Alarm ─────────────────────────────────────────────────────
chrome.runtime.onStartup.addListener(ensureAlarm);

function ensureAlarm() {
  chrome.alarms.get('cleanupHistory', (a) => {
    if (!a) chrome.alarms.create('cleanupHistory', { periodInMinutes: 1440 });
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanupHistory') cleanupHistory();
});

async function cleanupHistory() {
  try {
    const { history = [] } = await chrome.storage.sync.get('history');
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const fresh = history.filter((h) => {
      try { return new Date(h.time).getTime() > cutoff; } catch { return true; }
    });
    if (fresh.length < history.length) {
      await chrome.storage.sync.set({ history: fresh });
      console.log(`🧹 Removed ${history.length - fresh.length} old history items`);
    }
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}