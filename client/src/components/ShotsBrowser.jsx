import { useState, useEffect, useRef, useMemo } from 'react';
import LightBox from './LightBox';

const PAGE_SIZE = 100;

const SOURCE_LABELS = {
  'team-patches': 'Team Patches', 'goals': 'Goals', 'q2': 'Q2',
  'screenshots': 'Screenshots', 'concepts-to-design': 'Concepts to Design',
  'goals-h2': 'Goals H2', '_Screenshots (1)': 'Archive', '_screenshots': 'Misc Shots',
  'FROM_DVD': 'From DVD', 'Inspiration': 'Inspiration', 'iphone': 'iPhone',
  'Screenshots': 'Screenshots',
};

const PATTERN_LABELS = {
  onboarding: 'Onboarding', auth: 'Auth', home: 'Home', feed: 'Feed',
  search: 'Search', profile: 'Profile', settings: 'Settings', detail: 'Detail',
  form: 'Form', checkout: 'Checkout', paywall: 'Paywall', permissions: 'Permissions',
  'empty-state': 'Empty State', error: 'Error', loading: 'Loading', map: 'Map',
  dashboard: 'Dashboard', messaging: 'Messaging', media: 'Media', commerce: 'Commerce',
  notification: 'Notification', other: 'Other',
};

const COMPONENT_LABELS = {
  button: 'Button', input: 'Input', toggle: 'Toggle', 'bottom-sheet': 'Bottom Sheet',
  modal: 'Modal', 'tab-bar': 'Tab Bar', 'nav-bar': 'Nav Bar', 'bottom-nav': 'Bottom Nav',
  card: 'Card', list: 'List', avatar: 'Avatar', badge: 'Badge', chip: 'Chip',
  progress: 'Progress', hero: 'Hero', banner: 'Banner', illustration: 'Illustration',
  chart: 'Chart', table: 'Table', stepper: 'Stepper', rating: 'Rating',
  'search-bar': 'Search Bar', skeleton: 'Skeleton', tooltip: 'Tooltip', other: 'Other',
};

const PLATFORM_LABELS = { ios: 'iOS', android: 'Android', web: 'Web', desktop: 'Desktop', other: 'Other' };

const ERA_LABELS = { early: 'Pre-2015', mid: '2015–2020', recent: '2020+' };

function formatDate(d) {
  if (!d) return null;
  const [y, m, day] = d.split('-');
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ChipGroup({ title, options, active, onToggle }) {
  if (!options.length) return null;
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

function toggle(set, setFn, key) {
  setFn(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
}

export default function ShotsBrowser() {
  const [shots, setShots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeSource, setActiveSource] = useState(new Set());
  const [activePattern, setActivePattern] = useState(new Set());
  const [activeComponent, setActiveComponent] = useState(new Set());
  const [activePlatform, setActivePlatform] = useState(new Set());
  const [activeEra, setActiveEra] = useState(new Set());
  const [lightbox, setLightbox] = useState(null);
  const [taggingProgress, setTaggingProgress] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);
  const mountTime = useRef(performance.now());

  // Expand visible window when sentinel scrolls into view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setVisibleCount(n => n + PAGE_SIZE);
    }, { rootMargin: '400px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loading]);

  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, activeSource, activePattern, activeComponent, activePlatform, activeEra]);

  useEffect(() => {
    performance.mark('shots-fetch-start');
    fetch('/shots').then(r => r.json()).then(d => {
      performance.mark('shots-data-ready');
      performance.measure('shots: mount → data', { start: mountTime.current, end: performance.now() });
      setShots(d);
      setLoading(false);
    });
    const poll = setInterval(() => {
      fetch('/shots/tags-progress').then(r => r.json()).then(p => {
        setTaggingProgress(p);
        if (p.tagged > 0) fetch('/shots').then(r => r.json()).then(setShots);
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(poll);
  }, []);

  // Build filter options from actual data, sorted by frequency
  function buildOptions(keys, labelMap) {
    const map = {};
    keys.forEach(k => map[k] = (map[k] || 0) + 1);
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([k]) => [k, labelMap[k] || k]);
  }

  const sources = useMemo(() => buildOptions(shots.map(s => s.source), SOURCE_LABELS), [shots]);
  const patterns = useMemo(() => buildOptions(shots.flatMap(s => s.patterns || []), PATTERN_LABELS), [shots]);
  const components = useMemo(() => buildOptions(shots.flatMap(s => s.components || []), COMPONENT_LABELS), [shots]);
  const platforms = useMemo(() => buildOptions(shots.filter(s => s.platform).map(s => s.platform), PLATFORM_LABELS), [shots]);
  const eras = useMemo(() => buildOptions(shots.filter(s => s.era).map(s => s.era), ERA_LABELS), [shots]);

  const filtered = useMemo(() => {
    let s = shots;
    if (activeSource.size)    s = s.filter(x => activeSource.has(x.source));
    if (activePattern.size)   s = s.filter(x => (x.patterns || []).some(p => activePattern.has(p)));
    if (activeComponent.size) s = s.filter(x => (x.components || []).some(c => activeComponent.has(c)));
    if (activePlatform.size)  s = s.filter(x => activePlatform.has(x.platform));
    if (activeEra.size)       s = s.filter(x => activeEra.has(x.era));
    if (search.trim()) {
      const q = search.toLowerCase();
      s = s.filter(x => x.name.toLowerCase().includes(q) || (x.desc || '').toLowerCase().includes(q));
    }
    return s;
  }, [shots, activeSource, activePattern, activeComponent, activePlatform, activeEra, search]);

  const hasFilters = activeSource.size || activePattern.size || activeComponent.size || activePlatform.size || activeEra.size || search;

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  // Log render time after first data paint
  useEffect(() => {
    if (loading || !filtered.length) return;
    const renderTime = performance.now();
    const fetchMark = performance.getEntriesByName('shots-fetch-start')[0];
    const dataMark  = performance.getEntriesByName('shots-data-ready')[0];
    if (fetchMark && dataMark) {
      console.log(
        `[Shots] mount→data: ${(dataMark.startTime - mountTime.current).toFixed(0)}ms` +
        ` | data→render: ${(renderTime - dataMark.startTime).toFixed(0)}ms` +
        ` | total: ${(renderTime - mountTime.current).toFixed(0)}ms` +
        ` | items: ${filtered.length} (showing ${Math.min(visibleCount, filtered.length)})`
      );
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  function clearAll() {
    setActiveSource(new Set()); setActivePattern(new Set()); setActiveComponent(new Set());
    setActivePlatform(new Set()); setActiveEra(new Set()); setSearch('');
  }

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
          {hasFilters && <button className="shots-clear" onClick={clearAll}>Clear filters</button>}
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

        <ChipGroup title="Source"    options={sources}    active={activeSource}    onToggle={k => toggle(activeSource, setActiveSource, k)} />
        <ChipGroup title="Screen"    options={patterns}   active={activePattern}   onToggle={k => toggle(activePattern, setActivePattern, k)} />
        <ChipGroup title="Component" options={components} active={activeComponent} onToggle={k => toggle(activeComponent, setActiveComponent, k)} />
        <ChipGroup title="Platform"  options={platforms}  active={activePlatform}  onToggle={k => toggle(activePlatform, setActivePlatform, k)} />
        <ChipGroup title="Era"       options={eras}       active={activeEra}       onToggle={k => toggle(activeEra, setActiveEra, k)} />
      </div>

      {loading && <div className="empty-state" style={{ paddingTop: 60 }}>Loading shots…</div>}
      {!loading && filtered.length === 0 && <div className="empty-state">No shots match.</div>}

      {!loading && filtered.length > 0 && (
        <div className="shots-masonry">
          {visible.map((shot, i) => (
            <div key={shot.fullPath} className="shot-card" onClick={() => setLightbox(i)}>
              <img src={`/image?path=${encodeURIComponent(shot.fullPath)}`} loading="lazy" alt={shot.name} />
              <div className="shot-overlay">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="shot-source">{SOURCE_LABELS[shot.source] || shot.source}</span>
                  {shot.desc && <span className="shot-desc">{shot.desc}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  {shot.platform && <span className="shot-platform-badge">{PLATFORM_LABELS[shot.platform] || shot.platform}</span>}
                  {shot.era && <span className="shot-era-badge">{ERA_LABELS[shot.era] || shot.era}</span>}
                  {shot.date && <span className="shot-date">{formatDate(shot.date)}</span>}
                </div>
              </div>
              {((shot.patterns || []).length > 0 || (shot.components || []).length > 0) && (
                <div className="shot-tags-row">
                  {(shot.patterns || []).map(p => (
                    <span key={p} className="shot-tag shot-tag-pattern">{PATTERN_LABELS[p] || p}</span>
                  ))}
                  {(shot.components || []).map(c => (
                    <span key={c} className="shot-tag shot-tag-component">{COMPONENT_LABELS[c] || c}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {visibleCount < filtered.length && (
            <div ref={sentinelRef} style={{ gridColumn: '1/-1', height: 1 }} />
          )}
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
