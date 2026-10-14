// content.js — YouTube Playlist Focus Final (v2.2.0)
// Complete, Secure, and Feature-Rich Implementation
'use strict';

// ========== APPLICATION STATE ==========
const state = {
  isEnabled: true,
  enabledPlaylists: [],
  hasInjected: false,
  isWatchPage: false,
  videoHidingInterval: null,
  videoObserver: null,
  guideObserver: null,
  navInterval: null,
  settings: {
    theme: 'auto',
    autoPlay: true,
    loopPlaylist: false,
    viewMode: 'grid',
    sortBy: 'default',
    sortOrder: 'asc',
    compactMode: false,
    defaultSpeed: 1.0,
    filters: {
      unwatchedOnly: false,
      durationFilter: 'all',
      channelFilter: ''
    },
    collapsedPlaylists: [],
    blockedChannels: []
  },
  watchHistory: [],
  videoProgress: {},
  playlistNotes: {},
  currentPlaylistVideos: [],
  playlistCache: new Map(), // In-memory cache for scraped playlist items
  activeFilterChip: 'all',
  isSyncing: false
};

// ========== CONSTANTS & CONFIG ==========
const CONFIG = {
  MAX_HISTORY: 50,
  MAX_STORAGE_BYTES: 7500,
  HIDE_INTERVAL: 400,
  NAVIGATION_CHECK_INTERVAL: 800,
  FETCH_TIMEOUT: 9000
};

// ========== SECURITY & VALIDATION ==========
const SecurityUtils = {
  sanitizeText(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  },

  validateVideoId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);
  },

  validatePlaylistId(id) {
    if (!id || typeof id !== 'string') return false;
    const clean = id.trim();
    if (clean.toUpperCase() === 'WL') return true;
    if (clean === 'LL' || clean === 'VLLL') return false;
    // Exactly 11 characters is ALWAYS an individual YouTube video ID, not a playlist
    if (/^[A-Za-z0-9_-]{11}$/.test(clean)) return false;
    if (clean.length < 12) return false;
    if (clean.startsWith('UC')) return false; // Channel ID, not playlist
    // Real playlists start with PL, FL, OLAK, RD, UU, TL, CL, EL or have 13-64 chars
    return /^(?:PL|FL|OLAK|RD|UU|TL|CL|EL)[A-Za-z0-9_-]{10,}$/i.test(clean) ||
           (/^[A-Za-z0-9_-]{13,64}$/.test(clean) && !clean.startsWith('UC'));
  },

  validateSafeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const parsed = new URL(url, 'https://www.youtube.com');
      return (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
             (parsed.hostname.endsWith('youtube.com') || parsed.hostname.endsWith('ytimg.com') || parsed.hostname.endsWith('googlevideo.com'));
    } catch {
      return false;
    }
  }
};

// ========== PERFORMANCE UTILITIES ==========
const PerformanceUtils = {
  debounce(func, wait = 300) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  },

  throttle(func, limit = 200) {
    let inThrottle = false;
    return function (...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => { inThrottle = false; }, limit);
      }
    };
  }
};

// ========== STORAGE MANAGER ==========
const StorageManager = {
  async load(keys) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(keys, (data) => {
        if (chrome.runtime.lastError) {
          chrome.storage.local.get(keys, (localData) => {
            resolve(localData || {});
          });
        } else {
          resolve(data || {});
        }
      });
    });
  },

  async save(key, value) {
    return new Promise((resolve) => {
      try {
        let safeValue = value;
        const serialized = JSON.stringify(safeValue);
        if (serialized.length > CONFIG.MAX_STORAGE_BYTES && key === 'videoProgress') {
          const entries = Object.entries(safeValue);
          safeValue = Object.fromEntries(entries.slice(-60));
        }
        chrome.storage.sync.set({ [key]: safeValue }, () => {
          if (chrome.runtime.lastError) {
            chrome.storage.local.set({ [key]: safeValue }, () => {
              resolve(!chrome.runtime.lastError);
            });
          } else {
            resolve(true);
          }
        });
      } catch (err) {
        console.error(`Failed to serialize ${key}:`, err);
        resolve(false);
      }
    });
  }
};

// ========== TOAST NOTIFICATION SYSTEM ==========
function showPfNotification(message, type = 'info') {
  const existing = document.getElementById('pf-toast-notification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'pf-toast-notification';
  toast.className = `pf-toast pf-toast-${type}`;
  toast.textContent = message;

  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

// ========== DURATION & STATS HELPERS ==========
function parseDurationToSeconds(duration) {
  if (!duration) return 0;
  const parts = String(duration).trim().split(':').map(p => parseInt(p, 10) || 0);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }
  return 0;
}

function formatSecondsToHuman(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${secs}s`;
}

function calculatePlaylistStats(videos) {
  let totalSeconds = 0;
  let watchedCount = 0;

  videos.forEach((video) => {
    if (video.duration) {
      totalSeconds += parseDurationToSeconds(video.duration);
    }
    if (state.videoProgress[video.id]) {
      watchedCount++;
    }
  });

  const unwatchedCount = Math.max(0, videos.length - watchedCount);
  const percentWatched = videos.length > 0 ? Math.round((watchedCount / videos.length) * 100) : 0;

  return {
    totalVideos: videos.length,
    totalDuration: formatSecondsToHuman(totalSeconds),
    totalSeconds,
    watchedCount,
    unwatchedCount,
    percentWatched
  };
}

// ========== ROBUST JSON EXTRACTOR FOR YOUTUBE HTML ==========
function extractBalancedJsonObject(str, startIndex) {
  var depth = 0;
  var inStr = false;
  var esc = false;
  var q = null;
  for (var i = startIndex; i < str.length; i++) {
    var c = str[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === '\\') {
      esc = true;
      continue;
    }
    if (inStr) {
      if (c === q) {
        inStr = false;
        q = null;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      q = c;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(str.slice(startIndex, i + 1));
        } catch (e) {
          return null;
        }
      }
    }
  }
  return null;
}

function extractAllJsonFromHtml(html, varNames = ['ytInitialData', 'ytInitialPlayerResponse']) {
  if (!html || typeof html !== 'string') return [];
  const results = [];
  const names = Array.isArray(varNames) ? varNames : [varNames];

  for (const varName of names) {
    const regex = new RegExp('(?:var\\s+|window\\["' + varName + '"\\]\\s*=\\s*|window\\.' + varName + '\\s*=\\s*|' + varName + '\\s*=\\s*)({)', 'g');
    let match;
    while ((match = regex.exec(html)) !== null) {
      const start = match.index + match[0].length - 1;
      const parsed = extractBalancedJsonObject(html, start);
      if (parsed) {
        results.push(parsed);
      }
    }
  }
  return results;
}

function extractJsonFromHtml(html, varName = 'ytInitialData') {
  const all = extractAllJsonFromHtml(html, varName);
  if (all.length === 0) return null;
  // Return the richest candidate (containing contents, sidebar, or items)
  return all.find(o => o.contents || o.sidebar || o.items) || all[all.length - 1] || all[0];
}

// ========== YOUTUBE SCRAPING ENGINE ==========
async function scrapePlaylistVideos(playlistId) {
  if (!SecurityUtils.validatePlaylistId(playlistId)) return [];

  if (state.playlistCache.has(playlistId)) {
    return state.playlistCache.get(playlistId);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT);

    const targetUrl = playlistId === 'WL'
      ? 'https://www.youtube.com/playlist?list=WL'
      : `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;

    const resp = await fetch(targetUrl, {
      signal: controller.signal,
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Cache-Control': 'no-cache'
      }
    });
    clearTimeout(timeout);

    if (!resp.ok) return [];

    const html = await resp.text();
    const dataCandidates = extractAllJsonFromHtml(html);
    const videosMap = new Map();

    const findVideos = (obj, searchDepth = 0) => {
      if (!obj || typeof obj !== 'object' || searchDepth > 25) return;

      // 1. Classic playlistVideoRenderer
      if (obj.playlistVideoRenderer && obj.playlistVideoRenderer.videoId) {
        const r = obj.playlistVideoRenderer;
        const videoId = r.videoId;
        if (SecurityUtils.validateVideoId(videoId) && !videosMap.has(videoId)) {
          const title = r.title?.runs?.[0]?.text || r.title?.simpleText || videoId;
          const channel = r.shortBylineText?.runs?.[0]?.text || r.ownerText?.runs?.[0]?.text || '';
          const duration = r.lengthText?.simpleText || r.lengthText?.runs?.[0]?.text || '';
          const thumbnail = r.thumbnail?.thumbnails?.find(t => t.width >= 160)?.url
            || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

          videosMap.set(videoId, {
            id: videoId,
            title,
            channel,
            duration,
            thumbnail
          });
        }
      }

      // 2. Modern lockupViewModel (YouTube 2024-2026 for videos)
      if (obj.lockupViewModel) {
        const m = obj.lockupViewModel;
        let vId = m.contentId;
        if (!vId && m.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId) {
          vId = m.rendererContext.commandContext.onTap.innertubeCommand.watchEndpoint.videoId;
        }

        if (SecurityUtils.validateVideoId(vId) && !videosMap.has(vId)) {
          const title = m.metadata?.lockupMetadataViewModel?.title?.content
            || m.metadata?.lockupMetadataViewModel?.title?.runs?.[0]?.text
            || m.metadata?.lockupMetadataViewModel?.title?.simpleText
            || vId;

          // Duration from overlay badge or accessibility label
          let duration = m.contentImage?.thumbnailViewModel?.overlays?.[0]?.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel?.text || '';
          if (!duration) {
            const aLabel = m.rendererContext?.accessibilityContext?.label || '';
            const durMatch = aLabel.match(/(\d+:\d+(?::\d+)?)/);
            if (durMatch) duration = durMatch[1];
          }

          const thumbnail = m.contentImage?.thumbnailViewModel?.image?.sources?.[0]?.url
            || `https://img.youtube.com/vi/${vId}/mqdefault.jpg`;

          videosMap.set(vId, {
            id: vId,
            title,
            channel: '',
            duration,
            thumbnail
          });
        }
      }

      // 3. videoRenderer / compactVideoRenderer
      if ((obj.videoRenderer || obj.compactVideoRenderer) && (obj.videoRenderer?.videoId || obj.compactVideoRenderer?.videoId)) {
        const r = obj.videoRenderer || obj.compactVideoRenderer;
        const vId = r.videoId;
        if (SecurityUtils.validateVideoId(vId) && !videosMap.has(vId)) {
          const title = r.title?.runs?.[0]?.text || r.title?.simpleText || vId;
          const channel = r.shortBylineText?.runs?.[0]?.text || r.ownerText?.runs?.[0]?.text || '';
          const duration = r.lengthText?.simpleText || r.lengthText?.runs?.[0]?.text || '';
          const thumbnail = r.thumbnail?.thumbnails?.find(t => t.width >= 160)?.url
            || `https://img.youtube.com/vi/${vId}/mqdefault.jpg`;

          videosMap.set(vId, {
            id: vId,
            title,
            channel,
            duration,
            thumbnail
          });
        }
      }

      if (Array.isArray(obj)) {
        obj.forEach((item) => findVideos(item, searchDepth + 1));
      } else {
        Object.values(obj).forEach((val) => findVideos(val, searchDepth + 1));
      }
    };

    dataCandidates.forEach(c => findVideos(c, 0));

    // Fallback: raw HTML regex matching for videoId
    if (videosMap.size === 0) {
      const vRegex = /(?:[?&/]|\\\/)watch\?v=([A-Za-z0-9_-]{11})|"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"/g;
      let vMatch;
      while ((vMatch = vRegex.exec(html)) !== null) {
        const vId = vMatch[1] || vMatch[2];
        if (SecurityUtils.validateVideoId(vId) && !videosMap.has(vId)) {
          const snippet = html.substring(Math.max(0, vMatch.index - 200), Math.min(html.length, vMatch.index + 350));
          const tMatch =
            snippet.match(/"content"\s*:\s*"([^"]+)"/) ||
            snippet.match(/"title"\s*:\s*\{"runs"\s*:\s*\[\{"text"\s*:\s*"([^"]+)"/) ||
            snippet.match(/"title"\s*:\s*"([^"]+)"/);
          const title = tMatch ? tMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : vId;
          const durMatch = snippet.match(/"lengthText"\s*:\s*\{"simpleText"\s*:\s*"([^"]+)"/) || snippet.match(/"text"\s*:\s*"(\d+:\d+)"/);
          const duration = durMatch ? durMatch[1] : '';

          videosMap.set(vId, {
            id: vId,
            title,
            channel: '',
            duration,
            thumbnail: `https://img.youtube.com/vi/${vId}/mqdefault.jpg`
          });
        }
      }
    }

    const videos = Array.from(videosMap.values());
    state.playlistCache.set(playlistId, videos);
    return videos;
  } catch (err) {
    console.warn(`Could not scrape playlist ${playlistId}:`, err);
    return [];
  }
}

// ========== DISCOVER & AUTO-SYNC ALL ACCOUNT PLAYLISTS FROM /feed/playlists ==========
async function discoverAndSyncAccountPlaylists(showToast = false) {
  if (state.isSyncing) return state.enabledPlaylists;
  state.isSyncing = true;

  const discovered = new Map();

  // Watch Later ALWAYS comes first
  discovered.set('WL', { id: 'WL', name: 'Watch Later', enabled: true, type: 'permanent', isSystem: true });

  // Helper to extract playlists from parsed JSON tree
  const extractFromObject = (obj, searchDepth = 0) => {
    if (!obj || typeof obj !== 'object' || searchDepth > 25) return;

    // 1. gridPlaylistRenderer
    if (obj.gridPlaylistRenderer) {
      const r = obj.gridPlaylistRenderer;
      const id = r.playlistId;
      const title = r.title?.runs?.[0]?.text || r.title?.simpleText || id;
      if (SecurityUtils.validatePlaylistId(id) && id !== 'WL' && title && !discovered.has(id)) {
        discovered.set(id, { id, name: title, enabled: true, type: 'permanent' });
      }
    }

    // 2. playlistRenderer
    if (obj.playlistRenderer) {
      const r = obj.playlistRenderer;
      const id = r.playlistId;
      const title = r.title?.simpleText || r.title?.runs?.[0]?.text || id;
      if (SecurityUtils.validatePlaylistId(id) && id !== 'WL' && title && !discovered.has(id)) {
        discovered.set(id, { id, name: title, enabled: true, type: 'permanent' });
      }
    }

    // 3. compactPlaylistRenderer
    if (obj.compactPlaylistRenderer) {
      const r = obj.compactPlaylistRenderer;
      const id = r.playlistId;
      const title = r.title?.simpleText || r.title?.runs?.[0]?.text || id;
      if (SecurityUtils.validatePlaylistId(id) && id !== 'WL' && title && !discovered.has(id)) {
        discovered.set(id, { id, name: title, enabled: true, type: 'permanent' });
      }
    }

    // 4. lockupViewModel (STRICT: only playlists, NEVER videos)
    if (obj.lockupViewModel) {
      const m = obj.lockupViewModel;
      // MUST be a playlist, NEVER a video
      if (m.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST' || (m.contentId && SecurityUtils.validatePlaylistId(m.contentId))) {
        let id = (m.contentId && SecurityUtils.validatePlaylistId(m.contentId)) ? m.contentId : '';

        if (!id && m.rendererContext?.commandContext?.onTap?.innertubeCommand?.browseEndpoint?.browseId) {
          const bId = m.rendererContext.commandContext.onTap.innertubeCommand.browseEndpoint.browseId;
          const candId = bId.startsWith('VLPL') ? bId.substring(2) : bId;
          if (SecurityUtils.validatePlaylistId(candId)) id = candId;
        }
        if (!id && m.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.playlistId) {
          const pId = m.rendererContext.commandContext.onTap.innertubeCommand.watchEndpoint.playlistId;
          if (SecurityUtils.validatePlaylistId(pId)) id = pId;
        }

        const title = m.metadata?.lockupMetadataViewModel?.title?.content
          || m.metadata?.lockupMetadataViewModel?.title?.runs?.[0]?.text
          || m.metadata?.lockupMetadataViewModel?.title?.simpleText;

        if (SecurityUtils.validatePlaylistId(id) && id !== 'WL' && title && !discovered.has(id)) {
          discovered.set(id, { id, name: title, enabled: true, type: 'permanent' });
        }
      }
    }

    // 5. guideEntryRenderer (from YouTube sidebar guide)
    if (obj.guideEntryRenderer) {
      const g = obj.guideEntryRenderer;
      const endpoint = g.navigationEndpoint?.browseEndpoint?.browseId || '';
      let id = '';
      const candId = endpoint.startsWith('VLPL') ? endpoint.substring(2) : endpoint;
      if (SecurityUtils.validatePlaylistId(candId)) {
        id = candId;
      } else if (g.navigationEndpoint?.watchEndpoint?.playlistId) {
        const pId = g.navigationEndpoint.watchEndpoint.playlistId;
        if (SecurityUtils.validatePlaylistId(pId)) id = pId;
      }

      const title = g.formattedTitle?.simpleText
        || g.formattedTitle?.runs?.[0]?.text
        || g.title;

      if (SecurityUtils.validatePlaylistId(id) && id !== 'WL' && title && !discovered.has(id)) {
        discovered.set(id, { id, name: title, enabled: true, type: 'permanent' });
      }
    }

    // 6. Generic browseEndpoint match
    if (obj.browseEndpoint && typeof obj.browseEndpoint.browseId === 'string') {
      const bId = obj.browseEndpoint.browseId;
      if (bId.startsWith('VLPL')) {
        const id = bId.substring(2);
        if (SecurityUtils.validatePlaylistId(id) && id !== 'WL' && !discovered.has(id)) {
          discovered.set(id, { id, name: `Playlist (${id.substring(0, 8)})`, enabled: true, type: 'permanent' });
        }
      }
    }

    if (Array.isArray(obj)) {
      obj.forEach((item) => extractFromObject(item, searchDepth + 1));
    } else {
      Object.values(obj).forEach((val) => extractFromObject(val, searchDepth + 1));
    }
  };

  // Helper to extract playlists from raw HTML text (STRICT PL PREFIX)
  const extractFromRawHtml = (rawText) => {
    if (!rawText) return;

    const idPatterns = [
      /[?&]list=(PL[A-Za-z0-9_-]{11,})/g,
      /(?:\\u0026|&amp;)list=(PL[A-Za-z0-9_-]{11,})/g,
      /\\\/playlist\?list=(PL[A-Za-z0-9_-]{11,})/g,
      /"playlistId"\s*:\s*"(PL[A-Za-z0-9_-]{11,})"/g,
      /"contentId"\s*:\s*"(PL[A-Za-z0-9_-]{11,})"/g,
      /"browseId"\s*:\s*"(?:VL)?(PL[A-Za-z0-9_-]{11,})"/g
    ];

    for (const regex of idPatterns) {
      let match;
      while ((match = regex.exec(rawText)) !== null) {
        const id = match[1];
        if (SecurityUtils.validatePlaylistId(id) && id !== 'WL' && !discovered.has(id)) {
          const snippet = rawText.substring(Math.max(0, match.index - 350), Math.min(rawText.length, match.index + 350));
          const titleMatch =
            snippet.match(/"content"\s*:\s*"([^"]+)"/) ||
            snippet.match(/"title"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/) ||
            snippet.match(/"title"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"/) ||
            snippet.match(/"title"\s*:\s*"([^"]+)"/) ||
            snippet.match(/"text"\s*:\s*"([^"]+)"/) ||
            snippet.match(/title="([^"]+)"/) ||
            snippet.match(/aria-label="([^"]+)"/);

          let name = titleMatch ? titleMatch[1] : '';
          name = name.replace(/\\u0026/g, '&').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();

          if (!name || name.toLowerCase().includes('play all') || name.toLowerCase().includes('view full') || name.length > 80) {
            name = `Playlist (${id.substring(0, 8)}...)`;
          }

          discovered.set(id, { id, name, enabled: true, type: 'permanent' });
        }
      }
    }
  };

  // Strategy 0: Inspect Current Page DOM & Script Tags Immediately
  try {
    // 0a. Scan script tags in document for ytInitialData
    const pageScripts = document.querySelectorAll('script');
    pageScripts.forEach((s) => {
      const text = s.textContent || '';
      if (text.includes('ytInitialData') || text.includes('list=PL') || text.includes('"contentId"')) {
        const candidates = extractAllJsonFromHtml(text);
        candidates.forEach(extractFromObject);
        extractFromRawHtml(text);
      }
    });

    // 0b. Scan DOM elements specifically targeting playlist links
    const domLinks = document.querySelectorAll(
      'a[href*="list=PL"], a[href*="/playlist?list=PL"], ytd-guide-entry-renderer a[href*="list="], ytd-grid-playlist-renderer a[href*="list="], ytd-playlist-renderer a[href*="list="]'
    );
    domLinks.forEach((el) => {
      const href = el.getAttribute('href') || '';
      const match = href.match(/[?&]list=(PL[A-Za-z0-9_-]{11,})/i);
      if (match) {
        const id = match[1];
        if (SecurityUtils.validatePlaylistId(id) && id !== 'WL' && !discovered.has(id)) {
          const titleEl = el.querySelector('yt-formatted-string, #video-title, #title, span, h3') || el;
          let name = el.getAttribute('title') || el.getAttribute('aria-label') || titleEl.textContent.trim();
          if (name && !name.toLowerCase().includes('liked')) {
            discovered.set(id, { id, name, enabled: true, type: 'permanent' });
          }
        }
      }
    });
  } catch (e) {
    console.warn('Initial DOM/script inspection error:', e);
  }

  // Strategy 1: Fetch from https://www.youtube.com/feed/playlists
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch('https://www.youtube.com/feed/playlists', {
      signal: controller.signal,
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Cache-Control': 'no-cache'
      }
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const html = await resp.text();
      const candidates = extractAllJsonFromHtml(html);
      candidates.forEach(extractFromObject);
      extractFromRawHtml(html);
    }
  } catch (e) {
    console.warn('Feed playlists fetch error:', e);
  }

  // Strategy 2: If no account playlists found besides WL, fetch /feed/library and /feed/you
  if (discovered.size <= 1) {
    const backupUrls = ['https://www.youtube.com/feed/library', 'https://www.youtube.com/feed/you'];
    for (const url of backupUrls) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const resp = await fetch(url, {
          signal: controller.signal,
          credentials: 'include',
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Cache-Control': 'no-cache'
          }
        });
        clearTimeout(timeout);
        if (resp.ok) {
          const html = await resp.text();
          const candidates = extractAllJsonFromHtml(html);
          candidates.forEach(extractFromObject);
          extractFromRawHtml(html);
        }
      } catch (err) {
        console.warn(`Fetch error for ${url}:`, err);
      }
      if (discovered.size > 1) break;
    }
  }

  // Merge discovered playlists with existing custom playlists (WL always first)
  const existingMap = new Map();
  (state.enabledPlaylists || []).forEach((p) => {
    if (p && p.id !== 'LL' && p.id !== 'VLLL' && SecurityUtils.validatePlaylistId(p.id)) {
      existingMap.set(p.id, p);
    }
  });

  const mergedList = [];
  if (discovered.has('WL')) {
    mergedList.push(existingMap.has('WL') ? existingMap.get('WL') : discovered.get('WL'));
    existingMap.delete('WL');
    discovered.delete('WL');
  }

  discovered.forEach((val, id) => {
    if (SecurityUtils.validatePlaylistId(id)) {
      if (existingMap.has(id)) {
        mergedList.push({ ...val, ...existingMap.get(id) });
        existingMap.delete(id);
      } else {
        mergedList.push(val);
      }
    }
  });

  // Retain any remaining manual valid playlists
  existingMap.forEach((val) => {
    if (SecurityUtils.validatePlaylistId(val.id)) {
      mergedList.push(val);
    }
  });

  state.enabledPlaylists = mergedList;
  await StorageManager.save('playlists', mergedList);
  state.isSyncing = false;

  const count = mergedList.length;
  if (showToast) {
    showPfNotification(`🎉 Synced ${count} playlists from your YouTube account!`);
  }

  if (!state.isWatchPage) {
    loadAndRenderPlaylists();
  } else {
    injectPlaylistSidebar();
  }

  return mergedList;
}

// ========== THEME DETECTION & APPLICATION ==========
function applyTheme() {
  let theme = state.settings.theme || 'auto';

  if (theme === 'auto') {
    const isYtDark = document.documentElement.hasAttribute('dark') ||
      document.querySelector('html[dark]') !== null ||
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme = isYtDark ? 'dark' : 'light';
  }

  document.documentElement.setAttribute('data-pf-theme', theme);
}

// ========== INITIALIZATION ==========
async function initialize() {
  try {
    const data = await StorageManager.load([
      'enabled', 'playlists', 'settings',
      'watchHistory', 'videoProgress', 'playlistNotes'
    ]);

    state.isEnabled = data.enabled !== false;

    // Filter out any leftover Liked Videos (LL) or individual video IDs
    const rawPlaylists = (data.playlists && data.playlists.length > 0)
      ? data.playlists
      : [{ id: 'WL', name: 'Watch Later', enabled: true, type: 'permanent', isSystem: true }];

    state.enabledPlaylists = rawPlaylists
      .filter(p => p && SecurityUtils.validatePlaylistId(p.id) && p.enabled !== false);

    // If all stored playlists were invalid video IDs, ensure Watch Later is restored
    if (state.enabledPlaylists.length === 0) {
      state.enabledPlaylists = [{ id: 'WL', name: 'Watch Later', enabled: true, type: 'permanent', isSystem: true }];
    }

    // Automatically purge any invalid entries (such as individual video IDs) from storage
    if (state.enabledPlaylists.length !== rawPlaylists.length) {
      await StorageManager.save('playlists', state.enabledPlaylists);
    }

    if (data.settings) {
      state.settings = { ...state.settings, ...data.settings };
      if (data.settings.filters) {
        state.settings.filters = { ...state.settings.filters, ...data.settings.filters };
      }
    }

    // Ensure Watch Later is NEVER stored or initialized as collapsed
    if (Array.isArray(state.settings.collapsedPlaylists)) {
      state.settings.collapsedPlaylists = state.settings.collapsedPlaylists.filter(id => id !== 'WL');
    }

    if (Array.isArray(data.watchHistory)) {
      state.watchHistory = data.watchHistory.slice(0, CONFIG.MAX_HISTORY);
    }
    if (data.videoProgress) {
      state.videoProgress = data.videoProgress;
    }
    if (data.playlistNotes) {
      state.playlistNotes = data.playlistNotes;
    }

    checkIfWatchPage();

    if (state.isEnabled) {
      applyTheme();
      if (state.isWatchPage) {
        await setupWatchPage();
      } else {
        setupHomePage();
      }
      setupGlobalEventListeners();

      // Trigger background auto-sync from /feed/playlists & DOM on startup
      setTimeout(() => discoverAndSyncAccountPlaylists(false), 250);
      setTimeout(() => {
        if (state.enabledPlaylists.length <= 1) {
          discoverAndSyncAccountPlaylists(false);
        }
      }, 2500);
    }

    monitorNavigation();
  } catch (err) {
    console.error('Playlist Focus initialization error:', err);
  }
}

// ========== PAGE DETECTION ==========
function checkIfWatchPage() {
  state.isWatchPage = window.location.pathname === '/watch';
  return state.isWatchPage;
}

// ========== NAVIGATION MONITORING (SPA SAFE) ==========
function monitorNavigation() {
  let lastUrl = window.location.href;

  const handleNav = PerformanceUtils.throttle(async () => {
    if (!state.isEnabled) return;

    const currentUrl = window.location.href;
    if (currentUrl === lastUrl && state.hasInjected) return;
    lastUrl = currentUrl;

    const wasWatchPage = state.isWatchPage;
    checkIfWatchPage();

    if (state.isWatchPage) {
      if (!wasWatchPage) cleanupHomePage();
      await setupWatchPage();
    } else {
      if (wasWatchPage) cleanupWatchPage();
      setupHomePage();
    }
  }, 250);

  window.addEventListener('yt-navigate-finish', handleNav);
  window.addEventListener('popstate', handleNav);

  if (state.navInterval) clearInterval(state.navInterval);
  state.navInterval = setInterval(() => {
    if (window.location.href !== lastUrl) {
      handleNav();
    }
  }, CONFIG.NAVIGATION_CHECK_INTERVAL);
}

// ========== HOMEPAGE LIFECYCLE ==========
function setupHomePage() {
  document.body.classList.add('playlist-focus-active');
  document.body.classList.remove('playlist-focus-watching');
  injectCustomUI();
  observeGuideHydration();
}

function cleanupHomePage() {
  document.body.classList.remove('playlist-focus-active');
  if (state.guideObserver) {
    state.guideObserver.disconnect();
    state.guideObserver = null;
  }
  const container = document.getElementById('playlist-focus-container');
  if (container) container.remove();
  state.hasInjected = false;
}

function observeGuideHydration() {
  if (state.guideObserver) return;
  const target = document.querySelector('ytd-app') || document.body;
  if (!target) return;

  state.guideObserver = new MutationObserver(PerformanceUtils.debounce(() => {
    if (state.enabledPlaylists.length <= 1) {
      const guideLinks = document.querySelectorAll(
        'ytd-guide-entry-renderer a[href*="list="], ytd-mini-guide-entry-renderer a[href*="list="], #guide a[href*="list="]'
      );
      if (guideLinks.length > 0) {
        discoverAndSyncAccountPlaylists(false);
      }
    }
  }, 400));

  state.guideObserver.observe(target, { childList: true, subtree: true });
}

// ========== WATCH PAGE LIFECYCLE ==========
async function setupWatchPage() {
  document.body.classList.add('playlist-focus-watching');
  document.body.classList.remove('playlist-focus-active');

  startVideoHiding();
  await injectPlaylistSidebar();
  setupAutoPlayAndProgress();
}

function cleanupWatchPage() {
  document.body.classList.remove('playlist-focus-watching');
  stopVideoHiding();

  const customSidebar = document.getElementById('pf-custom-sidebar');
  if (customSidebar) customSidebar.remove();
}

// ========== HIDE DISTRACTING RECOMMENDATIONS ==========
function startVideoHiding() {
  hideDistractingElements();
  if (state.videoHidingInterval) clearInterval(state.videoHidingInterval);
  state.videoHidingInterval = setInterval(hideDistractingElements, CONFIG.HIDE_INTERVAL);
  observeDomChanges();
}

function stopVideoHiding() {
  if (state.videoHidingInterval) {
    clearInterval(state.videoHidingInterval);
    state.videoHidingInterval = null;
  }
  if (state.videoObserver) {
    state.videoObserver.disconnect();
    state.videoObserver = null;
  }
}

function observeDomChanges() {
  if (state.videoObserver) return;
  const target = document.querySelector('#secondary');
  if (target) {
    state.videoObserver = new MutationObserver(PerformanceUtils.throttle(() => {
      hideDistractingElements();
    }, 250));
    state.videoObserver.observe(target, { childList: true, subtree: true });
  }
}

const hideDistractingElements = PerformanceUtils.throttle(() => {
  try {
    const distractors = [
      '#related ytd-item-section-renderer:not(:has(ytd-playlist-panel-renderer))',
      'ytd-watch-next-secondary-results-renderer #items > ytd-item-section-renderer',
      'ytd-compact-video-renderer:not(.pf-allowed-item)',
      'ytd-compact-autoplay-renderer',
      'ytd-feed-filter-chip-bar-renderer',
      '.ytp-ce-element'
    ];

    distractors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        el.style.display = 'none';
        el.style.visibility = 'hidden';
      });
    });

    const sidebar = document.getElementById('pf-custom-sidebar');
    if (sidebar) {
      sidebar.style.display = 'block';
      sidebar.style.visibility = 'visible';
    }
  } catch (err) {
    console.warn('Error hiding distractors:', err);
  }
}, 150);

// ========== HOMEPAGE UI INJECTION ==========
function injectCustomUI() {
  let container = document.getElementById('playlist-focus-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'playlist-focus-container';

    // Mount inside #page-manager (YouTube's native content area) so it automatically respects
    // masthead height (56px) and guide sidebar width (240px / 72px) without overlapping
    const pageManager = document.querySelector('ytd-page-manager, #page-manager');
    if (pageManager) {
      pageManager.prepend(container);
    } else {
      const ytdApp = document.querySelector('ytd-app');
      if (ytdApp && ytdApp.parentNode) {
        ytdApp.parentNode.insertBefore(container, ytdApp);
      } else {
        document.body.prepend(container);
      }
    }
  } else {
    // If container already exists but is outside #page-manager, move it into #page-manager
    const pageManager = document.querySelector('ytd-page-manager, #page-manager');
    if (pageManager && container.parentNode !== pageManager) {
      pageManager.prepend(container);
    }
  }

  container.innerHTML = '';
  state.hasInjected = true;

  // --- 1. Top Bar Navigation ---
  const topBar = document.createElement('div');
  topBar.className = 'pf-top-bar';

  // Bar Header: Logo + Controls
  const barHeader = document.createElement('div');
  barHeader.className = 'pf-bar-header';

  const logoGroup = document.createElement('div');
  logoGroup.className = 'pf-logo-group';

  const logoIcon = document.createElement('div');
  logoIcon.className = 'pf-logo-icon';
  logoIcon.textContent = '▶';

  const logoTitle = document.createElement('h1');
  logoTitle.className = 'pf-logo-title';
  logoTitle.textContent = 'Playlist Focus';

  logoGroup.appendChild(logoIcon);
  logoGroup.appendChild(logoTitle);

  const controlsGroup = document.createElement('div');
  controlsGroup.className = 'pf-controls-group';

  // [🔄 Sync Playlists] Button
  const syncBtn = document.createElement('button');
  syncBtn.className = 'pf-sync-btn';
  syncBtn.id = 'pfSyncPlaylistsBtn';
  syncBtn.innerHTML = '🔄 <span>Sync Playlists</span>';
  syncBtn.title = 'Scan and sync all playlists from your YouTube account (/feed/playlists)';
  syncBtn.addEventListener('click', async () => {
    syncBtn.classList.add('loading');
    syncBtn.querySelector('span').textContent = 'Syncing...';
    await discoverAndSyncAccountPlaylists(true);
    syncBtn.classList.remove('loading');
    syncBtn.querySelector('span').textContent = 'Sync Playlists';
  });
  controlsGroup.appendChild(syncBtn);

  // [View] Dropdown Button
  const viewWrapper = document.createElement('div');
  viewWrapper.className = 'pf-view-dropdown-wrapper';

  const viewBtn = document.createElement('button');
  viewBtn.className = 'pf-view-menu-btn';
  viewBtn.id = 'pfViewMenuBtn';
  viewBtn.innerHTML = `<span>View</span> <span class="pf-caret">▾</span>`;
  viewBtn.title = 'Change playlist layout view';

  const viewDropdown = document.createElement('div');
  viewDropdown.className = 'pf-view-dropdown-menu';

  const viewOptions = [
    { id: 'grid', label: '⊞ Grid View' },
    { id: 'shelf', label: '▶ Shelf View' },
    { id: 'list', label: '☰ List View' },
    { id: 'compact', label: '⊟ Compact View' }
  ];

  viewOptions.forEach((v) => {
    const item = document.createElement('button');
    item.className = `pf-view-dropdown-item${state.settings.viewMode === v.id ? ' active' : ''}`;
    item.textContent = v.label;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      state.settings.viewMode = v.id;
      StorageManager.save('settings', state.settings);
      viewDropdown.querySelectorAll('.pf-view-dropdown-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      viewDropdown.classList.remove('open');
      document.querySelectorAll('.pf-playlist-section').forEach(sec => {
        sec.className = `pf-playlist-section view-${v.id}${sec.classList.contains('pf-watch-later-section') ? ' pf-watch-later-section' : ''}${sec.classList.contains('pf-account-playlist-item') ? ' pf-account-playlist-item' : ''}${sec.classList.contains('collapsed') ? ' collapsed' : ''}`;
      });
    });
    viewDropdown.appendChild(item);
  });

  viewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    viewDropdown.classList.toggle('open');
    document.querySelector('.pf-filter-dropdown-menu')?.classList.remove('open');
  });

  viewWrapper.appendChild(viewBtn);
  viewWrapper.appendChild(viewDropdown);
  controlsGroup.appendChild(viewWrapper);

  // [Collapse All / Expand All] Quick Button
  const allCollapsed = (state.enabledPlaylists || []).length > 0 &&
    (state.enabledPlaylists || []).every(p => (state.settings.collapsedPlaylists || []).includes(p.id));

  const collapseAllBtn = document.createElement('button');
  collapseAllBtn.className = 'pf-collapse-all-btn';
  collapseAllBtn.id = 'pfCollapseAllBtn';
  collapseAllBtn.innerHTML = `<span>${allCollapsed ? '⊞ Expand All' : '⊟ Collapse All'}</span>`;
  collapseAllBtn.title = allCollapsed ? 'Expand all playlists' : 'Collapse all playlists';
  collapseAllBtn.addEventListener('click', () => {
    if (!Array.isArray(state.settings.collapsedPlaylists)) {
      state.settings.collapsedPlaylists = [];
    }
    const currentAllCollapsed = (state.enabledPlaylists || []).every(p => state.settings.collapsedPlaylists.includes(p.id));
    if (currentAllCollapsed) {
      state.settings.collapsedPlaylists = [];
      collapseAllBtn.innerHTML = '<span>⊟ Collapse All</span>';
      collapseAllBtn.title = 'Collapse all playlists';
      document.querySelectorAll('.pf-playlist-section').forEach(sec => {
        sec.classList.remove('collapsed');
        const icon = sec.querySelector('.pf-collapse-icon');
        if (icon) icon.textContent = '▾';
        const btn = sec.querySelector('.pf-collapse-btn');
        if (btn) btn.title = 'Collapse playlist';
      });
    } else {
      state.settings.collapsedPlaylists = (state.enabledPlaylists || [])
        .map(p => p.id)
        .filter(id => id !== 'WL');
      collapseAllBtn.innerHTML = '<span>⊞ Expand All</span>';
      collapseAllBtn.title = 'Expand all playlists';
      document.querySelectorAll('.pf-playlist-section').forEach(sec => {
        if (sec.classList.contains('pf-watch-later-section')) return;
        sec.classList.add('collapsed');
        const icon = sec.querySelector('.pf-collapse-icon');
        if (icon) icon.textContent = '▸';
        const btn = sec.querySelector('.pf-collapse-btn');
        if (btn) btn.title = 'Expand playlist';
      });
    }
    StorageManager.save('settings', state.settings);
  });
  controlsGroup.appendChild(collapseAllBtn);

  // [Focus ON] Master Toggle Button
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'pf-toggle-btn';
  toggleBtn.id = 'pfFocusToggleBtn';
  toggleBtn.textContent = '🟢 Focus ON';
  toggleBtn.title = 'Click to disable and view standard YouTube';
  toggleBtn.addEventListener('click', () => {
    state.isEnabled = false;
    chrome.storage.sync.set({ enabled: false }, () => {
      cleanupHomePage();
      document.body.classList.remove('playlist-focus-active');
    });
  });
  controlsGroup.appendChild(toggleBtn);

  barHeader.appendChild(logoGroup);
  barHeader.appendChild(controlsGroup);
  topBar.appendChild(barHeader);

  // --- 2. Universal Search Bar ---
  const searchWrapper = document.createElement('div');
  searchWrapper.className = 'pf-search-wrapper';

  const searchBox = document.createElement('div');
  searchBox.className = 'pf-search-box';

  const searchIcon = document.createElement('span');
  searchIcon.className = 'pf-search-icon';
  searchIcon.textContent = '🔍';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'pf-search-input';
  searchInput.id = 'pfUniversalSearch';
  searchInput.placeholder = 'Search all playlists and videos...';
  searchInput.autocomplete = 'off';

  const clearBtn = document.createElement('button');
  clearBtn.className = 'pf-search-clear';
  clearBtn.textContent = '✕';
  clearBtn.title = 'Clear search';
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.classList.remove('visible');
    renderAllPlaylistsContent();
  });

  searchBox.appendChild(searchIcon);
  searchBox.appendChild(searchInput);
  searchBox.appendChild(clearBtn);
  searchWrapper.appendChild(searchBox);
  topBar.appendChild(searchWrapper);

  // --- 3. Filter Controls: [All] [Unwatched Only] [Filter] ---
  const filtersRow = document.createElement('div');
  filtersRow.className = 'pf-filters-row';

  // [All]
  const allChip = document.createElement('button');
  allChip.className = `pf-filter-chip${(!state.activeFilterChip || state.activeFilterChip === 'all') ? ' active' : ''}`;
  allChip.textContent = 'All';
  allChip.id = 'pfFilterAllBtn';

  // [Unwatched Only]
  const unwatchedChip = document.createElement('button');
  unwatchedChip.className = `pf-filter-chip${state.activeFilterChip === 'unwatched' ? ' active' : ''}`;
  unwatchedChip.textContent = 'Unwatched Only';
  unwatchedChip.id = 'pfFilterUnwatchedBtn';

  // [Filter] Dropdown
  const filterDropdownWrapper = document.createElement('div');
  filterDropdownWrapper.className = 'pf-filter-dropdown-wrapper';

  const isCustomFilter = state.activeFilterChip && !['all', 'unwatched'].includes(state.activeFilterChip);
  const filterDropdownBtn = document.createElement('button');
  filterDropdownBtn.className = `pf-filter-chip pf-filter-dropdown-trigger${isCustomFilter ? ' active' : ''}`;
  filterDropdownBtn.id = 'pfFilterDropdownBtn';

  const getFilterLabel = (chipId) => {
    switch (chipId) {
      case 'short': return 'Filter: < 10m';
      case 'medium': return 'Filter: 10-30m';
      case 'long': return 'Filter: > 30m';
      case 'sort_title': return 'Sort: Title';
      case 'sort_duration': return 'Sort: Longest';
      case 'sort_duration_asc': return 'Sort: Shortest';
      default: return 'Filter';
    }
  };

  filterDropdownBtn.innerHTML = `<span>${getFilterLabel(state.activeFilterChip)}</span> <span class="pf-caret">▾</span>`;

  const filterDropdownMenu = document.createElement('div');
  filterDropdownMenu.className = 'pf-filter-dropdown-menu';

  const filterGroups = [
    {
      group: 'Duration',
      items: [
        { id: 'short', label: '⚡ Quick (< 10 mins)' },
        { id: 'medium', label: '⏱️ Medium (10 - 30 mins)' },
        { id: 'long', label: '🎬 Deep Dive (> 30 mins)' }
      ]
    },
    {
      group: 'Sort By',
      items: [
        { id: 'sort_title', label: '🔤 Title (A - Z)' },
        { id: 'sort_duration', label: '⏳ Duration (Longest)' },
        { id: 'sort_duration_asc', label: '⌛ Duration (Shortest)' }
      ]
    }
  ];

  filterGroups.forEach((groupData, idx) => {
    if (idx > 0) {
      const div = document.createElement('div');
      div.className = 'pf-filter-dropdown-divider';
      filterDropdownMenu.appendChild(div);
    }
    const groupTitle = document.createElement('div');
    groupTitle.className = 'pf-filter-group-title';
    groupTitle.textContent = groupData.group;
    filterDropdownMenu.appendChild(groupTitle);

    groupData.items.forEach((item) => {
      const optBtn = document.createElement('button');
      optBtn.className = `pf-filter-dropdown-item${state.activeFilterChip === item.id ? ' active' : ''}`;
      optBtn.textContent = item.label;
      optBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.activeFilterChip = item.id;
        allChip.classList.remove('active');
        unwatchedChip.classList.remove('active');
        filterDropdownBtn.classList.add('active');
        filterDropdownBtn.querySelector('span').textContent = getFilterLabel(item.id);
        filterDropdownMenu.querySelectorAll('.pf-filter-dropdown-item').forEach(el => el.classList.remove('active'));
        optBtn.classList.add('active');
        filterDropdownMenu.classList.remove('open');
        renderAllPlaylistsContent();
      });
      filterDropdownMenu.appendChild(optBtn);
    });
  });

  // Reset option in dropdown
  const resetDivider = document.createElement('div');
  resetDivider.className = 'pf-filter-dropdown-divider';
  filterDropdownMenu.appendChild(resetDivider);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'pf-filter-dropdown-item pf-filter-reset-item';
  resetBtn.textContent = '🔄 Reset Filter';
  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.activeFilterChip = 'all';
    allChip.classList.add('active');
    unwatchedChip.classList.remove('active');
    filterDropdownBtn.classList.remove('active');
    filterDropdownBtn.querySelector('span').textContent = 'Filter';
    filterDropdownMenu.querySelectorAll('.pf-filter-dropdown-item').forEach(el => el.classList.remove('active'));
    filterDropdownMenu.classList.remove('open');
    renderAllPlaylistsContent();
  });
  filterDropdownMenu.appendChild(resetBtn);

  filterDropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    filterDropdownMenu.classList.toggle('open');
    viewDropdown.classList.remove('open');
  });

  filterDropdownWrapper.appendChild(filterDropdownBtn);
  filterDropdownWrapper.appendChild(filterDropdownMenu);

  // [All] Click Event
  allChip.addEventListener('click', () => {
    state.activeFilterChip = 'all';
    allChip.classList.add('active');
    unwatchedChip.classList.remove('active');
    filterDropdownBtn.classList.remove('active');
    filterDropdownBtn.querySelector('span').textContent = 'Filter';
    filterDropdownMenu.querySelectorAll('.pf-filter-dropdown-item').forEach(el => el.classList.remove('active'));
    filterDropdownMenu.classList.remove('open');
    renderAllPlaylistsContent();
  });

  // [Unwatched Only] Click Event
  unwatchedChip.addEventListener('click', () => {
    state.activeFilterChip = 'unwatched';
    unwatchedChip.classList.add('active');
    allChip.classList.remove('active');
    filterDropdownBtn.classList.remove('active');
    filterDropdownBtn.querySelector('span').textContent = 'Filter';
    filterDropdownMenu.querySelectorAll('.pf-filter-dropdown-item').forEach(el => el.classList.remove('active'));
    filterDropdownMenu.classList.remove('open');
    renderAllPlaylistsContent();
  });

  filtersRow.appendChild(allChip);
  filtersRow.appendChild(unwatchedChip);
  filtersRow.appendChild(filterDropdownWrapper);
  topBar.appendChild(filtersRow);

  // 4. Horizontal Divider (matching ├─────────────────────────────────────┤)
  const divider = document.createElement('div');
  divider.className = 'pf-divider';
  topBar.appendChild(divider);

  container.appendChild(topBar);

  // Global click outside to close dropdowns
  document.addEventListener('click', () => {
    viewDropdown.classList.remove('open');
    filterDropdownMenu.classList.remove('open');
  });

  // Search Input Event
  const debouncedSearch = PerformanceUtils.debounce(() => {
    if (searchInput.value.trim().length > 0) {
      clearBtn.classList.add('visible');
    } else {
      clearBtn.classList.remove('visible');
    }
    renderAllPlaylistsContent();
  }, 250);

  searchInput.addEventListener('input', debouncedSearch);

  // --- 5. Main Content Container ---
  const mainContent = document.createElement('div');
  mainContent.id = 'pfMainContent';
  mainContent.className = 'pf-main-content';

  const loadingBox = document.createElement('div');
  loadingBox.className = 'pf-state-box';
  loadingBox.innerHTML = '<div class="pf-state-icon">⏳</div><div>Loading your playlists...</div>';
  mainContent.appendChild(loadingBox);

  container.appendChild(mainContent);

  // Load and Render Playlists
  loadAndRenderPlaylists();
}

// ========== LOAD & RENDER PLAYLISTS ==========
async function loadAndRenderPlaylists() {
  const contentEl = document.getElementById('pfMainContent');
  if (!contentEl) return;

  if (state.enabledPlaylists.length === 0) {
    contentEl.innerHTML = `
      <div class="pf-state-box">
        <div class="pf-state-icon">📺</div>
        <h3 style="margin: 0 0 8px 0; color: var(--pf-text-primary);">No Playlists Found</h3>
        <p>Click "🔄 Sync Playlists" above to import your YouTube playlists.</p>
      </div>
    `;
    return;
  }

  // Ensure Watch Later is always first in list
  const sortedPlaylists = [...state.enabledPlaylists].sort((a, b) => {
    if (a.id === 'WL') return -1;
    if (b.id === 'WL') return 1;
    return 0;
  });

  // Fetch all enabled playlists concurrently
  const loadedData = {};
  const fetchPromises = sortedPlaylists.map(async (playlist) => {
    try {
      const videos = await scrapePlaylistVideos(playlist.id);
      loadedData[playlist.id] = { playlist, videos };
    } catch (err) {
      console.warn(`Error loading ${playlist.id}:`, err);
      loadedData[playlist.id] = { playlist, videos: [] };
    }
  });

  await Promise.all(fetchPromises);
  state.loadedPlaylistData = loadedData;
  renderAllPlaylistsContent();
}

// ========== RENDER CONTENT (WATCH LATER -> ACCOUNT PLAYLISTS) ==========
function renderAllPlaylistsContent() {
  const contentEl = document.getElementById('pfMainContent');
  if (!contentEl || !state.loadedPlaylistData) return;

  contentEl.innerHTML = '';

  const searchInput = document.getElementById('pfUniversalSearch');
  const query = (searchInput?.value || '').toLowerCase().trim();
  const currentView = state.settings.viewMode || 'grid';
  let totalMatchingVideos = 0;

  // Separate Watch Later and Account Playlists
  const allEntries = Object.values(state.loadedPlaylistData);
  const wlEntry = allEntries.find(e => e.playlist.id === 'WL');
  const accountEntries = allEntries.filter(e => e.playlist.id !== 'WL');

  // Helper function to build playlist card section
  function buildPlaylistSection(playlist, videos, isWatchLater = false, branchPrefix = '') {
    let filtered = [...videos];

    // Search filter
    if (query) {
      filtered = filtered.filter(v =>
        (v.title || '').toLowerCase().includes(query) ||
        (v.channel || '').toLowerCase().includes(query)
      );
    }

    // Active chip / dropdown filter
    if (state.activeFilterChip === 'unwatched') {
      filtered = filtered.filter(v => !state.videoProgress[v.id]);
    } else if (state.activeFilterChip === 'short') {
      filtered = filtered.filter(v => parseDurationToSeconds(v.duration) > 0 && parseDurationToSeconds(v.duration) <= 600);
    } else if (state.activeFilterChip === 'medium') {
      filtered = filtered.filter(v => parseDurationToSeconds(v.duration) > 600 && parseDurationToSeconds(v.duration) <= 1800);
    } else if (state.activeFilterChip === 'long') {
      filtered = filtered.filter(v => parseDurationToSeconds(v.duration) > 1800);
    } else if (state.activeFilterChip === 'sort_title') {
      filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (state.activeFilterChip === 'sort_duration') {
      filtered.sort((a, b) => parseDurationToSeconds(b.duration) - parseDurationToSeconds(a.duration));
    } else if (state.activeFilterChip === 'sort_duration_asc') {
      filtered.sort((a, b) => parseDurationToSeconds(a.duration) - parseDurationToSeconds(b.duration));
    }

    totalMatchingVideos += filtered.length;
    const stats = calculatePlaylistStats(videos);

    // Collapsed state: Watch Later is NEVER collapsed on initial render
    const isCollapsed = !isWatchLater && Array.isArray(state.settings.collapsedPlaylists) && state.settings.collapsedPlaylists.includes(playlist.id);

    const section = document.createElement('div');
    section.className = `pf-playlist-section view-${currentView}${isWatchLater ? ' pf-watch-later-section' : ' pf-account-playlist-item'}${isCollapsed ? ' collapsed' : ''}`;
    section.dataset.playlistId = playlist.id;

    // Header
    const header = document.createElement('div');
    header.className = 'pf-playlist-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'pf-playlist-header-left';

    // Collapse toggle button
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'pf-collapse-btn';
    collapseBtn.type = 'button';
    collapseBtn.title = isCollapsed ? 'Expand playlist' : 'Collapse playlist';
    collapseBtn.innerHTML = `<span class="pf-collapse-icon">${isCollapsed ? '▸' : '▾'}</span>`;

    const titleWrap = document.createElement('div');
    titleWrap.className = 'pf-playlist-title-wrap';

    const title = document.createElement('h2');
    title.className = 'pf-playlist-title';

    if (isWatchLater) {
      title.textContent = '🕒 Watch Later';
    } else {
      const branchSpan = document.createElement('span');
      branchSpan.className = 'pf-branch-symbol';
      branchSpan.textContent = branchPrefix;
      const nameSpan = document.createElement('span');
      nameSpan.className = 'pf-playlist-name';
      nameSpan.textContent = playlist.name || playlist.id;
      title.appendChild(branchSpan);
      title.appendChild(nameSpan);
    }

    const metaChips = document.createElement('div');
    metaChips.className = 'pf-meta-chips';
    const chipSpan = document.createElement('span');
    chipSpan.className = 'pf-meta-chip';
    chipSpan.textContent = `(📹 ${stats.totalVideos} videos • ⏱️ ${stats.totalDuration} • ✅ ${stats.watchedCount} watched)`;
    metaChips.appendChild(chipSpan);

    titleWrap.appendChild(title);
    titleWrap.appendChild(metaChips);

    // Toggle collapse handler
    const toggleCollapse = (e) => {
      e.stopPropagation();
      if (!Array.isArray(state.settings.collapsedPlaylists)) {
        state.settings.collapsedPlaylists = [];
      }
      const isCurrentlyCollapsed = section.classList.contains('collapsed');
      if (!isCurrentlyCollapsed) {
        if (!state.settings.collapsedPlaylists.includes(playlist.id)) {
          state.settings.collapsedPlaylists.push(playlist.id);
        }
        section.classList.add('collapsed');
        collapseBtn.querySelector('.pf-collapse-icon').textContent = '▸';
        collapseBtn.title = 'Expand playlist';
      } else {
        const idx = state.settings.collapsedPlaylists.indexOf(playlist.id);
        if (idx !== -1) {
          state.settings.collapsedPlaylists.splice(idx, 1);
        }
        section.classList.remove('collapsed');
        collapseBtn.querySelector('.pf-collapse-icon').textContent = '▾';
        collapseBtn.title = 'Collapse playlist';
      }
      // Never persist Watch Later collapsed state so it always starts open on page refresh
      if (playlist.id !== 'WL') {
        StorageManager.save('settings', state.settings);
      }
    };

    collapseBtn.addEventListener('click', toggleCollapse);
    titleWrap.addEventListener('click', toggleCollapse);

    headerLeft.appendChild(collapseBtn);
    headerLeft.appendChild(titleWrap);

    const openLink = document.createElement('a');
    openLink.className = 'pf-open-playlist-btn';
    openLink.href = playlist.id === 'WL'
      ? 'https://www.youtube.com/playlist?list=WL'
      : `https://www.youtube.com/playlist?list=${encodeURIComponent(playlist.id)}`;
    openLink.target = '_blank';
    openLink.textContent = '↗ Open Playlist';

    header.appendChild(headerLeft);
    header.appendChild(openLink);
    section.appendChild(header);

    // Progress Bar Fill
    const progressWrap = document.createElement('div');
    progressWrap.className = 'pf-playlist-progress-bar-wrap';

    const progressFill = document.createElement('div');
    progressFill.className = 'pf-playlist-progress-bar-fill';
    progressFill.style.width = `${stats.percentWatched}%`;

    progressWrap.appendChild(progressFill);
    section.appendChild(progressWrap);

    // Video Grid / Shelf
    const grid = document.createElement('div');
    grid.className = 'pf-video-grid';

    if (filtered.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.style.cssText = 'padding:24px;color:var(--pf-text-secondary);font-size:13px;';
      emptyItem.textContent = query
        ? 'No videos match your search query in this playlist.'
        : 'No videos found in this playlist.';
      grid.appendChild(emptyItem);
    } else {
      filtered.forEach((video) => {
        grid.appendChild(createVideoCard(video, playlist.id));
      });
    }

    section.appendChild(grid);
    return section;
  }

  // 1. RENDER WATCH LATER SECTION (First)
  if (wlEntry) {
    contentEl.appendChild(buildPlaylistSection(wlEntry.playlist, wlEntry.videos, true));
  }

  // 2. RENDER ACCOUNT PLAYLISTS SECTION (Second)
  const accountBanner = document.createElement('div');
  accountBanner.className = 'pf-account-section-banner';
  const bannerTitle = document.createElement('h3');
  bannerTitle.className = 'pf-account-banner-title';
  bannerTitle.textContent = '📺 Your Account Playlists (from /feed/playlists)';
  const bannerCount = document.createElement('span');
  bannerCount.className = 'pf-account-banner-count';
  bannerCount.textContent = `${accountEntries.length} Playlists`;
  accountBanner.appendChild(bannerTitle);
  accountBanner.appendChild(bannerCount);
  contentEl.appendChild(accountBanner);

  if (accountEntries.length === 0) {
    const emptyNotice = document.createElement('div');
    emptyNotice.className = 'pf-account-empty-notice';
    emptyNotice.textContent = 'No account playlists loaded yet. Click [🔄 Sync Playlists] above to import all playlists from your YouTube account!';
    contentEl.appendChild(emptyNotice);
  } else {
    accountEntries.forEach((entry, index) => {
      const isLast = (index === accountEntries.length - 1);
      const branchPrefix = isLast ? '└─ ' : '├─ ';
      contentEl.appendChild(buildPlaylistSection(entry.playlist, entry.videos, false, branchPrefix));
    });
  }

  if (totalMatchingVideos === 0 && query) {
    const searchNoMatch = document.createElement('div');
    searchNoMatch.className = 'pf-state-box';
    searchNoMatch.style.marginBottom = '24px';
    const iconDiv = document.createElement('div');
    iconDiv.className = 'pf-state-icon';
    iconDiv.textContent = '🔍';
    const h3 = document.createElement('h3');
    h3.textContent = `No videos matched "${query}"`;
    const p = document.createElement('p');
    p.textContent = 'Try searching with another keyword or reset the search filter.';
    searchNoMatch.appendChild(iconDiv);
    searchNoMatch.appendChild(h3);
    searchNoMatch.appendChild(p);
    contentEl.prepend(searchNoMatch);
  }
}

// ========== CREATE VIDEO CARD (YOUTUBE NATIVE FIDELITY) ==========
function createVideoCard(video, playlistId) {
  const isWatched = !!state.videoProgress[video.id];
  const progressSec = state.videoProgress[video.id] || 0;
  const durationSec = parseDurationToSeconds(video.duration);
  const progressPct = (progressSec > 0 && durationSec > 0)
    ? Math.min(100, Math.round((progressSec / durationSec) * 100))
    : 0;

  const card = document.createElement('a');
  card.className = `pf-video-card${isWatched ? ' watched' : ''}`;
  card.href = `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}&list=${encodeURIComponent(playlistId)}`;

  // Thumbnail Wrap
  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'pf-thumbnail-wrap';

  const img = document.createElement('img');
  img.className = 'pf-thumbnail-img';
  const rawThumb = video.thumbnail;
  img.src = (rawThumb && SecurityUtils.validateSafeUrl(rawThumb))
    ? rawThumb
    : `https://img.youtube.com/vi/${encodeURIComponent(video.id)}/mqdefault.jpg`;
  img.alt = video.title || 'Video Thumbnail';
  img.loading = 'lazy';
  img.onerror = () => {
    img.src = `https://img.youtube.com/vi/${encodeURIComponent(video.id)}/mqdefault.jpg`;
  };

  thumbWrap.appendChild(img);

  // Duration Chip
  if (video.duration) {
    const durBadge = document.createElement('span');
    durBadge.className = 'pf-duration-badge';
    durBadge.textContent = video.duration;
    thumbWrap.appendChild(durBadge);
  }

  // Progress Bar
  if (progressPct > 0) {
    const progBar = document.createElement('div');
    progBar.className = 'pf-video-progress';
    progBar.style.width = `${progressPct}%`;
    thumbWrap.appendChild(progBar);
  }

  // Watched Indicator Checkmark
  if (isWatched) {
    const checkBadge = document.createElement('div');
    checkBadge.className = 'pf-watched-indicator';
    checkBadge.textContent = '✓';
    checkBadge.title = 'Watched';
    thumbWrap.appendChild(checkBadge);
  }

  card.appendChild(thumbWrap);

  // Video Details Text
  const details = document.createElement('div');
  details.className = 'pf-video-details';

  const textWrap = document.createElement('div');
  textWrap.className = 'pf-video-text';

  const title = document.createElement('p');
  title.className = 'pf-video-title';
  title.textContent = video.title || video.id;
  title.title = video.title || video.id;

  const channel = document.createElement('p');
  channel.className = 'pf-video-channel';
  channel.textContent = video.channel || 'YouTube Video';

  textWrap.appendChild(title);
  textWrap.appendChild(channel);
  details.appendChild(textWrap);
  card.appendChild(details);

  return card;
}

// ========== WATCH PAGE SIDEBAR INJECTION ==========
async function injectPlaylistSidebar() {
  const existing = document.getElementById('pf-custom-sidebar');
  if (existing) existing.remove();

  const urlParams = new URLSearchParams(window.location.search);
  const currentVideoId = urlParams.get('v');
  const currentListId = urlParams.get('list') || 'WL';

  const waitForSecondary = () => {
    return new Promise((resolve) => {
      let tries = 0;
      const check = () => {
        const secondary = document.querySelector('#secondary #secondary-inner') || document.querySelector('#secondary');
        if (secondary) {
          resolve(secondary);
        } else if (tries < 30) {
          tries++;
          setTimeout(check, 100);
        } else {
          resolve(null);
        }
      };
      check();
    });
  };

  const secondaryContainer = await waitForSecondary();
  if (!secondaryContainer) return;

  const sidebar = document.createElement('div');
  sidebar.id = 'pf-custom-sidebar';

  if (state.enabledPlaylists.length === 0) {
    sidebar.innerHTML = `
      <div style="text-align:center;padding:16px;color:var(--pf-text-secondary);font-size:13px;">
        No playlists configured in Playlist Focus.
      </div>
    `;
    secondaryContainer.prepend(sidebar);
    return;
  }

  // --- Sidebar Header & Navigation Controls ---
  const sidebarHeader = document.createElement('div');
  sidebarHeader.className = 'pf-sidebar-header';

  const navRow = document.createElement('div');
  navRow.className = 'pf-sidebar-nav-row';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'pf-sidebar-nav-btn';
  prevBtn.textContent = '⏮️ Prev';
  prevBtn.title = 'Previous video in playlist (Alt+P)';
  prevBtn.addEventListener('click', playPreviousVideo);

  const nextBtn = document.createElement('button');
  nextBtn.className = 'pf-sidebar-nav-btn';
  nextBtn.textContent = 'Next ⏭️';
  nextBtn.title = 'Next video in playlist (Alt+N)';
  nextBtn.addEventListener('click', playNextVideo);

  navRow.appendChild(prevBtn);
  navRow.appendChild(nextBtn);
  sidebarHeader.appendChild(navRow);

  // Search Box in Sidebar
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'pf-sidebar-search-box';
  searchInput.placeholder = 'Filter sidebar playlist videos...';

  sidebarHeader.appendChild(searchInput);
  sidebar.appendChild(sidebarHeader);

  // Render Accordion Sections for Playlists (WL first)
  const accordionContainer = document.createElement('div');
  accordionContainer.id = 'pfSidebarAccordion';

  const sortedSidebarPlaylists = [...state.enabledPlaylists].sort((a, b) => {
    if (a.id === currentListId) return -1;
    if (b.id === currentListId) return 1;
    if (a.id === 'WL') return -1;
    if (b.id === 'WL') return 1;
    return 0;
  });

  for (const playlist of sortedSidebarPlaylists) {
    const isCurrent = playlist.id === currentListId;
    const isCollapsed = !isCurrent && (state.settings.collapsedPlaylists || []).includes(playlist.id);

    const section = document.createElement('div');
    section.className = `pf-sidebar-playlist-section${isCurrent ? ' current' : ''}${isCollapsed ? ' collapsed' : ''}`;
    section.dataset.playlistId = playlist.id;

    // Header
    const head = document.createElement('div');
    head.className = 'pf-sidebar-playlist-head';

    const titleEl = document.createElement('h3');
    titleEl.className = 'pf-sidebar-playlist-title';
    titleEl.textContent = `${isCollapsed ? '▸' : '▾'} ${playlist.id === 'WL' ? 'Watch Later' : (playlist.name || playlist.id)}`;

    const metaEl = document.createElement('span');
    metaEl.className = 'pf-sidebar-playlist-meta';
    metaEl.textContent = 'Loading...';

    head.appendChild(titleEl);
    head.appendChild(metaEl);

    // Items list container
    const itemsList = document.createElement('div');
    itemsList.className = 'pf-sidebar-playlist-items';

    // Toggle collapse
    head.addEventListener('click', () => {
      const nowCollapsed = section.classList.toggle('collapsed');
      titleEl.textContent = `${nowCollapsed ? '▸' : '▾'} ${playlist.id === 'WL' ? 'Watch Later' : (playlist.name || playlist.id)}`;

      if (!state.settings.collapsedPlaylists) state.settings.collapsedPlaylists = [];
      if (nowCollapsed) {
        if (!state.settings.collapsedPlaylists.includes(playlist.id)) {
          state.settings.collapsedPlaylists.push(playlist.id);
        }
      } else {
        state.settings.collapsedPlaylists = state.settings.collapsedPlaylists.filter(id => id !== playlist.id);
      }
      StorageManager.save('settings', state.settings);
    });

    section.appendChild(head);
    section.appendChild(itemsList);
    accordionContainer.appendChild(section);

    // Async Fetch & Populate
    (async () => {
      try {
        const videos = await scrapePlaylistVideos(playlist.id);
        metaEl.textContent = `${videos.length} videos`;
        itemsList.innerHTML = '';

        if (isCurrent) {
          state.currentPlaylistVideos = videos;
        }

        videos.forEach((video) => {
          const isActive = video.id === currentVideoId;
          const progressSec = state.videoProgress[video.id] || 0;
          const durationSec = parseDurationToSeconds(video.duration);
          const progressPct = (progressSec > 0 && durationSec > 0)
            ? Math.min(100, Math.round((progressSec / durationSec) * 100))
            : 0;

          const item = document.createElement('a');
          item.className = `pf-sidebar-item${isActive ? ' active' : ''}`;
          item.href = `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}&list=${encodeURIComponent(playlist.id)}`;

          const thumb = document.createElement('div');
          thumb.className = 'pf-sidebar-item-thumb';

          const img = document.createElement('img');
          const rawSideThumb = video.thumbnail;
          img.src = (rawSideThumb && SecurityUtils.validateSafeUrl(rawSideThumb))
            ? rawSideThumb
            : `https://img.youtube.com/vi/${encodeURIComponent(video.id)}/mqdefault.jpg`;
          img.alt = video.title || 'Thumbnail';
          img.loading = 'lazy';
          img.onerror = () => { img.src = `https://img.youtube.com/vi/${encodeURIComponent(video.id)}/mqdefault.jpg`; };
          thumb.appendChild(img);

          if (video.duration) {
            const dur = document.createElement('span');
            dur.className = 'pf-sidebar-item-duration';
            dur.textContent = video.duration;
            thumb.appendChild(dur);
          }

          if (progressPct > 0) {
            const prog = document.createElement('div');
            prog.className = 'pf-sidebar-item-progress';
            prog.style.width = `${progressPct}%`;
            thumb.appendChild(prog);
          }

          const details = document.createElement('div');
          details.className = 'pf-sidebar-item-details';

          const title = document.createElement('p');
          title.className = 'pf-sidebar-item-title';
          title.textContent = video.title || video.id;

          const channel = document.createElement('p');
          channel.className = 'pf-sidebar-item-channel';
          channel.textContent = video.channel || '';

          details.appendChild(title);
          details.appendChild(channel);

          item.appendChild(thumb);
          item.appendChild(details);
          itemsList.appendChild(item);

          if (isActive) {
            setTimeout(() => {
              item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }, 300);
          }
        });
      } catch (err) {
        console.warn(`Error populating sidebar playlist ${playlist.id}:`, err);
        metaEl.textContent = 'Error';
      }
    })();
  }

  // Sidebar search filter event
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    document.querySelectorAll('.pf-sidebar-item').forEach((el) => {
      const text = el.textContent.toLowerCase();
      el.style.display = text.includes(q) ? 'flex' : 'none';
    });
  });

  sidebar.appendChild(accordionContainer);
  secondaryContainer.prepend(sidebar);
}

// ========== PLAYLIST VIDEO NAVIGATION (NEXT / PREV) ==========
function playNextVideo() {
  if (!state.currentPlaylistVideos || state.currentPlaylistVideos.length === 0) return;

  const urlParams = new URLSearchParams(window.location.search);
  const currentVideoId = urlParams.get('v');
  const playlistId = urlParams.get('list') || 'WL';

  const currentIndex = state.currentPlaylistVideos.findIndex(v => v.id === currentVideoId);

  if (currentIndex === -1 || currentIndex >= state.currentPlaylistVideos.length - 1) {
    if (state.settings.loopPlaylist && state.currentPlaylistVideos.length > 0) {
      navigateToVideo(state.currentPlaylistVideos[0].id, playlistId);
    }
    return;
  }

  navigateToVideo(state.currentPlaylistVideos[currentIndex + 1].id, playlistId);
}

function playPreviousVideo() {
  if (!state.currentPlaylistVideos || state.currentPlaylistVideos.length === 0) return;

  const urlParams = new URLSearchParams(window.location.search);
  const currentVideoId = urlParams.get('v');
  const playlistId = urlParams.get('list') || 'WL';

  const currentIndex = state.currentPlaylistVideos.findIndex(v => v.id === currentVideoId);
  if (currentIndex <= 0) return;

  navigateToVideo(state.currentPlaylistVideos[currentIndex - 1].id, playlistId);
}

function navigateToVideo(videoId, playlistId) {
  if (!SecurityUtils.validateVideoId(videoId)) return;
  const listParam = playlistId ? `&list=${encodeURIComponent(playlistId)}` : '';
  window.location.href = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}${listParam}`;
}

// ========== AUTOPLAY & VIDEO PROGRESS TRACKING ==========
function setupAutoPlayAndProgress() {
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get('v');

  if (!videoId || !SecurityUtils.validateVideoId(videoId)) return;

  addToWatchHistory(videoId);

  let hasRestoredPosition = false;
  const checkVideo = setInterval(() => {
    const video = document.querySelector('video');
    if (video) {
      if (!hasRestoredPosition && state.videoProgress[videoId]) {
        const savedTime = state.videoProgress[videoId];
        if (savedTime > 5 && (!video.duration || savedTime < video.duration - 8)) {
          video.currentTime = savedTime;
        }
        hasRestoredPosition = true;
      }

      if (state.settings.defaultSpeed && state.settings.defaultSpeed !== 1) {
        video.playbackRate = state.settings.defaultSpeed;
      }

      const saveProgress = PerformanceUtils.throttle(() => {
        if (video.currentTime > 5) {
          state.videoProgress[videoId] = Math.round(video.currentTime);
          StorageManager.save('videoProgress', state.videoProgress);
        }
      }, 4000);

      video.addEventListener('timeupdate', saveProgress);

      if (state.settings.autoPlay) {
        video.addEventListener('ended', playNextVideo, { once: true });
      }

      clearInterval(checkVideo);
    }
  }, 800);
}

function addToWatchHistory(videoId) {
  state.watchHistory = state.watchHistory.filter(i => i.videoId !== videoId);
  state.watchHistory.unshift({ videoId, timestamp: Date.now() });
  state.watchHistory = state.watchHistory.slice(0, CONFIG.MAX_HISTORY);
  StorageManager.save('watchHistory', state.watchHistory);
}

// ========== KEYBOARD SHORTCUTS & EVENT LISTENERS ==========
function setupGlobalEventListeners() {
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    if (e.key === 'n' || e.key === 'N') {
      if (state.isWatchPage) { e.preventDefault(); playNextVideo(); }
    } else if (e.key === 'p' || e.key === 'P') {
      if (state.isWatchPage) { e.preventDefault(); playPreviousVideo(); }
    } else if (e.key === 'h' || e.key === 'H') {
      e.preventDefault();
      window.location.href = 'https://www.youtube.com/';
    } else if (e.key === '/') {
      e.preventDefault();
      const search = document.getElementById('pfUniversalSearch');
      if (search) search.focus();
    }
  });

  // Storage Changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;

    if (changes.enabled) {
      state.isEnabled = changes.enabled.newValue !== false;
      if (state.isEnabled) {
        window.location.reload();
      } else {
        cleanupHomePage();
        cleanupWatchPage();
      }
    }

    if (changes.playlists) {
      state.enabledPlaylists = (changes.playlists.newValue || [])
        .filter(p => p && SecurityUtils.validatePlaylistId(p.id) && p.enabled !== false);
      state.playlistCache.clear();
      if (state.isEnabled) {
        if (state.isWatchPage) injectPlaylistSidebar();
        else loadAndRenderPlaylists();
      }
    }

    if (changes.settings) {
      state.settings = { ...state.settings, ...changes.settings.newValue };
      applyTheme();
      if (state.isEnabled && !state.isWatchPage) {
        renderAllPlaylistsContent();
      }
    }
  });

  // Runtime Messages
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || typeof request !== 'object') return false;

    if (request.action === 'triggerAccountSync') {
      discoverAndSyncAccountPlaylists(true).then((synced) => {
        sendResponse({ success: true, count: synced.length, playlists: synced });
      });
      return true;
    }

    if (request.action === 'settingsUpdated') {
      StorageManager.load(['settings', 'playlists']).then((data) => {
        if (data.settings) state.settings = { ...state.settings, ...data.settings };
        if (data.playlists) {
          state.enabledPlaylists = (data.playlists || [])
            .filter(p => p && SecurityUtils.validatePlaylistId(p.id) && p.enabled !== false);
        }
        applyTheme();
        if (state.isEnabled) {
          if (state.isWatchPage) injectPlaylistSidebar();
          else loadAndRenderPlaylists();
        }
        sendResponse({ success: true });
      });
      return true;
    }

    if (request.action === 'command') {
      if (request.command === 'next-video') playNextVideo();
      else if (request.command === 'prev-video') playPreviousVideo();
      else if (request.command === 'goto-homepage') window.location.href = 'https://www.youtube.com/';
      else if (request.command === 'focus-search') document.getElementById('pfUniversalSearch')?.focus();
      sendResponse({ success: true });
      return true;
    }
  });

  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    stopVideoHiding();
    if (state.navInterval) clearInterval(state.navInterval);
  });
}

// ========== BOOTSTRAP ==========
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
