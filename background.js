// Background Service Worker — YouTube Playlist Focus Final (v2.2.0)
'use strict';

// Default initial state
const DEFAULT_SETTINGS = {
  theme: 'auto',
  autoPlay: true,
  loopPlaylist: false,
  viewMode: 'grid',
  sortBy: 'default',
  sortOrder: 'asc',
  compactMode: false,
  filters: {
    unwatchedOnly: false,
    maxDuration: null,
    channelFilter: ''
  },
  collapsedPlaylists: [],
  blockedChannels: [],
  defaultSpeed: 1.0
};

// Default playlists (Pre-seeds Watch Later)
const DEFAULT_PLAYLISTS = [
  {
    id: 'WL',
    name: 'Watch Later',
    enabled: true,
    type: 'permanent',
    isSystem: true
  }
];

// Helper: Clear temporary playlists
function clearTemporaryPlaylists() {
  chrome.storage.sync.get(['playlists'], (data) => {
    if (chrome.runtime.lastError) return;
    if (data.playlists && Array.isArray(data.playlists)) {
      const permanentPlaylists = data.playlists.filter(p => p.type !== 'temporary');
      chrome.storage.sync.set({ playlists: permanentPlaylists });
    }
  });
}

// Validation Helpers
function validatePlaylistId(id) {
  if (!id || typeof id !== 'string') return false;
  const clean = id.trim();
  if (clean.toUpperCase() === 'WL') return true;
  if (clean === 'LL' || clean === 'VLLL') return false;
  if (/^[A-Za-z0-9_-]{11}$/.test(clean)) return false;
  if (clean.length < 12) return false;
  if (clean.startsWith('UC')) return false;
  return /^(?:PL|FL|OLAK|RD|UU|TL|CL|EL)[A-Za-z0-9_-]{10,}$/i.test(clean) ||
         (/^[A-Za-z0-9_-]{13,64}$/.test(clean) && !clean.startsWith('UC'));
}

function validateVideoId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id.trim());
}

// On install / update
chrome.runtime.onInstalled.addListener((details) => {
  chrome.storage.sync.get(['enabled', 'playlists', 'settings'], (data) => {
    if (chrome.runtime.lastError) return;

    const updates = {};
    if (data.enabled === undefined) {
      updates.enabled = true;
    }
    if (!data.playlists || data.playlists.length === 0) {
      updates.playlists = DEFAULT_PLAYLISTS;
    } else if (Array.isArray(data.playlists)) {
      const sanitized = data.playlists.filter(p => p && validatePlaylistId(p.id));
      if (sanitized.length !== data.playlists.length) {
        updates.playlists = sanitized.length > 0 ? sanitized : DEFAULT_PLAYLISTS;
      }
    }
    if (!data.settings) {
      updates.settings = DEFAULT_SETTINGS;
    } else {
      updates.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.sync.set(updates);
    }

    clearTemporaryPlaylists();
  });
});

// On browser startup
chrome.runtime.onStartup.addListener(() => {
  clearTemporaryPlaylists();
});

// Listen for keyboard command shortcuts
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError || !tabs || tabs.length === 0) return;
    const activeTab = tabs[0];
    if (activeTab.url && activeTab.url.includes('youtube.com')) {
      chrome.tabs.sendMessage(activeTab.id, { action: 'command', command: command }, () => {
        void chrome.runtime.lastError;
      });
    }
  });
});

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || typeof request !== 'object' || !request.action) return false;

  // Get current state
  if (request.action === 'getState') {
    chrome.storage.sync.get(['enabled', 'playlists', 'settings'], (data) => {
      sendResponse({
        enabled: data.enabled !== false,
        playlists: (data.playlists || DEFAULT_PLAYLISTS).filter(p => p && validatePlaylistId(p.id)),
        settings: data.settings || DEFAULT_SETTINGS
      });
    });
    return true; // Async response
  }

  // Save settings
  if (request.action === 'saveSettings') {
    if (request.settings && typeof request.settings === 'object') {
      chrome.storage.sync.set({ settings: request.settings }, () => {
        sendResponse({ success: !chrome.runtime.lastError });
      });
    } else {
      sendResponse({ success: false, error: 'Invalid settings payload' });
    }
    return true;
  }

  // Save playlists
  if (request.action === 'savePlaylists') {
    if (Array.isArray(request.playlists)) {
      const sanitized = request.playlists.filter(p => p && validatePlaylistId(p.id));
      chrome.storage.sync.set({ playlists: sanitized }, () => {
        sendResponse({ success: !chrome.runtime.lastError });
      });
    } else {
      sendResponse({ success: false, error: 'Invalid playlists payload' });
    }
    return true;
  }

  // Reload/Notify all YouTube tabs without tearing down media playback
  if (request.action === 'reloadYoutubeTabs') {
    chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
      if (!chrome.runtime.lastError && tabs) {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, { action: 'settingsUpdated' }, () => {
            void chrome.runtime.lastError;
          });
        });
      }
      sendResponse({ success: true, count: tabs ? tabs.length : 0 });
    });
    return true;
  }

  // Open playlist URL
  if (request.action === 'openPlaylist') {
    const rawId = String(request.playlistId || 'WL').trim();
    if (!validatePlaylistId(rawId)) {
      sendResponse({ success: false, error: 'Invalid playlist ID' });
      return true;
    }
    const url = rawId === 'WL'
      ? 'https://www.youtube.com/playlist?list=WL'
      : `https://www.youtube.com/playlist?list=${encodeURIComponent(rawId)}`;

    chrome.tabs.create({ url });
    sendResponse({ success: true });
    return true;
  }

  // Open video URL
  if (request.action === 'openVideo') {
    const rawVideoId = String(request.videoId || '').trim();
    if (!validateVideoId(rawVideoId)) {
      sendResponse({ success: false, error: 'Invalid video ID' });
      return true;
    }
    const rawPlaylistId = request.playlistId && validatePlaylistId(request.playlistId)
      ? `&list=${encodeURIComponent(request.playlistId.trim())}`
      : '';
    chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${encodeURIComponent(rawVideoId)}${rawPlaylistId}` });
    sendResponse({ success: true });
    return true;
  }

  // Trigger account playlist sync
  if (request.action === 'syncAccountPlaylists') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0];
      if (activeTab && activeTab.url && activeTab.url.includes('youtube.com')) {
        chrome.tabs.sendMessage(activeTab.id, { action: 'triggerAccountSync' }, (response) => {
          if (chrome.runtime.lastError || !response) {
            sendResponse({ success: false });
          } else {
            sendResponse({ success: true, count: response.count, playlists: response.playlists });
          }
        });
      } else {
        chrome.tabs.query({ url: '*://*.youtube.com/*' }, (ytTabs) => {
          if (ytTabs && ytTabs.length > 0) {
            chrome.tabs.sendMessage(ytTabs[0].id, { action: 'triggerAccountSync' }, (response) => {
              sendResponse({ success: true, count: response ? response.count : 0 });
            });
          } else {
            sendResponse({ success: false, error: 'No active YouTube tab found' });
          }
        });
      }
    });
    return true;
  }

  return false;
});
