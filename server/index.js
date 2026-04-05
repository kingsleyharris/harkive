const express = require('express');
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

function collectMedia(dir) {
  const results = [];
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) results.push(...collectMedia(full));
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
    function walk(dir, rel) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue;
        const fullPath = path.join(dir, e.name);
        const relPath = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(fullPath, relPath);
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
  function walkAudio(dir, rel) {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walkAudio(full, e.name);
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
      function walkDocs(dir, cat, rel) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.name.startsWith('.')) continue;
          const fullPath = path.join(dir, e.name);
          const relPath = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) walkDocs(fullPath, cat, relPath);
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
try {
  fs.watch(cfg.tagsFile, () => {
    _tagsCache = null;
    cache.invalidate('shots');
    cache.invalidate('shots-progress');
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
  function walkVideo(dir) {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walkVideo(full);
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
      function countVideos(dir) { try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.isDirectory() && !e.name.startsWith('.')) countVideos(path.join(dir, e.name)); else if (isVideo(e.name)) videoCount++; } } catch (_) {} }
      countVideos(cfg.videos);
      stats.videos = videoCount;
    } catch (_) { stats.videos = 0; }
  } else { stats.videos = 0; }

  if (cfg.dropbox) {
    try {
      const entries = fs.readdirSync(cfg.dropbox, { withFileTypes: true }).filter(e => !e.name.startsWith('.'));
      stats.dropboxFolders = entries.filter(e => e.isDirectory()).length;
      stats.dropboxFiles   = entries.filter(e => e.isFile()).length;
    } catch (_) { stats.dropboxFolders = 0; stats.dropboxFiles = 0; }
  } else { stats.dropboxFolders = 0; stats.dropboxFiles = 0; }

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

// ── Dropbox ───────────────────────────────────────────────────────────────────

function listDropboxDir(dir) {
  const folders = [], files = [];
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      const ext = path.extname(e.name).toLowerCase();
      if (e.isDirectory()) {
        let count = 0;
        try { count = fs.readdirSync(full).filter(f => !f.startsWith('.')).length; } catch (_) {}
        folders.push({ name: e.name, fullPath: full, count });
      } else {
        let stat = null;
        try { stat = fs.statSync(full); } catch (_) {}
        const type = IMAGE_EXTS.has(ext) ? 'image' : VIDEO_EXTS.has(ext) ? 'video' : AUDIO_EXTS.has(ext) ? 'audio' : DOC_EXTS.has(ext) ? 'doc' : 'other';
        files.push({ name: e.name, fullPath: full, ext: ext.slice(1), size: stat?.size || 0, modified: stat?.mtime || null, type, displayable: isBrowserImage(e.name) });
      }
    }
  } catch (_) {}
  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => new Date(b.modified) - new Date(a.modified));
  return { folders, files };
}

app.get('/dropbox', (req, res) => {
  if (!cfg.dropbox) return res.json({ folders: [], files: [], configured: false });
  const result = listDropboxDir(cfg.dropbox);
  res.json({ ...result, configured: true });
});

app.get('/dropbox/browse', (req, res) => {
  if (!cfg.dropbox) return res.status(503).json({ error: 'Dropbox not configured' });
  const rel = (req.query.path || '').replace(/^\/+/, '');
  const target = rel ? path.join(cfg.dropbox, rel) : cfg.dropbox;
  if (!target.startsWith(cfg.dropbox)) return res.status(403).end();
  const result = listDropboxDir(target);
  res.json(result);
});

app.get('/dropbox/file', (req, res) => {
  const fp = req.query.path;
  if (!cfg.dropbox || !fp || !fp.startsWith(cfg.dropbox)) return res.status(403).end();
  res.sendFile(fp);
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
    dropbox: reachable(cfg.dropbox),
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
