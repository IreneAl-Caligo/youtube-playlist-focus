# YouTube Playlist Focus — User & Troubleshooting Guide 📖

## Quick Start Guide

### Step 1: Loading the Extension
1. Open Chrome and navigate to `chrome://extensions/`.
2. Turn on **Developer mode** in the upper right corner.
3. Click the **Load unpacked** button.
4. Browse to and select the `Youtube-playlist-focus-final` folder.
5. The extension will appear with the red play icon ▶️.

---

### Step 2: Adding & Managing Playlists
1. Click the **YouTube Playlist Focus** extension icon in your browser toolbar.
2. You will see preset buttons:
   * **🕒 + Watch Later**: Adds your default YouTube Watch Later playlist (`WL`).
   * **🔄 Auto-Sync All Account Playlists**: Automatically imports all playlists from your YouTube account.
   * **➕ + Custom**: Paste any playlist link (e.g., `https://www.youtube.com/playlist?list=PLxyz...`).
3. You can give custom names to any playlist (e.g. "Full Stack Web Development") by clicking the ✏️ edit icon.
4. You can reorder or toggle playlists on/off without removing them.

---

### Step 3: Enjoying the Focused Homepage
1. Open `https://www.youtube.com/`.
2. Notice how all distraction feeds, recommended reels/shorts, and homepage clickbait are replaced by your clean playlist shelves.
3. Use the search bar at the top (`/` shortcut) to instantly search for any video across all your playlists.
4. Switch between **Grid**, **List**, and **Compact** view modes using the buttons in the top right.

---

### Step 4: Watching Videos Without Distraction
1. Click any video from your playlist.
2. When playing on the watch page, YouTube's native recommendations sidebar is replaced with your focused playlist sidebar.
3. Use the `⏮️ Prev` and `Next ⏭️` buttons (or shortcuts `P` and `N`) to step through videos.
4. When you finish a video, the extension will automatically start the next video in the playlist (if auto-play is enabled).

---

## ⚙️ Settings Reference

| Setting | Options | Description |
| :--- | :--- | :--- |
| **Theme** | Auto / Dark / Light | Matches YouTube's theme or forces dark/light styling. |
| **Auto-play Next** | Enabled / Disabled | Automatically advances to the next playlist video when finished. |
| **Loop Playlist** | Enabled / Disabled | Loops back to the first video when the playlist completes. |
| **Default Speed** | 1.0x to 2.0x | Sets your preferred playback speed across all playlist videos. |
| **View Mode** | Grid / List / Compact | Sets how video cards are laid out on the homepage. |
| **Export/Import** | JSON backup | Safely back up or migrate all playlists and settings. |

---

## ❓ Frequently Asked Questions (FAQ)

#### Q: How do I temporary disable the extension to see regular YouTube?
**A:** Open the extension popup or click the green **"🟢 Focus ON"** button in the homepage header to toggle it off. YouTube will return to standard mode instantly.

#### Q: Will this slow down YouTube?
**A:** No. YouTube Playlist Focus uses debounced rendering, lazy thumbnail loading, memory-safe observers, and lightweight in-memory caching for zero lag.

#### Q: Are private playlists supported?
**A:** "Watch Later" (`WL`) and all your private, unlisted, and custom account playlists are fully supported while logged in on YouTube.
