import { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';

const PAGE_SIZE = 100;

function fmt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function groupByDate(entries) {
  const groups = [];
  let current = null;
  for (const e of entries) {
    const day = e.watchedAt ? e.watchedAt.slice(0, 10) : 'Unknown';
    if (!current || current.day !== day) {
      current = { day, label: fmt(day), entries: [] };
      groups.push(current);
    }
    current.entries.push(e);
  }
  return groups;
}

export default function YoutubeBrowser() {
  const [data, setData]           = useState(null);
  const [search, setSearch]       = useState('');
  const [channel, setChannel]     = useState('');
  const [visibleCount, setVisible] = useState(PAGE_SIZE);
  const [uploading, setUploading] = useState(false);
  const [ingestMsg, setIngestMsg] = useState('');
  const sentinelRef               = useRef(null);
  const fileRef                   = useRef(null);
  const deferredSearch            = useDeferredValue(search);

  function load(q = '', ch = '') {
    const params = new URLSearchParams();
    if (q)  params.set('q', q);
    if (ch) params.set('channel', ch);
    params.set('limit', 5000);
    fetch(`/youtube?${params}`).then(r => r.json()).then(setData);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    load(deferredSearch, channel);
    setVisible(PAGE_SIZE);
  }, [deferredSearch, channel]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setVisible(n => n + PAGE_SIZE);
    }, { rootMargin: '400px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [data]);

  async function ingest(filePath) {
    setUploading(true);
    setIngestMsg('Ingesting…');
    try {
      const r = await fetch('/youtube/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      }).then(r => r.json());
      if (r.ok) {
        setIngestMsg(`Imported ${r.total.toLocaleString()} videos`);
        load();
      } else {
        setIngestMsg(r.error || 'Failed');
      }
    } catch (e) {
      setIngestMsg(e.message);
    }
    setUploading(false);
  }

  const visible = useMemo(() => (data?.entries || []).slice(0, visibleCount), [data, visibleCount]);
  const groups  = useMemo(() => groupByDate(visible), [visible]);

  const isEmpty = data && data.total === 0 && !search && !channel;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4 }}>YouTube</span>
        {data && (
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {data.total.toLocaleString()}{(search || channel) ? ` of ${data.total.toLocaleString()}` : ''} videos
          </span>
        )}
      </div>

      {/* Ingest bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          ref={fileRef}
          type="text"
          placeholder="Path to watch-history.json (e.g. ~/Desktop/watch-history.json)"
          style={{
            flex: 1, minWidth: 260, padding: '6px 10px', border: '1px solid var(--border)',
            borderRadius: 6, background: 'var(--surface)', color: 'var(--text)',
            fontSize: 12, fontFamily: 'var(--font)', outline: 'none',
          }}
          onKeyDown={e => e.key === 'Enter' && ingest(e.target.value)}
        />
        <button
          className="shot-chip active"
          style={{ flexShrink: 0 }}
          disabled={uploading}
          onClick={() => fileRef.current && ingest(fileRef.current.value)}
        >
          {uploading ? 'Importing…' : 'Import'}
        </button>
        {ingestMsg && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{ingestMsg}</span>}
      </div>

      {isEmpty && (
        <div className="empty-state">
          No history yet. Export from takeout.google.com → YouTube → History, then import above.
        </div>
      )}

      {!isEmpty && data && (
        <>
          {/* Search + channel filter */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: 13 }}>⌕</span>
              <input
                type="text"
                placeholder="Search videos…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', padding: '6px 10px 6px 26px', border: '1px solid var(--border)',
                  borderRadius: 6, background: 'var(--surface)', color: 'var(--text)',
                  fontSize: 12, fontFamily: 'var(--font)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <select
              value={channel}
              onChange={e => setChannel(e.target.value)}
              style={{
                padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
                background: 'var(--surface)', color: channel ? 'var(--text)' : 'var(--text-tertiary)',
                fontSize: 12, fontFamily: 'var(--font)', outline: 'none', maxWidth: 220,
              }}
            >
              <option value="">All channels</option>
              {(data.channels || []).map(c => (
                <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
              ))}
            </select>
            {(search || channel) && (
              <button className="shots-clear" onClick={() => { setSearch(''); setChannel(''); }}>Clear</button>
            )}
          </div>

          {/* Results grouped by day */}
          {groups.length === 0 && <div className="empty-state">No videos match.</div>}
          {groups.map(group => (
            <div key={group.day} style={{ marginBottom: 20 }}>
              <div className="section-heading" style={{ marginBottom: 6 }}>{group.label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {group.entries.map(e => (
                  <a
                    key={e.videoId + e.watchedAt}
                    href={`https://www.youtube.com/watch?v=${e.videoId}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 10px', borderRadius: 5, textDecoration: 'none',
                      color: 'var(--text)', background: 'var(--surface)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
                  >
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>▶</span>
                    <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.title}
                    </span>
                    {e.channel && (
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.channel}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          ))}

          {visibleCount < data.total && (
            <div ref={sentinelRef} style={{ height: 1 }} />
          )}
        </>
      )}
    </div>
  );
}
