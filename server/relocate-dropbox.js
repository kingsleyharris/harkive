#!/usr/bin/env node
/**
 * relocate-dropbox.js
 * Downloads every file from Dropbox to a local destination folder,
 * preserving folder structure, then deletes from Dropbox.
 *
 * Safe: only deletes from Dropbox after local file is verified.
 * Resume-friendly: skips files already present at the destination.
 *
 * Usage:
 *   node server/relocate-dropbox.js /path/to/dest            # move everything
 *   node server/relocate-dropbox.js /path/to/dest --dry-run  # preview only
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

const DRY_RUN  = process.argv.includes('--dry-run');
const DEST     = process.argv.find(a => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]);
const TOKEN_FILE = path.join(os.homedir(), '.harkive', 'dropbox-tokens.json');

if (!DEST) {
  console.error('Usage: node server/relocate-dropbox.js /path/to/destination [--dry-run]');
  process.exit(1);
}

// ── Load tokens ───────────────────────────────────────────────────────────────

let tokens;
try {
  tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
} catch (_) {
  console.error('No tokens found. Run the app and authorize via /dropbox/auth first.');
  process.exit(1);
}

if (!fs.existsSync(DEST)) {
  console.error(`Destination not found: ${DEST}\nMake sure the volume is mounted.`);
  process.exit(1);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

const cfg = (() => { try { return require(path.join(__dirname, '..', 'harkive.config.js')); } catch (_) { return {}; } })();

async function refreshToken() {
  if (!cfg.dropboxAppKey || !cfg.dropboxAppSecret || !tokens.refreshToken) return false;
  const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(tokens.refreshToken)}&client_id=${cfg.dropboxAppKey}&client_secret=${cfg.dropboxAppSecret}`;
  const r = await post('api.dropbox.com', '/oauth2/token', { 'Content-Type': 'application/x-www-form-urlencoded' }, body);
  if (r.access_token) {
    tokens.accessToken = r.access_token;
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens));
    return true;
  }
  return false;
}

function post(hostname, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request({
      hostname, path: urlPath, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { resolve(buf); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function dbx(endpoint, body) {
  let r = await post('api.dropboxapi.com', `/2/${endpoint}`,
    { Authorization: `Bearer ${tokens.accessToken}`, 'Content-Type': 'application/json' }, body);
  if (r.error && r.error['.tag'] === 'invalid_access_token') {
    await refreshToken();
    r = await post('api.dropboxapi.com', `/2/${endpoint}`,
      { Authorization: `Bearer ${tokens.accessToken}`, 'Content-Type': 'application/json' }, body);
  }
  return r;
}

// ── List all files recursively ────────────────────────────────────────────────

async function listAll() {
  const files = [];
  async function walk(folderPath) {
    let r = await dbx('files/list_folder', { path: folderPath, recursive: false, limit: 2000 });
    if (!r.entries) throw new Error(r.error_summary || JSON.stringify(r));
    for (const e of r.entries) {
      if (e['.tag'] === 'file') files.push({ path: e.path_lower, display: e.path_display, size: e.size });
      if (e['.tag'] === 'folder') await walk(e.path_lower);
    }
    while (r.has_more) {
      r = await dbx('files/list_folder/continue', { cursor: r.cursor });
      for (const e of r.entries) {
        if (e['.tag'] === 'file') files.push({ path: e.path_lower, display: e.path_display, size: e.size });
        if (e['.tag'] === 'folder') await walk(e.path_lower);
      }
    }
  }
  await walk('');
  return files;
}

// ── Download a single file ────────────────────────────────────────────────────

function download(dropboxPath, destPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const tmp = destPath + '.part';
    const out = fs.createWriteStream(tmp);
    const req = https.request({
      hostname: 'content.dropboxapi.com',
      path: '/2/files/download',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({ path: dropboxPath }),
      },
    }, res => {
      if (res.statusCode === 401) { out.close(); fs.unlinkSync(tmp); return reject(new Error('401')); }
      if (res.statusCode >= 400) { out.close(); fs.unlinkSync(tmp); return reject(new Error(`HTTP ${res.statusCode}`)); }
      res.pipe(out);
      out.on('finish', () => { fs.renameSync(tmp, destPath); resolve(); });
      out.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmt(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)}GB`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}Scanning Dropbox…\n`);
  const files = await listAll();
  console.log(`Found ${files.length} files.\n`);

  let skipped = 0, moved = 0, failed = 0;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const destPath = path.join(DEST, f.display);
    const prefix = `[${i + 1}/${files.length}]`;

    if (fs.existsSync(destPath)) {
      console.log(`${prefix} SKIP  ${f.display}`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`${prefix} WOULD MOVE  ${f.display}  (${fmt(f.size)})`);
      moved++;
      continue;
    }

    process.stdout.write(`${prefix} ↓ ${f.display}  (${fmt(f.size)})… `);
    try {
      await download(f.path, destPath);
      // Verify file exists and is non-empty
      const stat = fs.statSync(destPath);
      if (stat.size === 0 && f.size > 0) throw new Error('empty file');

      // Delete from Dropbox
      await dbx('files/delete_v2', { path: f.path });
      console.log('✓');
      moved++;
    } catch (err) {
      console.log(`✗ ${err.message}`);
      // Clean up partial download
      const tmp = destPath + '.part';
      if (fs.existsSync(tmp)) try { fs.unlinkSync(tmp); } catch (_) {}
      failed++;
    }
  }

  console.log(`\n─────────────────────────────`);
  console.log(`Moved:   ${moved}`);
  console.log(`Skipped: ${skipped} (already at destination)`);
  if (failed) console.log(`Failed:  ${failed} (still in Dropbox)`);
  console.log(`─────────────────────────────\n`);

  if (!DRY_RUN && moved > 0) {
    console.log(`Files saved to: ${DEST}`);
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
