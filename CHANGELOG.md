# Changelog — YouTube Playlist Focus Final Edition

## [2.2.0] - 2026-10-10 — Resilient Account Playlist Sync & Watch History Removal

### 🚀 Enhancements & Fixes
1. **Watch History Removed**:
   - Completely removed "Watch History" shelf from the UI per user request for absolute distraction-free focus.
   - Cleaned up all related styles and layout elements.
2. **Multi-Source Resilient Playlist Sync (`/feed/playlists`)**:
   - Resolved the issue where account playlists from `https://www.youtube.com/feed/playlists` failed to show on startup.
   - Implemented `extractAllJsonFromHtml` with balanced-brace parsing to inspect all `ytInitialData` candidates, preventing early termination on stub context objects.
   - Added support for YouTube's modern `lockupViewModel`, `compactPlaylistRenderer`, `gridPlaylistRenderer`, and `guideEntryRenderer`.
   - Added regex fallback for URL-encoded and JSON-escaped IDs (`contentId`, `browseId: VLPL...`, `\u0026list=`).
   - Integrated immediate DOM & script tag inspection on page load, two-stage auto-sync (startup + delayed hydration at 2500ms), and guide hydration `MutationObserver`.
3. **Distraction-Free Account Playlists Tree**:
   - Displayed all account playlists directly beneath Watch Later using the requested `├─ ` and `└─ ` tree layout.
   - Liked Videos (`LL`) permanently excluded.

## [2.1.0] - 2026-10-10 — Complete Refactor & Ultimate Upgrade

### 🚀 Major Feature Additions & Upgrades
1. **Watch Later Integration**:
   - Built-in one-click support for YouTube's system Watch Later playlist (`WL`).
   - Pre-seeds "Watch Later" on first install so new users have a ready-to-use homepage immediately.
2. **Universal Navigation Search**:
   - High-performance, debounced real-time search across all enabled playlists.
   - Filter chips: Unwatched only, duration buckets (<10m, 10-30m, >30m), title sort, duration sort.
   - Integrated secondary search bar inside the watch page sidebar.
3. **Exact Playlist Analytics & Duration Computation**:
   - Accurately computes and formats total hours, minutes, and seconds across all playlist videos.
   - Dynamic progress percentage bar for each playlist section.
   - Per-video watch tracking, resume positions, and watched checkmark indicators.
4. **Native YouTube UI Fidelity**:
   - 100% matched to native YouTube dark & light themes, CSS custom properties, and fonts (`Roboto, YouTube Sans`).
   - 16:9 thumbnail ratios with rounded borders, duration badges, and progress bars.
   - Seamless watch page layout replacing distracting recommendations while keeping comments and player intact.
5. **Keyboard Commands**:
   - Full keyboard shortcuts (`Alt+N`/`N` for Next, `Alt+P`/`P` for Prev, `Alt+H`/`H` for Homepage, `Alt+Shift+F`/`/` for Search).

### 🐛 Bug Fixes & Security Hardening (CVE / CWE Cleared)
- **Syntax Error Fix**: Resolved image source typo in `content.js` (`img.src = ...;g`g`;` -> `img.src = ...;`).
- **XSS Prevention (CWE-79)**: Completely eliminated vulnerable `innerHTML` with unsanitized inputs; migrated to safe DOM element creation.
- **Memory Leak Fix (CWE-400)**: Cleaned up long-lived intervals and `MutationObserver` instances during YouTube Single-Page App (SPA) navigations and beforeunload.
- **Storage Quota Safety**: Added automatic truncation and compaction for large `videoProgress` maps to avoid `MAX_WRITE_OPERATIONS_PER_MINUTE` / size errors in `chrome.storage.sync`.
- **Soft Updates**: Upgraded settings and playlist changes to message-passing (`settingsUpdated`), eliminating annoying page reloads during video playback.
