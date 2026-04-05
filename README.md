# Harkive

A personal media archive browser for your Mac. Browse photos, documents, videos, screenshots, Ableton projects, and Notion — all in one place, all local.

![Harkive screenshot](docs/screenshot.png)

## What it shows

| Tab | What it browses |
|-----|-----------------|
| **Home** | Stats dashboard across all sections |
| **Photos** | Year → event → photo grid |
| **Archive** | Older collections (Flickr exports, scans, etc.) |
| **Studio** | Ableton Live projects, grouped by album |
| **Videos** | All video files, inline player |
| **Shots** | UI screenshot library (Mobbin-style), AI-tagged by pattern/platform |
| **Notion** | Live Notion workspace browser |
| **Documents** | PDFs, docs, keynotes organized by category |
| **Projects** | App design screens and music files |
| **Dropbox** | Full Dropbox account browser — folders, images, docs |

## Requirements

- **Node.js** 18+ and **npm**
- macOS 12+
- Xcode 15+ (only if building the menu bar app)
- `ANTHROPIC_API_KEY` (optional — only needed for AI vision tagging of screenshots)
- `NOTION_TOKEN` (optional — only needed for the Notion tab)

## Setup

```bash
# 1. Clone
git clone https://github.com/yourname/harkive.git
cd harkive

# 2. Install server dependencies
cd server && npm install && cd ..

# 3. Install client dependencies
cd client && npm install && cd ..

# 4. Configure your paths
cp harkive.config.example.js harkive.config.js
# Edit harkive.config.js — point each section to your folders
```

### harkive.config.js

```js
module.exports = {
  photos:  '~/Pictures',          // year/event/files structure
  docs:    '~/Documents',         // category/files structure
  archive: '~/Pictures/_archive', // section/album/files (optional)
  studio:  null,                  // Ableton root (optional)
  videos:  null,                  // videos folder (optional)
  shots:   ['~/Screenshots'],     // UI screenshot folders (optional)
  tagsFile: '~/.harkive/shots-tags.json',
  appScreens: [],
  music: [],
  notionToken: process.env.NOTION_TOKEN || null,
  dropboxAppKey:    'your_app_key',    // from dropbox.com/developers
  dropboxAppSecret: 'your_app_secret',
};
```

Set any section to `null` to hide that tab.

## Launch

```bash
./launch.sh
```

Opens at `http://localhost:5173`. Press `Ctrl+C` to stop both servers.

### Environment variables (optional)

Create a `.env` file in the project root:

```
NOTION_TOKEN=secret_xxx
ANTHROPIC_API_KEY=sk-ant-xxx
```

## Dropbox

1. Go to [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) → create a Scoped app with Full Dropbox access
2. Under **Permissions**, enable `files.metadata.read` and `files.content.read`
3. Under **OAuth 2 → Redirect URIs**, add `http://localhost:3001/dropbox/auth/callback`
4. Copy your **App key** and **App secret** into `harkive.config.js`
5. Launch the app, then visit `http://localhost:3001/dropbox/auth` once to authorize
6. Tokens are saved to `~/.harkive/dropbox-tokens.json` and refresh automatically

> **Note:** `/dropbox` must be present in `client/vite.config.js` proxy config — it's already included, but if you ever see "not configured" in the Dropbox tab, check the proxy first.

## AI Vision Tagging (Shots tab)

The Shots tab works without tagging, but tagging unlocks Pattern and Platform filter chips. To tag all screenshots:

```bash
ANTHROPIC_API_KEY=sk-ant-xxx node server/tagger.js
```

- Resumes automatically if interrupted
- Tags saved to `tagsFile` path in your config
- Uses Claude Haiku — costs roughly $0.002 per 1000 images

## Menu Bar App

Build the native macOS menu bar launcher:

```bash
cd menubar/HarkiveBar
xcodebuild -project HarkiveBar.xcodeproj -scheme HarkiveBar -configuration Release -derivedDataPath build
cp -R build/Build/Products/Release/HarkiveBar.app /Applications/
open /Applications/HarkiveBar.app
```

- Left-click: open Harkive in browser
- Right-click: Start / Stop / Quit menu
- Add to **System Settings → General → Login Items** to auto-start

## Folder structure conventions

**Photos**
```
photos/
  2023/
    2023-06_Tokyo/
      IMG_001.jpg
  2022/
    ...
```

**Shots (UI screenshots)**
```
shots/
  inspiration/
    airbnb-home.png
  ios-apps/
    maps-dark.png
```

**Archive**
```
archive/
  flickr/
    my-trip-2009/
      photo.jpg
  iphone-backups/
    ...
```

## License

MIT
