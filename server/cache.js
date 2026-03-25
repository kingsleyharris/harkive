/**
 * Simple in-memory TTL cache.
 * Keys can be invalidated manually or expire automatically.
 */
const store = {};

function get(key) {
  const entry = store[key];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { delete store[key]; return null; }
  return entry.value;
}

function set(key, value, ttlMs = 60_000) {
  store[key] = { value, expiresAt: Date.now() + ttlMs };
}

function invalidate(key) {
  delete store[key];
}

function invalidatePrefix(prefix) {
  for (const key of Object.keys(store)) {
    if (key.startsWith(prefix)) delete store[key];
  }
}

// Wrap an async function with caching
function wrap(key, ttlMs, fn) {
  return async function (...args) {
    const cacheKey = args.length ? `${key}:${JSON.stringify(args)}` : key;
    const cached = get(cacheKey);
    if (cached !== null) return cached;
    const result = await fn(...args);
    set(cacheKey, result, ttlMs);
    return result;
  };
}

module.exports = { get, set, invalidate, invalidatePrefix, wrap };
