/**
 * Config loader — reads harkive.config.js from project root.
 * Falls back to empty/null values so the server starts without crashing.
 */
const path = require('path');
const os = require('os');

function expand(p) {
  if (!p) return null;
  return p.replace(/^~/, os.homedir());
}

function expandArr(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(expand).filter(Boolean);
}

let raw = {};
try {
  raw = require(path.join(__dirname, '..', 'harkive.config.js'));
} catch (_) {
  // No config found — server will run with empty sections
}

const cfg = {
  photos:     expand(raw.photos)     || null,
  docs:       expand(raw.docs)       || null,
  archive:    expand(raw.archive)    || null,
  studio:     expand(raw.studio)     || null,
  videos:     expand(raw.videos)     || null,
  shots:      expandArr(raw.shots),
  tagsFile:   expand(raw.tagsFile)   || path.join(os.homedir(), '.harkive', 'shots-tags.json'),
  appScreens: expandArr(raw.appScreens),
  music:      expandArr(raw.music),
  notionToken: raw.notionToken || process.env.NOTION_TOKEN || null,
  nas: raw.nas || { shares: [] },
};

// All configured roots — used for security checks on /image requests
cfg.allowedRoots = [
  cfg.photos, cfg.docs, cfg.archive, cfg.studio, cfg.videos,
  ...cfg.shots, ...cfg.appScreens, ...cfg.music,
  path.join(os.homedir(), '.harkive'),
].filter(Boolean);

module.exports = cfg;
