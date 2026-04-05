const express = require('express');
const os = require('os');
const cors = require('cors');
const compression = require('compression');
const fs = require('fs');
const path = require('path');
const { Client: NotionClient } = require('@notionhq/client');
const cfg = require('./config');
const cache = require('./cache');

const app = express();
app.use(cors());
app.use(compression());
app.use(express.json());

// ── Async I/O with timeout (prevents kernel panic on hung NAS) ───────────────
const fsp = fs.promises;

function withTimeout(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('I/O timeout')), ms)),
  ]);
}

// ── Path helpers ──────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.heic', '.webp', '.tiff', '.tif',
                             '.cr2', '.cr3', '.nef', '.arw', '.dng', '.orf', '.raf']);
const BROWSER_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const VIDEO_EXTS = new Set(['.mov', '.mp4', '.m4v', '.avi']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.aiff', '.aif', '.flac', '.m4a', '.ogg']);
const DOC_EXTS = new Set(['.pdf', '.doc', '.docx', '.pages', '.xls', '.xlsx', '.numbers',
                           '.ppt', '.pptx', '.keynote', '.txt', '.md', '.epub', '.zip',
                           '.ai', '.indd', '.psd', '.csv']);

function isImage(f) { return IMAGE_EXTS.has(path.extname(f).toLowerCase()); }
function isBrowserImage(f) { return BROWSER_IMAGE_EXTS.has(path.extname(f).toLowerCase()); }
function isVideo(f) { return VIDEO_EXTS.has(path.extname(f).toLowerCase()); }
function isDoc(f) { return DOC_EXTS.has(path.extname(f).toLowerCase()); }

function safe(root, ...parts) {
  const full = path.join(root, ...parts);
  if (!full.startsWith(root)) return null;
  return full;
}

function allowedPath(fp) {
  return fp && cfg.allowedRoots.some(r => fp.startsWith(r));
}

// Check if a /Volumes mount is responsive before traversing.
// A hung SMB mount will block readdirSync indefinitely, starving the
// event loop and eventually causing a kernel watchdog reboot.
const _mountOk = {};       // path → { ok: bool, checkedAt: ms }
function isMountReady(dir) {
  const mount = dir.match(/^\/Volumes\/[^/]+/);
  if (!mount) return true;                         // local path, always fine
  const key = mount[0];
  const entry = _mountOk[key];
  if (entry && Date.now() - entry.checkedAt < 10_000) return entry.ok;  // cache 10s
  try {
    fs.accessSync(key, fs.constants.R_OK);         // fast kernel check, no traversal
    _mountOk[key] = { ok: true, checkedAt: Date.now() };
    return true;
  } catch (_) {
    _mountOk[key] = { ok: false, checkedAt: Date.now() };
    return false;
  }
}

function collectMedia(dir, depth = 0, seen) {
  if (depth > 12) return [];
  if (!seen) seen = new Set();
  if (!isMountReady(dir)) return [];               // skip hung volumes
  let real;
  try { real = fs.realpathSync(dir); } catch (_) { return []; }
  if (seen.has(real)) return [];
  seen.add(real);
  const results = [];
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) results.push(...collectMedia(full, depth + 1, seen));
      else if (isImage(e.name) || isVideo(e.name))
        results.push({ name: e.name, fullPath: full, type: isVideo(e.name) ? 'video' : 'image' });
    }
  } catch (_) {}
  return results;
}

// ── Shared image/doc/video serve ──────────────────────────────────────────────

app.get('/image', (req, res) => {
  const fp = req.query.path;
  if (!allowedPath(fp)) return res.status(403).end();
  res.sendFile(fp);
});

app.get('/cover', (req, res) => {
  const fp = req.query.path;
  if (!allowedPath(fp)) return res.status(403).end();
  res.sendFile(fp);
});

// ── Photos ────────────────────────────────────────────────────────────────────

app.get('/years', (req, res) => {
  if (!cfg.photos) return res.json([]);
  const cached = cache.get('years');
  if (cached) return res.json(cached);
  try {
    const years = fs.readdirSync(cfg.photos, { withFileTypes: true })
      .filter(e => e.isDirectory() && /^\d{4}$/.test(e.name))
      .map(e => e.name).sort().reverse();
    cache.set('years', years, 300_000);
    res.json(years);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/years/:year', (req, res) => {
  if (!cfg.photos) return res.json([]);
  const key = `year:${req.params.year}`;
  const cached = cache.get(key);
  if (cached) return res.json(cached);
  const yearPath = path.join(cfg.photos, req.params.year);
  try {
    const events = fs.readdirSync(yearPath, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => {
        const eventPath = path.join(yearPath, e.name);
        const files = collectMedia(eventPath);
        const cover = files.find(f => isBrowserImage(f.name));
        return { name: e.name, count: files.length, cover: cover?.name || null, coverPath: cover?.fullPath || null };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    cache.set(key, events, 300_000);
    res.json(events);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/years/:year/:event', (req, res) => {
  if (!cfg.photos) return res.json([]);
  const eventPath = path.join(cfg.photos, req.params.year, req.params.event);
  try {
    const files = collectMedia(eventPath).map(f => ({
      name: f.name, fullPath: f.fullPath, type: f.type,
      displayable: isBrowserImage(f.name) || isVideo(f.name),
    }));
    res.json(files);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Documents ─────────────────────────────────────────────────────────────────

app.get('/docs', (req, res) => {
  if (!cfg.docs) return res.json([]);
  try {
    const cats = fs.readdirSync(cfg.docs, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => {
        const catPath = path.join(cfg.docs, e.name);
        const count = fs.readdirSync(catPath).filter(f => !f.startsWith('.')).length;
        return { name: e.name, count };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(cats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/docs/:category', (req, res) => {
  if (!cfg.docs) return res.json([]);
  const catPath = safe(cfg.docs, req.params.category);
  if (!catPath) return res.status(403).end();
  try {
    const files = [];
    function walk(dir, rel, depth = 0) {
      if (depth > 12) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue;
        const fullPath = path.join(dir, e.name);
        const relPath = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(fullPath, relPath, depth + 1);
        else if (isDoc(e.name)) {
          const stat = fs.statSync(fullPath);
          files.push({ name: e.name, path: relPath, ext: path.extname(e.name).slice(1), size: stat.size, modified: stat.mtime });
        }
      }
    }
    walk(catPath, '');
    files.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    res.json(files);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/doc/:category', (req, res) => {
  if (!cfg.docs) return res.status(404).end();
  const filePath = safe(cfg.docs, req.params.category, req.query.file || '');
  if (!filePath) return res.status(403).end();
  res.sendFile(filePath);
});

// ── Projects ──────────────────────────────────────────────────────────────────

app.get('/projects/app-screens', (req, res) => {
  if (!cfg.appScreens.length) return res.json([]);
  const folders = [];
  for (const dir of cfg.appScreens) {
    try {
      const label = path.basename(dir);
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const rootImages = entries.filter(e => e.isFile() && isBrowserImage(e.name));
      if (rootImages.length) folders.push({ label, name: label, dir, count: rootImages.length, cover: path.join(dir, rootImages[0].name) });
      for (const e of entries.filter(e => e.isDirectory() && !e.name.startsWith('.'))) {
        const subDir = path.join(dir, e.name);
        const files = collectMedia(subDir).filter(f => isBrowserImage(f.name));
        if (files.length) folders.push({ label: e.name, name: e.name, dir: subDir, count: files.length, cover: files[0].fullPath });
      }
    } catch (_) {}
  }
  res.json(folders);
});

app.get('/projects/app-screens/files', (req, res) => {
  const dir = req.query.dir;
  if (!dir || !cfg.appScreens.some(d => dir.startsWith(d))) return res.status(403).end();
  try {
    const files = collectMedia(dir).filter(f => isBrowserImage(f.name)).map(f => ({ name: f.name, fullPath: f.fullPath }));
    res.json(files);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/projects/music', (req, res) => {
  if (!cfg.music.length) return res.json([]);
  const tracks = [];
  function walkAudio(dir, rel, depth = 0) {
    if (depth > 12) return;
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walkAudio(full, e.name, depth + 1);
        else if (AUDIO_EXTS.has(path.extname(e.name).toLowerCase())) {
          const stat = fs.statSync(full);
          tracks.push({ name: e.name, fullPath: full, artist: rel || '', ext: path.extname(e.name).slice(1), size: stat.size });
        }
      }
    } catch (_) {}
  }
  for (const dir of cfg.music) walkAudio(dir, '');
  const seen = new Set();
  res.json(tracks.filter(t => { if (seen.has(t.fullPath)) return false; seen.add(t.fullPath); return true; }));
});

app.get('/project-image', (req, res) => {
  const fp = req.query.path;
  if (!allowedPath(fp)) return res.status(403).end();
  res.sendFile(fp);
});

app.get('/project-audio', (req, res) => {
  const fp = req.query.path;
  if (!allowedPath(fp)) return res.status(403).end();
  res.sendFile(fp);
});

// ── Search ────────────────────────────────────────────────────────────────────

app.get('/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json({ events: [], docs: [] });

  const events = [];
  if (cfg.photos) {
    try {
      const years = fs.readdirSync(cfg.photos, { withFileTypes: true })
        .filter(e => e.isDirectory() && /^\d{4}$/.test(e.name)).map(e => e.name);
      for (const year of years) {
        const yearPath = path.join(cfg.photos, year);
        for (const e of fs.readdirSync(yearPath, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.'))) {
          const label = e.name.replace(/^\d{4}-?\d{0,2}_?/, '').replace(/-/g, ' ').toLowerCase();
          if (label.includes(q) || e.name.toLowerCase().includes(q) || year.includes(q)) {
            const eventPath = path.join(yearPath, e.name);
            const files = fs.readdirSync(eventPath).filter(f => isImage(f) || isVideo(f));
            events.push({ year, name: e.name, count: files.length, cover: files.find(f => isImage(f)) || null });
          }
        }
      }
    } catch (_) {}
  }

  const docs = [];
  if (cfg.docs) {
    try {
      function walkDocs(dir, cat, rel, depth = 0) {
        if (depth > 12) return;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.name.startsWith('.')) continue;
          const fullPath = path.join(dir, e.name);
          const relPath = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) walkDocs(fullPath, cat, relPath, depth + 1);
          else if (isDoc(e.name) && e.name.toLowerCase().includes(q)) {
            const stat = fs.statSync(fullPath);
            docs.push({ category: cat, name: e.name, path: relPath, ext: path.extname(e.name).slice(1), size: stat.size, modified: stat.mtime });
          }
        }
      }
      for (const c of fs.readdirSync(cfg.docs, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.')))
        walkDocs(path.join(cfg.docs, c.name), c.name, '');
    } catch (_) {}
  }

  res.json({ events, docs });
});

// ── Shots (Mobbin-style flat browser) ────────────────────────────────────────

let _tagsCache = null;
function loadTags() {
  if (_tagsCache) return _tagsCache;
  try { _tagsCache = JSON.parse(fs.readFileSync(cfg.tagsFile, 'utf8')); } catch (_) { _tagsCache = {}; }
  return _tagsCache;
}

// Watch tags file — invalidate caches whenever tagger writes new tags
// Debounced: macOS fs.watch fires multiple times per write
let _watchDebounce = null;
try {
  fs.watch(cfg.tagsFile, () => {
    clearTimeout(_watchDebounce);
    _watchDebounce = setTimeout(() => {
      _tagsCache = null;
      cache.invalidate('shots');
      cache.invalidate('shots-progress');
    }, 1000);
  });
} catch (_) {}

app.get('/shots/tags-progress', (req, res) => {
  const cached = cache.get('shots-progress');
  if (cached) return res.json(cached);
  const tags = loadTags();
  const vals = Object.values(tags);
  const result = { tagged: vals.filter(t => !t.error).length, errors: vals.filter(t => t.error).length, total: vals.length };
  cache.set('shots-progress', result, 4_000); // 4s TTL — matches poll interval
  res.json(result);
});

function buildShots() {
  if (!cfg.shots.length) return [];
  const tags = loadTags();
  const all = [];
  for (const root of cfg.shots) {
    try {
      for (const e of fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.'))) {
        const dir = path.join(root, e.name);
        for (const f of collectMedia(dir).filter(f => isBrowserImage(f.name))) {
          const dateMatch = f.name.match(/(\d{4}-\d{2}-\d{2})/);
          const tag = tags[f.fullPath] || {};
          all.push({
            name: f.name, fullPath: f.fullPath, source: e.name, label: e.name,
            date: dateMatch ? dateMatch[1] : null,
            platform: tag.platform || null, patterns: tag.patterns || [],
            components: tag.components || [], era: tag.era || null, desc: tag.desc || null,
          });
        }
      }
      for (const e of fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isFile() && isBrowserImage(e.name))) {
        const fullPath = path.join(root, e.name);
        const dateMatch = e.name.match(/(\d{4}-\d{2}-\d{2})/);
        const tag = tags[fullPath] || {};
        all.push({
          name: e.name, fullPath, source: path.basename(root), label: path.basename(root),
          date: dateMatch ? dateMatch[1] : null,
          platform: tag.platform || null, patterns: tag.patterns || [],
          components: tag.components || [], era: tag.era || null, desc: tag.desc || null,
        });
      }
    } catch (_) {}
  }
  const seen = new Set();
  return all
    .filter(f => { if (seen.has(f.fullPath)) return false; seen.add(f.fullPath); return true; })
    .sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      if (a.date) return -1; if (b.date) return 1;
      return a.name.localeCompare(b.name);
    });
}

app.get('/shots', (req, res) => {
  const cached = cache.get('shots');
  if (cached) return res.json(cached);
  const result = buildShots();
  cache.set('shots', result, 300_000); // 5 min TTL — invalidated by fs.watch on tags file
  res.json(result);
});

// ── Screenshots ────────────────────────────────────────────────────────────────

app.get('/screenshots', (req, res) => {
  if (!cfg.shots.length) return res.json([]);
  const map = {};
  for (const root of cfg.shots) {
    try {
      for (const e of fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.'))) {
        const dir = path.join(root, e.name);
        const files = collectMedia(dir).filter(f => isBrowserImage(f.name));
        if (!files.length) continue;
        if (!map[e.name]) map[e.name] = { label: e.name, dirs: [], count: 0, cover: files[0].fullPath };
        map[e.name].dirs.push(dir);
        map[e.name].count += files.length;
      }
    } catch (_) {}
  }
  res.json(Object.values(map));
});

app.get('/screenshots/files', (req, res) => {
  const dirs = (req.query.dirs || req.query.dir || '').split(',').filter(Boolean);
  if (!dirs.length || !dirs.every(d => cfg.shots.some(r => d.startsWith(r)))) return res.status(403).end();
  try {
    const all = [];
    for (const dir of dirs) {
      all.push(...collectMedia(dir).filter(f => isBrowserImage(f.name))
        .map(f => ({ name: f.name, fullPath: f.fullPath, type: 'image', displayable: true })));
    }
    all.sort((a, b) => a.name.localeCompare(b.name));
    const seen = new Set();
    res.json(all.filter(f => { if (seen.has(f.name)) return false; seen.add(f.name); return true; }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Archive ────────────────────────────────────────────────────────────────────

app.get('/archive', (req, res) => {
  if (!cfg.archive) return res.json([]);
  const cached = cache.get('archive');
  if (cached) return res.json(cached);
  const albums = [];
  try {
    for (const section of fs.readdirSync(cfg.archive, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.'))) {
      const sectionPath = path.join(cfg.archive, section.name);
      const subEntries = fs.readdirSync(sectionPath, { withFileTypes: true }).filter(e => !e.name.startsWith('.'));
      const subDirs = subEntries.filter(e => e.isDirectory());
      if (subDirs.length > 0) {
        for (const sub of subDirs) {
          const subPath = path.join(sectionPath, sub.name);
          const files = collectMedia(subPath).filter(f => isBrowserImage(f.name));
          if (files.length) albums.push({ label: sub.name, dir: subPath, count: files.length, cover: files[0].fullPath, section: section.name });
        }
        const rootImgs = subEntries.filter(e => e.isFile() && isBrowserImage(e.name));
        if (rootImgs.length) albums.push({ label: section.name, dir: sectionPath, count: rootImgs.length, cover: path.join(sectionPath, rootImgs[0].name), section: section.name });
      } else {
        const files = collectMedia(sectionPath).filter(f => isBrowserImage(f.name));
        if (files.length) albums.push({ label: section.name, dir: sectionPath, count: files.length, cover: files[0].fullPath, section: section.name });
      }
    }
  } catch (err) { return res.status(500).json({ error: err.message }); }
  cache.set('archive', albums, 300_000);
  res.json(albums);
});

app.get('/archive/files', (req, res) => {
  const dir = req.query.dir;
  if (!dir || !cfg.archive || !dir.startsWith(cfg.archive)) return res.status(403).end();
  try {
    const files = collectMedia(dir).map(f => ({ name: f.name, fullPath: f.fullPath, type: f.type, displayable: isBrowserImage(f.name) || isVideo(f.name) }));
    res.json(files);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Studio (Ableton) ──────────────────────────────────────────────────────────

function scanAbletonRoot(root) {
  const results = [];
  try {
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(root, e.name);
      if (!e.isDirectory()) {
        if (path.extname(e.name).toLowerCase() === '.als') results.push({ name: e.name, fullPath: full, projectDir: root });
      } else if (/ Project$/i.test(e.name)) {
        const als = fs.readdirSync(full, { withFileTypes: true })
          .filter(x => !x.name.startsWith('.') && x.isFile() && path.extname(x.name).toLowerCase() === '.als')
          .map(x => ({ name: x.name, fullPath: path.join(full, x.name), projectDir: full }));
        results.push(...als);
      } else {
        try {
          for (const s of fs.readdirSync(full, { withFileTypes: true })) {
            if (s.name.startsWith('.')) continue;
            const sfull = path.join(full, s.name);
            if (!s.isDirectory()) {
              if (path.extname(s.name).toLowerCase() === '.als') results.push({ name: s.name, fullPath: sfull, projectDir: full });
            } else if (/ Project$/i.test(s.name)) {
              const als = fs.readdirSync(sfull, { withFileTypes: true })
                .filter(x => !x.name.startsWith('.') && x.isFile() && path.extname(x.name).toLowerCase() === '.als')
                .map(x => ({ name: x.name, fullPath: path.join(sfull, x.name), projectDir: sfull }));
              results.push(...als);
            }
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
  return results;
}

app.get('/studio/albums', (req, res) => {
  if (!cfg.studio) return res.json([]);
  const cached = cache.get('studio');
  if (cached) return res.json(cached);
  const map = {};
  for (const t of scanAbletonRoot(cfg.studio)) {
    const dirName = path.basename(t.projectDir);
    let name = dirName.replace(/\s*Project$/i, '').replace(/-\d+\s*$/, '').trim();
    if (t.projectDir === cfg.studio) name = 'Misc';
    const parts = path.relative(cfg.studio, t.projectDir).split(path.sep);
    if (parts.length >= 2) name = parts[1].replace(/\s*Project$/i, '').trim();
    if (!map[name]) map[name] = { name, tracks: [] };
    map[name].tracks.push({ name: t.name.replace(/\.als$/i, ''), fullPath: t.fullPath });
  }
  const albums = Object.values(map).filter(a => a.tracks.length > 0)
    .map(a => ({ name: a.name, trackCount: a.tracks.length, tracks: a.tracks }))
    .sort((a, b) => a.name.localeCompare(b.name));
  cache.set('studio', albums, 300_000);
  res.json(albums);
});

// ── Videos ────────────────────────────────────────────────────────────────────

app.get('/videos', (req, res) => {
  if (!cfg.videos) return res.json([]);
  const files = [];
  function walkVideo(dir, depth = 0) {
    if (depth > 12) return;
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walkVideo(full, depth + 1);
        else if (isVideo(e.name)) {
          const stat = fs.statSync(full);
          files.push({ name: e.name, fullPath: full, ext: path.extname(e.name).slice(1), size: stat.size });
        }
      }
    } catch (_) {}
  }
  walkVideo(cfg.videos);
  res.json(files);
});

app.get('/video', (req, res) => {
  const fp = req.query.path;
  if (!fp || !cfg.videos || !fp.startsWith(cfg.videos)) return res.status(403).end();
  res.sendFile(fp);
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

app.get('/dashboard', (req, res) => {
  const stats = {};

  if (cfg.photos) {
    try {
      const yearDirs = fs.readdirSync(cfg.photos, { withFileTypes: true }).filter(e => e.isDirectory() && /^\d{4}$/.test(e.name));
      stats.photoYears = yearDirs.length;
      stats.photoEvents = yearDirs.reduce((sum, e) => {
        try { return sum + fs.readdirSync(path.join(cfg.photos, e.name), { withFileTypes: true }).filter(x => x.isDirectory() && !x.name.startsWith('.')).length; }
        catch (_) { return sum; }
      }, 0);
    } catch (_) { stats.photoYears = 0; stats.photoEvents = 0; }
  } else { stats.photoYears = 0; stats.photoEvents = 0; }

  if (cfg.docs) {
    try { stats.docCategories = fs.readdirSync(cfg.docs, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.')).length; }
    catch (_) { stats.docCategories = 0; }
  } else { stats.docCategories = 0; }

  if (cfg.archive) {
    try {
      let archiveAlbums = 0;
      for (const s of fs.readdirSync(cfg.archive, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.'))) {
        const subs = fs.readdirSync(path.join(cfg.archive, s.name), { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.'));
        archiveAlbums += subs.length || 1;
      }
      stats.archiveAlbums = archiveAlbums;
    } catch (_) { stats.archiveAlbums = 0; }
  } else { stats.archiveAlbums = 0; }

  if (cfg.studio) {
    try {
      const als = scanAbletonRoot(cfg.studio);
      stats.studioProjects = new Set(als.map(f => f.projectDir)).size;
      stats.studioTracks = als.length;
    } catch (_) { stats.studioProjects = 0; stats.studioTracks = 0; }
  } else { stats.studioProjects = 0; stats.studioTracks = 0; }

  if (cfg.videos) {
    try {
      let videoCount = 0;
      function countVideos(dir, depth = 0) { if (depth > 12) return; try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.isDirectory() && !e.name.startsWith('.')) countVideos(path.join(dir, e.name), depth + 1); else if (isVideo(e.name)) videoCount++; } } catch (_) {} }
      countVideos(cfg.videos);
      stats.videos = videoCount;
    } catch (_) { stats.videos = 0; }
  } else { stats.videos = 0; }

  stats.dropboxFolders = 0; stats.dropboxFiles = 0; // populated async via /dropbox

  if (cfg.shots.length) {
    try {
      const years = new Set();
      let shotCount = 0;
      for (const root of cfg.shots) {
        function countShots(dir) {
          try {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
              if (e.isDirectory() && !e.name.startsWith('.')) {
                countShots(path.join(dir, e.name));
              } else if (isBrowserImage(e.name)) {
                shotCount++;
                const m = e.name.match(/(\d{4})/);
                if (m) years.add(m[1]);
              }
            }
          } catch (_) {}
        }
        countShots(root);
      }
      stats.shotYears = years.size;
      stats.shotCount = shotCount;
    } catch (_) { stats.shotYears = 0; stats.shotCount = 0; }
  } else { stats.shotYears = 0; stats.shotCount = 0; }

  try {
    const yt = readYT();
    stats.youtubeVideos = yt.length;
  } catch (_) { stats.youtubeVideos = 0; }

  res.json(stats);
});

// ── Notion ────────────────────────────────────────────────────────────────────

const notion = cfg.notionToken ? new NotionClient({ auth: cfg.notionToken }) : null;

function notionCheck(res) {
  if (!notion) { res.status(503).json({ error: 'NOTION_TOKEN not set' }); return false; }
  return true;
}

function richText(arr) { return (arr || []).map(t => t.plain_text).join(''); }

app.get('/notion/token-check', (req, res) => { res.json({ configured: !!notion }); });

app.get('/notion/pages', async (req, res) => {
  if (!notionCheck(res)) return;
  try {
    const results = [];
    let cursor;
    do {
      const r = await notion.search({ filter: { property: 'object', value: 'page' }, page_size: 100, start_cursor: cursor });
      results.push(...r.results);
      cursor = r.has_more ? r.next_cursor : null;
    } while (cursor);
    res.json(results.map(p => ({
      id: p.id,
      title: p.properties?.title ? richText(p.properties.title.title) : p.properties?.Name ? richText(p.properties.Name.title) : 'Untitled',
      url: p.url, icon: p.icon?.emoji || null, lastEdited: p.last_edited_time, parent: p.parent,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/notion/databases', async (req, res) => {
  if (!notionCheck(res)) return;
  try {
    const r = await notion.search({ filter: { property: 'object', value: 'database' }, page_size: 100 });
    res.json(r.results.map(d => ({ id: d.id, title: richText(d.title), url: d.url, icon: d.icon?.emoji || null, lastEdited: d.last_edited_time })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/notion/page/:id', async (req, res) => {
  if (!notionCheck(res)) return;
  try {
    const [page, blocksResp] = await Promise.all([
      notion.pages.retrieve({ page_id: req.params.id }),
      notion.blocks.children.list({ block_id: req.params.id, page_size: 100 }),
    ]);
    const title = page.properties?.title ? richText(page.properties.title.title) : page.properties?.Name ? richText(page.properties.Name.title) : 'Untitled';
    res.json({ id: page.id, title, icon: page.icon?.emoji || null, url: page.url, blocks: blocksResp.results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Fetch all image blocks from a page (paginated)
app.get('/notion/page-images/:id', async (req, res) => {
  if (!notionCheck(res)) return;
  try {
    const images = [];
    let cursor;
    do {
      const r = await notion.blocks.children.list({ block_id: req.params.id, page_size: 100, start_cursor: cursor });
      for (const b of r.results) {
        if (b.type === 'image') {
          const src = b.image?.file?.url || b.image?.external?.url || null;
          if (src) images.push({ id: b.id, url: `/notion/proxy?url=${encodeURIComponent(src)}`, caption: (b.image?.caption || []).map(t => t.plain_text).join('') });
        }
      }
      cursor = r.has_more ? r.next_cursor : null;
    } while (cursor);
    res.json(images);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Proxy Notion signed image URLs (they expire, can't be used directly from browser)
const https = require('https');
app.get('/notion/proxy', (req, res) => {
  const url = req.query.url;
  if (!url || !url.startsWith('https://')) return res.status(400).end();
  https.get(url, (upstream) => {
    if (upstream.statusCode >= 400) return res.status(upstream.statusCode).end();
    res.set('Content-Type', upstream.headers['content-type'] || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=300');
    upstream.pipe(res);
  }).on('error', (err) => res.status(500).json({ error: err.message }));
});

app.get('/notion/db/:id', async (req, res) => {
  if (!notionCheck(res)) return;
  try {
    const r = await notion.databases.query({ database_id: req.params.id, page_size: 100 });
    const rows = r.results.map(p => {
      const props = {};
      for (const [k, v] of Object.entries(p.properties || {})) {
        if (v.type === 'title') props[k] = richText(v.title);
        else if (v.type === 'rich_text') props[k] = richText(v.rich_text);
        else if (v.type === 'select') props[k] = v.select?.name || null;
        else if (v.type === 'multi_select') props[k] = v.multi_select.map(s => s.name);
        else if (v.type === 'date') props[k] = v.date?.start || null;
        else if (v.type === 'checkbox') props[k] = v.checkbox;
        else if (v.type === 'number') props[k] = v.number;
        else if (v.type === 'url') props[k] = v.url;
        else props[k] = null;
      }
      return { id: p.id, icon: p.icon?.emoji || null, url: p.url, lastEdited: p.last_edited_time, properties: props };
    });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────

// ── Dropbox OAuth + API ───────────────────────────────────────────────────────

const DBX_REDIRECT = 'http://localhost:3001/dropbox/auth/callback';
const DBX_TOKEN_FILE = path.join(os.homedir(), '.harkive', 'dropbox-tokens.json');

// In-memory token state
let dbxTokens = { accessToken: cfg.dropboxToken || null, refreshToken: null };
try {
  const saved = JSON.parse(fs.readFileSync(DBX_TOKEN_FILE, 'utf8'));
  if (saved.refreshToken) dbxTokens = saved;
} catch (_) {}

function saveDbxTokens() {
  try {
    fs.mkdirSync(path.dirname(DBX_TOKEN_FILE), { recursive: true });
    fs.writeFileSync(DBX_TOKEN_FILE, JSON.stringify(dbxTokens));
  } catch (_) {}
}

function httpsPost(hostname, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request({ hostname, path: urlPath, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(data) } }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function dbxRefresh() {
  if (!cfg.dropboxAppKey || !cfg.dropboxAppSecret || !dbxTokens.refreshToken) return false;
  const r = await httpsPost('api.dropbox.com', '/oauth2/token',
    { 'Content-Type': 'application/x-www-form-urlencoded' },
    `grant_type=refresh_token&refresh_token=${encodeURIComponent(dbxTokens.refreshToken)}&client_id=${cfg.dropboxAppKey}&client_secret=${cfg.dropboxAppSecret}`
  );
  if (r.body.access_token) {
    dbxTokens.accessToken = r.body.access_token;
    saveDbxTokens();
    return true;
  }
  return false;
}

function dbxConfigured() {
  return !!(dbxTokens.accessToken || dbxTokens.refreshToken);
}

async function dbxPost(endpoint, body) {
  if (!dbxTokens.accessToken && dbxTokens.refreshToken) await dbxRefresh();
  const doCall = (token) => httpsPost('api.dropboxapi.com', `/2/${endpoint}`,
    { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body
  );
  let r = await doCall(dbxTokens.accessToken);
  if (r.status === 401 && await dbxRefresh()) r = await doCall(dbxTokens.accessToken);
  return r.body;
}

function dbxEntry(e) {
  const ext = path.extname(e.name).toLowerCase();
  if (e['.tag'] === 'folder') return { name: e.name, fullPath: e.path_lower, count: 0, isFolder: true };
  const type = IMAGE_EXTS.has(ext) ? 'image' : VIDEO_EXTS.has(ext) ? 'video' : AUDIO_EXTS.has(ext) ? 'audio' : DOC_EXTS.has(ext) ? 'doc' : 'other';
  return { name: e.name, fullPath: e.path_lower, ext: ext.slice(1), size: e.size || 0, modified: e.server_modified || null, type, displayable: BROWSER_IMAGE_EXTS.has(ext) };
}

async function dbxList(folderPath) {
  let result = await dbxPost('files/list_folder', { path: folderPath, limit: 2000 });
  if (!result.entries) throw new Error(result.error_summary || JSON.stringify(result));
  let entries = [...result.entries];
  while (result.has_more) {
    result = await dbxPost('files/list_folder/continue', { cursor: result.cursor });
    entries.push(...result.entries);
  }
  const folders = entries.filter(e => e['.tag'] === 'folder').map(dbxEntry).sort((a, b) => a.name.localeCompare(b.name));
  const files   = entries.filter(e => e['.tag'] === 'file').map(dbxEntry).sort((a, b) => new Date(b.modified) - new Date(a.modified));
  return { folders, files };
}

// OAuth routes
app.get('/dropbox/auth', (req, res) => {
  if (!cfg.dropboxAppKey) return res.status(503).send('Add dropboxAppKey to harkive.config.js');
  const url = `https://www.dropbox.com/oauth2/authorize?client_id=${cfg.dropboxAppKey}&response_type=code&redirect_uri=${encodeURIComponent(DBX_REDIRECT)}&token_access_type=offline`;
  res.redirect(url);
});

app.get('/dropbox/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');
  try {
    const r = await httpsPost('api.dropbox.com', '/oauth2/token',
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      `code=${encodeURIComponent(code)}&grant_type=authorization_code&redirect_uri=${encodeURIComponent(DBX_REDIRECT)}&client_id=${cfg.dropboxAppKey}&client_secret=${cfg.dropboxAppSecret}`
    );
    if (!r.body.access_token) return res.status(400).send(JSON.stringify(r.body));
    dbxTokens = { accessToken: r.body.access_token, refreshToken: r.body.refresh_token };
    saveDbxTokens();
    res.send('<h2>Dropbox connected!</h2><p>You can close this tab and go back to Harkive.</p><script>window.close()</script>');
  } catch (err) { res.status(500).send(err.message); }
});

// API routes
app.get('/dropbox', async (req, res) => {
  if (!dbxConfigured()) return res.json({ folders: [], files: [], configured: false });
  try { res.json({ ...(await dbxList('')), configured: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/dropbox/browse', async (req, res) => {
  if (!dbxConfigured()) return res.status(503).json({ error: 'Dropbox not configured' });
  try { res.json(await dbxList(req.query.path || '')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/dropbox/file', async (req, res) => {
  if (!dbxConfigured() || !req.query.path) return res.status(403).end();
  if (!dbxTokens.accessToken) await dbxRefresh();
  const apiReq = https.request({
    hostname: 'content.dropboxapi.com',
    path: '/2/files/download',
    method: 'POST',
    headers: { Authorization: `Bearer ${dbxTokens.accessToken}`, 'Dropbox-API-Arg': JSON.stringify({ path: req.query.path }) },
  }, upstream => {
    if (upstream.statusCode >= 400) return res.status(upstream.statusCode).end();
    res.set('Content-Type', upstream.headers['content-type'] || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=3600');
    upstream.pipe(res);
  });
  apiReq.on('error', err => res.status(500).json({ error: err.message }));
  apiReq.end();
});

// ── Knowledge ─────────────────────────────────────────────────────────────────

const KNOWLEDGE_FILE = path.join(os.homedir(), '.harkive', 'knowledge.json');

function readKnowledge() {
  try { return JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, 'utf8')); } catch (_) { return []; }
}

function writeKnowledge(items) {
  fs.mkdirSync(path.dirname(KNOWLEDGE_FILE), { recursive: true });
  fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(items, null, 2));
}

app.get('/knowledge', (req, res) => {
  res.json(readKnowledge());
});

app.post('/knowledge', (req, res) => {
  const { title, source, path: itemPath, tags, notes } = req.body || {};
  if (!source || !itemPath) return res.status(400).json({ error: 'source and path required' });
  const items = readKnowledge();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const item = { id, title: title || itemPath.split('/').pop(), source, path: itemPath, tags: tags || [], notes: notes || '', addedAt: new Date().toISOString() };
  items.unshift(item);
  writeKnowledge(items);
  res.json(item);
});

app.delete('/knowledge/:id', (req, res) => {
  const items = readKnowledge().filter(i => i.id !== req.params.id);
  writeKnowledge(items);
  res.json({ ok: true });
});

// ── YouTube History ───────────────────────────────────────────────────────────

const YT_FILE = path.join(os.homedir(), '.harkive', 'youtube-history.json');

function readYT() {
  try { return JSON.parse(fs.readFileSync(YT_FILE, 'utf8')); } catch (_) { return []; }
}

// POST /youtube/ingest  { filePath: '/path/to/watch-history.json' }
app.post('/youtube/ingest', (req, res) => {
  const { filePath } = req.body || {};
  if (!filePath) return res.status(400).json({ error: 'filePath required' });
  const src = filePath.replace(/^~/, os.homedir());
  let raw;
  try { raw = JSON.parse(fs.readFileSync(src, 'utf8')); }
  catch (e) { return res.status(400).json({ error: `Cannot read file: ${e.message}` }); }

  const entries = [];
  for (const item of raw) {
    // Skip non-watch entries (channel visits, searches, etc.)
    if (!item.titleUrl || !item.titleUrl.includes('watch?v=')) continue;
    const videoId = new URL(item.titleUrl).searchParams.get('v');
    if (!videoId) continue;
    const title = (item.title || '').replace(/^Watched\s+/i, '').trim();
    const channel = item.subtitles?.[0]?.name || null;
    const channelUrl = item.subtitles?.[0]?.url || null;
    entries.push({ videoId, title, channel, channelUrl, watchedAt: item.time });
  }

  fs.mkdirSync(path.dirname(YT_FILE), { recursive: true });
  fs.writeFileSync(YT_FILE, JSON.stringify(entries, null, 2));
  res.json({ ok: true, total: entries.length });
});

// GET /youtube?q=&channel=&from=&to=&limit=&offset=
app.get('/youtube', (req, res) => {
  const all = readYT();
  if (!all.length) return res.json({ entries: [], total: 0, channels: [] });

  const { q, channel, from, to } = req.query;
  const limit  = Math.min(parseInt(req.query.limit)  || 100, 500);
  const offset = parseInt(req.query.offset) || 0;

  let entries = all;
  if (q)       { const lq = q.toLowerCase(); entries = entries.filter(e => e.title.toLowerCase().includes(lq) || (e.channel || '').toLowerCase().includes(lq)); }
  if (channel) { entries = entries.filter(e => e.channel === channel); }
  if (from)    { entries = entries.filter(e => e.watchedAt >= from); }
  if (to)      { entries = entries.filter(e => e.watchedAt <= to); }

  // Top channels from full filtered set
  const channelCounts = {};
  entries.forEach(e => { if (e.channel) channelCounts[e.channel] = (channelCounts[e.channel] || 0) + 1; });
  const channels = Object.entries(channelCounts).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([name, count]) => ({ name, count }));

  res.json({ entries: entries.slice(offset, offset + limit), total: entries.length, channels });
});

// GET /youtube/stats
app.get('/youtube/stats', (req, res) => {
  const all = readYT();
  if (!all.length) return res.json({ total: 0 });
  const channelCounts = {};
  all.forEach(e => { if (e.channel) channelCounts[e.channel] = (channelCounts[e.channel] || 0) + 1; });
  const topChannel = Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0];
  const earliest = all[all.length - 1]?.watchedAt?.slice(0, 4);
  const latest   = all[0]?.watchedAt?.slice(0, 4);
  res.json({ total: all.length, topChannel: topChannel?.[0], topChannelCount: topChannel?.[1], earliest, latest });
});

// ── Health & NAS ──────────────────────────────────────────────────────────────

const { execFile } = require('child_process');

// Returns mount status for each configured section
app.get('/health', (req, res) => {
  function reachable(p) {
    if (!p) return null;
    try { fs.accessSync(p, fs.constants.R_OK); return true; } catch (_) { return false; }
  }
  res.json({
    photos:  reachable(cfg.photos),
    docs:    reachable(cfg.docs),
    archive: reachable(cfg.archive),
    studio:  reachable(cfg.studio),
    videos:  reachable(cfg.videos),
    dropbox: !!cfg.dropboxToken,
    shots:   cfg.shots.map(p => ({ path: p, ok: reachable(p) })),
    nas:     cfg.nas?.shares || [],
  });
});

// Trigger macOS to mount each NAS share via open(1)
app.post('/nas/connect', (req, res) => {
  const shares = cfg.nas?.shares || [];
  if (!shares.length) return res.json({ ok: true, shares: [] });
  let pending = shares.length;
  const results = [];
  for (const share of shares) {
    execFile('open', [share], (err) => {
      results.push({ share, err: err?.message || null });
      if (--pending === 0) res.json({ ok: true, results });
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Harkive server on http://localhost:${PORT}`);
  // Pre-warm shots cache in background so first request is instant
  if (cfg.shots.length) setImmediate(() => { cache.set('shots', buildShots(), 300_000); });
});
