import { useState, useEffect, useMemo, useCallback } from 'react';
import LightBox from './LightBox';

const SOURCE_LABELS = {
  'team-patches': 'Team Patches', 'goals': 'Goals', 'q2': 'Q2',
  'screenshots': 'Screenshots', 'concepts-to-design': 'Concepts to Design',
  'goals-h2': 'Goals H2', '_Screenshots (1)': 'Archive', '_screenshots': 'Misc Shots',
  'FROM_DVD': 'From DVD', 'Inspiration': 'Inspiration', 'iphone': 'iPhone',
  'Screenshots': 'Screenshots',
};

const PATTERN_LABELS = {
  feed: 'Feed', card: 'Card', detail: 'Detail', modal: 'Modal',
  onboarding: 'Onboarding', settings: 'Settings', profile: 'Profile',
  search: 'Search', 'empty-state': 'Empty State', navigation: 'Nav',
  form: 'Form', auth: 'Auth', map: 'Map', dashboard: 'Dashboard',
  notification: 'Notification', media: 'Media', commerce: 'Commerce',
  messaging: 'Messaging', typography: 'Typography', illustration: 'Illustration',
  other: 'Other',
};

const PLATFORM_LABELS = { ios: 'iOS', android: 'Android', web: 'Web', desktop: 'Desktop', other: 'Other' };

function formatDate(d) {
  if (!d) return null;
  const [y, m, day] = d.split('-');
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ChipGroup({ title, options, active, onToggle }) {
  return (
    <div className="shots-chip-group">
      <span className="shots-chip-label">{title}</span>
      <div className="shots-chips">
        {options.map(([key, label]) => (
          <button
            key={key}
            className={`shot-chip${active.has(key) ? ' active' : ''}`}
            onClick={() => onToggle(key)}
          >{label}</button>
        ))}
      </div>
    </div>
  );
}

export default function ShotsBrowser() {
  const [shots, setShots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeSource, setActiveSource] = useState(new Set());
  const [activePattern, setActivePattern] = useState(new Set());
  const [activePlatform, setActivePlatform] = useState(new Set());
  const [lightbox, setLightbox] = useState(null);
  const [taggingProgress, setTaggingProgress] = useState(null);

  useEffect(() => {
    fetch('/shots').then(r => r.json()).then(d => { setShots(d); setLoading(false); });
    // Poll tagging progress
    const poll = setInterval(() => {
      fetch('/shots/tags-progress').then(r => r.json()).then(p => {
        setTaggingProgress(p);
        if (p.tagged > 0) {
          // Refresh shots to get new tags
          fetch('/shots').then(r => r.json()).then(setShots);
        }
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(poll);
  }, []);

  function toggle(set, setFn, key) {
    setFn(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const sources = useMemo(() => {
    const map = {};
    shots.forEach(s => map[s.source] = (map[s.source] || 0) + 1);
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([k]) => [k, SOURCE_LABELS[k] || k]);
  }, [shots]);

  const patterns = useMemo(() => {
    const map = {};
    shots.forEach(s => (s.patterns || []).forEach(p => map[p] = (map[p] || 0) + 1));
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([k]) => [k, PATTERN_LABELS[k] || k]);
  }, [shots]);

  const platforms = useMemo(() => {
    const map = {};
    shots.forEach(s => s.platform && (map[s.platform] = (map[s.platform] || 0) + 1));
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([k]) => [k, PLATFORM_LABELS[k] || k]);
  }, [shots]);

  const filtered = useMemo(() => {
    let s = shots;
    if (activeSource.size) s = s.filter(x => activeSource.has(x.source));
    if (activePattern.size) s = s.filter(x => (x.patterns || []).some(p => activePattern.has(p)));
    if (activePlatform.size) s = s.filter(x => activePlatform.has(x.platform));
    if (search.trim()) s = s.filter(x =>
      x.name.toLowerCase().includes(search.toLowerCase()) ||
      (x.desc || '').toLowerCase().includes(search.toLowerCase())
    );
    return s;
  }, [shots, activeSource, activePattern, activePlatform, search]);

  const hasFilters = activeSource.size || activePattern.size || activePlatform.size || search;

  return (
    <div className="shots-browser">
      <div className="shots-header">
        <div className="shots-title-row">
          <span className="shots-title">Shots</span>
          {!loading && (
            <span className="shots-total">
              {filtered.length.toLocaleString()}
              {hasFilters ? ` of ${shots.length.toLocaleString()}` : ''}
            </span>
          )}
          {taggingProgress && taggingProgress.tagged < shots.length && (
            <span className="shots-tagging-badge">
              Tagging {taggingProgress.tagged.toLocaleString()} / {shots.length.toLocaleString()} ✦
            </span>
          )}
          {hasFilters && (
            <button className="shots-clear" onClick={() => {
              setActiveSource(new Set()); setActivePattern(new Set());
              setActivePlatform(new Set()); setSearch('');
            }}>Clear filters</button>
          )}
        </div>

        <div className="shots-search-wrap">
          <span className="search-icon" style={{ fontSize: 14 }}>⌕</span>
          <input
            className="shots-search" type="text"
            placeholder="Search by name or description…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
          {search && <button className="search-clear" onClick={() => setSearch('')}>⊗</button>}
        </div>

        <ChipGroup title="Source" options={sources} active={activeSource}
          onToggle={k => toggle(activeSource, setActiveSource, k)} />
        {patterns.length > 0 && (
          <ChipGroup title="Pattern" options={patterns} active={activePattern}
            onToggle={k => toggle(activePattern, setActivePattern, k)} />
        )}
        {platforms.length > 0 && (
          <ChipGroup title="Platform" options={platforms} active={activePlatform}
            onToggle={k => toggle(activePlatform, setActivePlatform, k)} />
        )}
      </div>

      {loading && <div className="empty-state" style={{ paddingTop: 60 }}>Loading shots…</div>}
      {!loading && filtered.length === 0 && <div className="empty-state">No shots match.</div>}

      {!loading && filtered.length > 0 && (
        <div className="shots-masonry">
          {filtered.map((shot, i) => (
            <div key={shot.fullPath} className="shot-card" onClick={() => setLightbox(i)}>
              <img src={`/image?path=${encodeURIComponent(shot.fullPath)}`} loading="lazy" alt={shot.name} />
              <div className="shot-overlay">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="shot-source">{SOURCE_LABELS[shot.source] || shot.source}</span>
                  {shot.desc && <span className="shot-desc">{shot.desc}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  {shot.platform && <span className="shot-platform-badge">{PLATFORM_LABELS[shot.platform] || shot.platform}</span>}
                  {shot.date && <span className="shot-date">{formatDate(shot.date)}</span>}
                </div>
              </div>
              {(shot.patterns || []).length > 0 && (
                <div className="shot-patterns">
                  {shot.patterns.map(p => <span key={p} className="shot-pattern-tag">{PATTERN_LABELS[p] || p}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {lightbox !== null && (
        <LightBox
          photos={filtered.map(s => ({ ...s, type: 'image', displayable: true }))}
          index={lightbox} year="" event="" api=""
          onClose={() => setLightbox(null)} onChange={setLightbox}
        />
      )}
    </div>
  );
}
