# YouTube Playlist Focus — Final Edition (v2.2.0) 🚀

A sleek, high-performance, distraction-free Chrome extension that transforms YouTube into a focused learning & productivity environment.

---

## 🌟 Visual Layout Hierarchy (Homepage)

The extension renders YouTube in this layout:

```text
┌─────────────────────────────────────────────────────────────┐
│  ▶ Playlist Focus    [🔄 Sync Playlists]  [View]  [Focus ON] │
├─────────────────────────────────────────────────────────────┤
│  🔍 Search all playlists and videos...                      │
├─────────────────────────────────────────────────────────────┤
│  [All] [Unwatched Only] [Filter]                            │
├─────────────────────────────────────────────────────────────┤
│  🕒 Watch Later  (📹 15 videos • ⏱️ 2h 40m • ✅ 4 watched) │
│  [ Video Card 1 ]  [ Video Card 2 ]  [ Video Card 3 ] ...   │
├─────────────────────────────────────────────────────────────┤
│  📺 Your Account Playlists (from /feed/playlists)            │
│  ├─ Playlist 1 (Web Dev) (📹 15 videos • ⏱️ 2h 40m • ✅ 4 watched)
│  [ Video Card 1 ]  [ Video Card 2 ]  [ Video Card 3 ] ...   │
│  ├─ Playlist 2 (Machine Learning) (📹 15 videos • ⏱️ 2h 40m • ✅ 4 watched)
│  [ Video Card 1 ]  [ Video Card 2 ]  [ Video Card 3 ] ...   │
│  └─ Playlist 3 (Lectures)... (📹 15 videos • ⏱️ 2h 40m • ✅ 4 watched)
│  [ Video Card 1 ]  [ Video Card 2 ]  [ Video Card 3 ] ...   │
└─────────────────────────────────────────────────────────────┘
```

1. **Header Navigation**: Focus Logo (`▶ Playlist Focus`), `[🔄 Sync Playlists]`, `[View ▾]` layout dropdown (`⊞ Grid`, `▶ Shelf`, `☰ List`, `⊟ Compact`), and `[🟢 Focus ON]` master toggle.
2. **Universal Search Bar**: Fast, real-time debounced search across all playlists and videos.
3. **Filter Row**: Clean 3-button controls: `[All]`, `[Unwatched Only]`, and `[Filter ▾]` (with dropdown options for `< 10 mins`, `10 - 30 mins`, `> 30 mins`, Title sort, and Duration sort).
4. **🕒 Watch Later**: Displayed as the primary top playlist with duration (`⏱️ 2h 40m`), video count, and progress bar.
5. **📺 Your Account Playlists (from `/feed/playlists`)**: Hierarchical tree-style listing (`├─ `, `└─ `) with playlist stats and video cards.

---

## 🌟 Core Features

### 1. 🛑 Distraction-Free Homepage & Watch Page
* Completely removes clickbait algorithmic recommendations, Shorts, explore, and notification feeds.
* Replaces the watch page recommendation sidebar with your focused playlist sidebar (with previous/next controls, active video highlight, and auto-scroll).

### 2. 🔄 Auto-Sync All Account Playlists
* Automatically scans and imports your playlists directly from `https://www.youtube.com/feed/playlists`.
* No need to copy-paste URLs manually — one click on **"🔄 Sync Account Playlists"** loads your entire library.
* Completely removed distracting Liked Videos feed as requested.

### 3. 📊 Playlist Analytics & Progress Tracking
* Computes and displays exact playlist analytics:
  * Total video count: `📹 24 videos`
  * Total length / duration: `⏱️ 3 hr 45 min`
  * Watched count & percentage: `✅ 6 watched (25%)`
* Visual completion progress bar for each playlist section.
* Remembers video resume positions (>5s) and marks watched videos with `✓`.

### 4. 🎨 100% Native YouTube UI Fidelity
* Designed with YouTube's exact color palette, tokens, typography (`Roboto, YouTube Sans`), duration badges, and border radiuses.
* Automatically syncs with YouTube's Dark and Light modes.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Alt+N` or `N` | Play Next Video in playlist |
| `Alt+P` or `P` | Play Previous Video in playlist |
| `Alt+H` or `H` | Return to Playlist Focus Homepage |
| `Alt+Shift+F` or `/` | Focus Universal Search Bar |

---

## 🛠️ Installation (Load Unpacked)

1. Open Google Chrome (or any Chromium browser: Brave, Edge, Opera).
2. Go to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top right corner).
4. Click **Load unpacked** (top left).
5. Select this folder: `Youtube-playlist-focus-final`.
6. Open [youtube.com](https://www.youtube.com/) and enjoy your clean, focused playlist dashboard!
