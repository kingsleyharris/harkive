#!/usr/bin/env node
// Vision tagger — runs Claude Haiku on all shots, saves tags to JSON index
// Usage: ANTHROPIC_API_KEY=sk-... node tagger.js
// Resumes from where it left off if interrupted.

const fs = require('fs');
const path = require('path');
const os = require('os');
const Anthropic = require('@anthropic-ai/sdk');
const sharp = require('sharp');
const cfg = require('./config');

const TAGS_FILE = cfg.tagsFile;
const CONCURRENCY = 3;
const MAX_BYTES = 4.5 * 1024 * 1024; // 4.5MB — stay under 5MB API limit
const BROWSER_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

const SCREENSHOTS_ROOTS = cfg.shots;

const client = new Anthropic();

const PROMPT = `Look at this screenshot and respond with JSON only, no markdown, no explanation.
Return exactly this shape:
{
  "platform": "ios" | "android" | "web" | "desktop" | "other",
  "patterns": array of 1-3 from ["feed","card","detail","modal","onboarding","settings","profile","search","empty-state","navigation","form","auth","map","dashboard","notification","media","commerce","messaging","typography","illustration","other"],
  "era": "early" | "mid" | "recent",
  "desc": "10 words max describing what this screen shows"
}
era guide: early = pre-2015 style, mid = 2015-2020, recent = 2020+`;

function collectImages(root) {
  const results = [];
  function walk(dir) {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (BROWSER_EXTS.has(path.extname(e.name).toLowerCase())) results.push(full);
      }
    } catch (_) {}
  }
  walk(root);
  return results;
}

async function tagImage(imgPath) {
  const ext = path.extname(imgPath).toLowerCase().replace('.', '');
  let mediaType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : ext === 'png' ? 'image/png'
    : ext === 'gif' ? 'image/gif'
    : ext === 'webp' ? 'image/webp'
    : 'image/jpeg';

  let data = fs.readFileSync(imgPath);
  // Resize if over API limit
  if (data.length > MAX_BYTES) {
    data = await sharp(data)
      .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    mediaType = 'image/jpeg';
  }
  const b64 = data.toString('base64');

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
        { type: 'text', text: PROMPT },
      ],
    }],
  });

  const text = msg.content[0].text.trim();
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from response
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { platform: 'other', patterns: ['other'], era: 'mid', desc: '' };
  }
}

async function run() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Set ANTHROPIC_API_KEY env var');
    process.exit(1);
  }

  if (!SCREENSHOTS_ROOTS.length) { console.error('No shots paths configured in harkive.config.js'); process.exit(1); }

  // Ensure tags directory exists
  fs.mkdirSync(path.dirname(TAGS_FILE), { recursive: true });

  // Load existing tags
  let tags = {};
  if (fs.existsSync(TAGS_FILE)) {
    try { tags = JSON.parse(fs.readFileSync(TAGS_FILE, 'utf8')); } catch (_) {}
  }

  // Collect all images
  const all = [];
  for (const root of SCREENSHOTS_ROOTS) all.push(...collectImages(root));

  const todo = all.filter(p => !tags[p]);
  const total = all.length;
  const done = total - todo.length;
  console.log(`Total: ${total} | Already tagged: ${done} | To do: ${todo.length}`);

  if (todo.length === 0) { console.log('All done!'); return; }

  let processed = 0;
  let errors = 0;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(async (p) => {
      try {
        const tag = await tagImage(p);
        tags[p] = tag;
        return p;
      } catch (err) {
        errors++;
        tags[p] = { platform: 'other', patterns: ['other'], era: 'mid', desc: '', error: err.message };
        return p;
      }
    }));

    processed += batch.length;
    const pct = Math.round(((done + processed) / total) * 100);
    process.stdout.write(`\r[${done + processed}/${total}] ${pct}% — errors: ${errors}   `);

    // Save every 50 images
    if (processed % 50 === 0) {
      fs.writeFileSync(TAGS_FILE, JSON.stringify(tags, null, 2));
    }

    // Delay to stay under token rate limits
    if (i + CONCURRENCY < todo.length) await new Promise(r => setTimeout(r, 800));
  }

  fs.writeFileSync(TAGS_FILE, JSON.stringify(tags, null, 2));
  console.log(`\nDone. Tagged ${processed} images. Errors: ${errors}`);
  console.log(`Saved to ${TAGS_FILE}`);
}

run().catch(console.error);
