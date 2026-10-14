// popup.js — YouTube Playlist Focus Final (v2.2.0)
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  // State
  let isEnabled = true;
  let currentPlaylists = [];
  let currentSettings = {
    theme: 'auto',
    autoPlay: true,
    loopPlaylist: false,
    viewMode: 'grid',
    defaultSpeed: 1.0
  };

  // DOM Elements
  const extensionToggle = document.getElementById('extensionToggle');
  const statusBanner = document.getElementById('statusBanner');
  const statusIcon = document.getElementById('statusIcon');
  const statusText = document.getElementById('statusText');
  const playlistCountBadge = document.getElementById('playlistCountBadge');
  const playlistsContainer = document.getElementById('playlistsContainer');

  const syncAccountBtn = document.getElementById('syncAccountBtn');
  const addWatchLaterBtn = document.getElementById('addWatchLaterBtn');
  const showAddFormBtn = document.getElementById('showAddFormBtn');

  const addForm = document.getElementById('addForm');
  const playlistUrlInput = document.getElementById('playlistUrl');
  const playlistCustomNameInput = document.getElementById('playlistCustomName');
  const playlistTypeSelect = document.getElementById('playlistType');
  const savePlaylistBtn = document.getElementById('savePlaylistBtn');
  const cancelPlaylistBtn = document.getElementById('cancelPlaylistBtn');

  const playlistsToggleHeader = document.getElementById('playlistsToggleHeader');
  const playlistsToggleBtn = document.getElementById('playlistsToggleBtn');
  const playlistsBody = document.getElementById('playlistsBody');

  const settingsToggleHeader = document.getElementById('settingsToggleHeader');
  const settingsToggleBtn = document.getElementById('settingsToggleBtn');
  const settingsBody = document.getElementById('settingsBody');

  const themeSelect = document.getElementById('themeSelect');
  const autoplayToggle = document.getElementById('autoplayToggle');
  const loopToggle = document.getElementById('loopToggle');
  const viewSelect = document.getElementById('viewSelect');
  const speedSelect = document.getElementById('speedSelect');

  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');

  // Utility: Notify YouTube tabs
  function notifyTabs() {
    chrome.runtime.sendMessage({ action: 'reloadYoutubeTabs' }, () => {
      void chrome.runtime.lastError;
    });
  }

  // Utility: Validate Real YouTube Playlist ID (Never individual video IDs)
  function validatePlaylistId(id) {
    if (!id || typeof id !== 'string') return false;
    const clean = id.trim();
    if (clean.toUpperCase() === 'WL') return true;
    if (clean === 'LL' || clean === 'VLLL') return false;
    // Exactly 11 characters is ALWAYS an individual YouTube video ID, not a playlist
    if (/^[A-Za-z0-9_-]{11}$/.test(clean)) return false;
    if (clean.length < 12) return false;
    if (clean.startsWith('UC')) return false; // Channel ID
    return /^(?:PL|FL|OLAK|RD|UU|TL|CL|EL)[A-Za-z0-9_-]{10,}$/i.test(clean) ||
           (/^[A-Za-z0-9_-]{13,64}$/.test(clean) && !clean.startsWith('UC'));
  }

  // Utility: Extract Playlist ID from URL or Raw String
  function extractPlaylistId(input) {
    if (!input) return null;
    const trimmed = input.trim();
    if (trimmed.toUpperCase() === 'WL') return 'WL';

    // Check query param list=...
    const urlMatch = trimmed.match(/[?&]list=([^&#]+)/i);
    if (urlMatch) {
      const pId = decodeURIComponent(urlMatch[1]);
      if (validatePlaylistId(pId)) return pId;
    }

    // Direct ID check
    if (validatePlaylistId(trimmed)) {
      return trimmed;
    }

    return null;
  }

  // Update Status Banner UI
  function updateStatus(enabled) {
    isEnabled = enabled;
    if (extensionToggle) extensionToggle.checked = enabled;

    if (enabled) {
      statusBanner.className = 'status-banner';
      statusIcon.textContent = '🟢';
      statusText.textContent = `Active • ${currentPlaylists.length} Playlists Loaded`;
    } else {
      statusBanner.className = 'status-banner disabled';
      statusIcon.textContent = '⚪';
      statusText.textContent = 'Inactive • Normal YouTube Behavior';
    }
  }

  // Render Playlists List
  function renderPlaylists(playlists) {
    // Strictly filter out Liked Videos and individual video IDs
    currentPlaylists = (playlists || []).filter(p => p && validatePlaylistId(p.id));

    if (playlistCountBadge) {
      playlistCountBadge.textContent = `(${currentPlaylists.length})`;
    }

    if (!playlistsContainer) return;
    playlistsContainer.innerHTML = '';

    if (currentPlaylists.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = 'color:var(--yt-text-secondary);font-size:12px;padding:12px;text-align:center;';
      emptyMsg.textContent = 'No playlists added yet. Click "🔄 Auto-Sync All Account Playlists" above!';
      playlistsContainer.appendChild(emptyMsg);
      return;
    }

    currentPlaylists.forEach((playlist, index) => {
      const item = document.createElement('div');
      item.className = 'playlist-item';

      // Checkbox
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'playlist-checkbox';
      checkbox.checked = playlist.enabled !== false;
      checkbox.title = playlist.enabled ? 'Disable Playlist' : 'Enable Playlist';
      checkbox.addEventListener('change', () => {
        currentPlaylists[index].enabled = checkbox.checked;
        savePlaylists();
      });

      // Info
      const info = document.createElement('div');
      info.className = 'playlist-info';

      const title = document.createElement('p');
      title.className = 'playlist-title';
      title.textContent = playlist.name || (playlist.id === 'WL' ? 'Watch Later' : playlist.id);
      title.title = `ID: ${playlist.id}`;

      const tag = document.createElement('span');
      tag.className = 'playlist-tag';
      tag.textContent = playlist.id === 'WL'
        ? '🕒 Watch Later'
        : playlist.type === 'temporary'
          ? '⏳ Temporary'
          : '💾 Custom';

      info.appendChild(title);
      info.appendChild(tag);

      // Actions
      const actions = document.createElement('div');
      actions.className = 'playlist-actions';

      // Open button
      const openBtn = document.createElement('button');
      openBtn.className = 'action-icon-btn open';
      openBtn.title = 'Open playlist on YouTube';
      openBtn.textContent = '▶';
      openBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({ action: 'openPlaylist', playlistId: playlist.id });
      });

      // Edit name button
      const editBtn = document.createElement('button');
      editBtn.className = 'action-icon-btn';
      editBtn.title = 'Edit playlist display name';
      editBtn.textContent = '✏️';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newName = prompt('Enter new display name for this playlist:', playlist.name || playlist.id);
        if (newName && newName.trim()) {
          currentPlaylists[index].name = newName.trim();
          savePlaylists();
          renderPlaylists(currentPlaylists);
        }
      });

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'action-icon-btn delete';
      deleteBtn.title = 'Remove playlist';
      deleteBtn.textContent = '✕';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = playlist.name || playlist.id;
        if (confirm(`Are you sure you want to remove "${name}" from Playlist Focus?`)) {
          currentPlaylists.splice(index, 1);
          savePlaylists();
          renderPlaylists(currentPlaylists);
        }
      });

      actions.appendChild(openBtn);
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      item.appendChild(checkbox);
      item.appendChild(info);
      item.appendChild(actions);

      playlistsContainer.appendChild(item);
    });
  }

  // Save Playlists to Storage
  function savePlaylists() {
    chrome.storage.sync.set({ playlists: currentPlaylists }, () => {
      notifyTabs();
    });
  }

  // Save Settings to Storage
  function saveSettings() {
    chrome.storage.sync.set({ settings: currentSettings }, () => {
      notifyTabs();
    });
  }

  // Load Settings into UI
  function loadSettingsIntoUI(settings) {
    currentSettings = { ...currentSettings, ...settings };
    if (themeSelect) themeSelect.value = currentSettings.theme || 'auto';
    if (autoplayToggle) autoplayToggle.checked = currentSettings.autoPlay !== false;
    if (loopToggle) loopToggle.checked = currentSettings.loopPlaylist || false;
    if (viewSelect) viewSelect.value = currentSettings.viewMode || 'grid';
    if (speedSelect) speedSelect.value = String(currentSettings.defaultSpeed || 1);
  }

  // Toggle Section Collapse
  function setupCollapsibleSections() {
    if (playlistsToggleHeader && playlistsBody && playlistsToggleBtn) {
      playlistsToggleHeader.addEventListener('click', () => {
        const isActive = playlistsBody.classList.toggle('active');
        playlistsToggleBtn.textContent = isActive ? 'Hide' : 'Show';
      });
    }

    if (settingsToggleHeader && settingsBody && settingsToggleBtn) {
      settingsToggleHeader.addEventListener('click', () => {
        const isActive = settingsBody.classList.toggle('active');
        settingsToggleBtn.textContent = isActive ? 'Hide' : 'Show';
      });
    }
  }

  // Master Extension Toggle
  if (extensionToggle) {
    extensionToggle.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      chrome.storage.sync.set({ enabled }, () => {
        updateStatus(enabled);
        notifyTabs();
      });
    });
  }

  // Auto-Sync All Account Playlists Button
  if (syncAccountBtn) {
    syncAccountBtn.addEventListener('click', () => {
      syncAccountBtn.classList.add('syncing');
      syncAccountBtn.textContent = '⏳ Scanning & Syncing Playlists...';

      chrome.runtime.sendMessage({ action: 'syncAccountPlaylists' }, (response) => {
        setTimeout(() => {
          syncAccountBtn.classList.remove('syncing');
          syncAccountBtn.textContent = '🔄 Auto-Sync All Account Playlists';

          chrome.storage.sync.get(['playlists'], (data) => {
            const raw = data.playlists || [];
            currentPlaylists = raw.filter(p => p && validatePlaylistId(p.id));
            if (currentPlaylists.length !== raw.length) {
              chrome.storage.sync.set({ playlists: currentPlaylists });
            }
            renderPlaylists(currentPlaylists);
            updateStatus(isEnabled);
            notifyTabs();
          });
        }, 800);
      });
    });
  }

  // Add Preset: Watch Later
  if (addWatchLaterBtn) {
    addWatchLaterBtn.addEventListener('click', () => {
      if (currentPlaylists.some(p => p.id === 'WL')) {
        alert('Watch Later playlist is already in your list!');
        return;
      }
      currentPlaylists.unshift({
        id: 'WL',
        name: 'Watch Later',
        enabled: true,
        type: 'permanent',
        isSystem: true
      });
      savePlaylists();
      renderPlaylists(currentPlaylists);
    });
  }

  // Show Add Custom Form
  if (showAddFormBtn && addForm) {
    showAddFormBtn.addEventListener('click', () => {
      addForm.classList.add('active');
      if (playlistUrlInput) playlistUrlInput.focus();
    });
  }

  // Cancel Add Form
  if (cancelPlaylistBtn && addForm) {
    cancelPlaylistBtn.addEventListener('click', () => {
      addForm.classList.remove('active');
      if (playlistUrlInput) playlistUrlInput.value = '';
      if (playlistCustomNameInput) playlistCustomNameInput.value = '';
    });
  }

  // Save Custom Playlist
  if (savePlaylistBtn) {
    savePlaylistBtn.addEventListener('click', () => {
      if (!playlistUrlInput) return;
      const rawInput = playlistUrlInput.value.trim();
      const customName = playlistCustomNameInput ? playlistCustomNameInput.value.trim() : '';
      const persistence = playlistTypeSelect ? playlistTypeSelect.value : 'permanent';

      const playlistId = extractPlaylistId(rawInput);

      if (!playlistId) {
        alert('Please enter a valid YouTube playlist URL or Playlist ID (e.g. PL... or WL).');
        playlistUrlInput.focus();
        return;
      }

      if (currentPlaylists.some(p => p.id === playlistId)) {
        alert('This playlist is already in your list!');
        return;
      }

      const newPlaylist = {
        id: playlistId,
        name: customName || (playlistId === 'WL' ? 'Watch Later' : playlistId),
        enabled: true,
        type: persistence
      };

      currentPlaylists.push(newPlaylist);
      savePlaylists();
      renderPlaylists(currentPlaylists);

      addForm.classList.remove('active');
      playlistUrlInput.value = '';
      if (playlistCustomNameInput) playlistCustomNameInput.value = '';
    });
  }

  // Settings Event Listeners
  if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
      currentSettings.theme = e.target.value;
      saveSettings();
    });
  }

  if (autoplayToggle) {
    autoplayToggle.addEventListener('change', (e) => {
      currentSettings.autoPlay = e.target.checked;
      saveSettings();
    });
  }

  if (loopToggle) {
    loopToggle.addEventListener('change', (e) => {
      currentSettings.loopPlaylist = e.target.checked;
      saveSettings();
    });
  }

  if (viewSelect) {
    viewSelect.addEventListener('change', (e) => {
      currentSettings.viewMode = e.target.value;
      saveSettings();
    });
  }

  if (speedSelect) {
    speedSelect.addEventListener('change', (e) => {
      currentSettings.defaultSpeed = parseFloat(e.target.value) || 1.0;
      saveSettings();
    });
  }

  // Export Configuration
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      chrome.storage.sync.get(['enabled', 'playlists', 'settings', 'watchHistory', 'videoProgress'], (data) => {
        const exportData = {
          app: 'YouTube Playlist Focus',
          version: '2.2.0',
          exportedAt: new Date().toISOString(),
          enabled: data.enabled !== false,
          playlists: (data.playlists || []).filter(p => p.id !== 'LL' && p.id !== 'VLLL'),
          settings: data.settings || {},
          watchHistory: data.watchHistory || [],
          videoProgress: data.videoProgress || {}
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `youtube-playlist-focus-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    });
  }

  // Import Configuration
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);
            if (!Array.isArray(data.playlists)) {
              throw new Error('Invalid backup file: "playlists" list missing.');
            }

            if (confirm('Importing will replace your current playlists and settings. Do you wish to continue?')) {
              const sanitizedPlaylists = data.playlists
                .filter(p => p && validatePlaylistId(p.id))
                .map(p => ({
                  id: String(p.id).trim(),
                  name: String(p.name || p.id).slice(0, 100),
                  enabled: p.enabled !== false,
                  type: p.type === 'temporary' ? 'temporary' : 'permanent',
                  isSystem: p.id === 'WL'
                }));

              const finalPlaylists = sanitizedPlaylists.length > 0
                ? sanitizedPlaylists
                : [{ id: 'WL', name: 'Watch Later', enabled: true, type: 'permanent', isSystem: true }];

              const sanitizedSettings = {
                ...currentSettings,
                ...(typeof data.settings === 'object' && data.settings ? data.settings : {})
              };

              chrome.storage.sync.set({
                enabled: data.enabled !== false,
                playlists: finalPlaylists,
                settings: sanitizedSettings,
                videoProgress: (typeof data.videoProgress === 'object' && data.videoProgress) ? data.videoProgress : {}
              }, () => {
                alert('Configuration imported successfully!');
                window.location.reload();
              });
            }
          } catch (err) {
            alert('Error reading backup file: ' + err.message);
          }
        };
        reader.readAsText(file);
      });
      input.click();
    });
  }

  // Initial Load
  setupCollapsibleSections();

  chrome.storage.sync.get(['enabled', 'playlists', 'settings'], (data) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to load storage:', chrome.runtime.lastError);
      updateStatus(false);
      return;
    }

    const enabled = data.enabled !== false;
    const raw = data.playlists || [];
    const valid = raw.filter(p => p && validatePlaylistId(p.id));
    if (valid.length !== raw.length) {
      chrome.storage.sync.set({ playlists: valid });
    }
    currentPlaylists = (valid.length > 0)
      ? valid
      : [{ id: 'WL', name: 'Watch Later', enabled: true, type: 'permanent', isSystem: true }];

    updateStatus(enabled);
    renderPlaylists(currentPlaylists);

    if (data.settings) {
      loadSettingsIntoUI(data.settings);
    }
  });
});
