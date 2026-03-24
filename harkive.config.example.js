/**
 * Harkive Configuration
 * ---------------------
 * Copy this file to harkive.config.js and fill in your paths.
 * All paths support ~ for home directory.
 * Set any section to null to disable it.
 */

module.exports = {
  // ── Photos ────────────────────────────────────────────────────────────────
  // Folder organized as photos/<year>/<event>/<files>
  // e.g. ~/Pictures/2023/2023-06_Tokyo/IMG_001.jpg
  photos: '~/Pictures',

  // ── Documents ─────────────────────────────────────────────────────────────
  // Folder organized as docs/<category>/<files>
  docs: '~/Documents',

  // ── Archive ───────────────────────────────────────────────────────────────
  // Older photo collections, scans, exports. Organized as:
  // archive/<section>/<album>/<files>
  // e.g. archive/flickr/my-trip-2009/photo.jpg
  archive: null,

  // ── Studio ────────────────────────────────────────────────────────────────
  // Root folder containing Ableton Live Project folders
  // e.g. ~/Music/Ableton/My Album Project/My Album.als
  studio: null,

  // ── Videos ────────────────────────────────────────────────────────────────
  // Folder containing video files (scanned recursively)
  videos: null,

  // ── Shots (UI Screenshot Browser) ────────────────────────────────────────
  // Array of folders containing screenshot collections.
  // Each subfolder becomes a "source" in the Shots browser.
  // e.g. ~/Screenshots/inspiration/app1.png
  shots: [
    // '~/Screenshots',
  ],

  // Where to save the AI vision tags JSON (created automatically)
  tagsFile: '~/.harkive/shots-tags.json',

  // ── Projects ──────────────────────────────────────────────────────────────
  // Folders containing design/app screenshots (shows in Projects tab)
  appScreens: [],

  // Folders containing audio/music files (shows in Projects > Music tab)
  music: [],

  // ── Notion (optional) ─────────────────────────────────────────────────────
  // Set NOTION_TOKEN in your environment or .env file.
  // Get a token at https://www.notion.so/my-integrations
  notionToken: process.env.NOTION_TOKEN || null,
};
