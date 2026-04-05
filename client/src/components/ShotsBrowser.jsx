import { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import LightBox from './LightBox';
import ShimmerImg from './ShimmerImg';

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

function buildCountMap(arr, getKeys) {
  const map = new Map();
  arr.forEach(x => {
    const keys = getKeys(x);
    (Array.isArray(keys) ? keys : [keys]).forEach(k => {
      if (k) map.set(k, (map.get(k) || 0) + 1);
    });
  });
  return map;
}

function ChipGroup({ title, options, active, onToggle, countMap }) {
  if (!options.length) return null;
  const sorted = [...options].sort((a, b) => {
    const aActive = active.has(a[0]) ? 1 : 0;
    const bActive = active.has(b[0]) ? 1 : 0;
    if (bActive !== aActive) return bActive - aActive;
    return (countMap?.get(b[0]) || 0) - (countMap?.get(a[0]) || 0);
  });
  return (
    <div className="shots-chip-group">
      <span className="shots-chip-label">{title}</span>
      <div className="shots-chips">
        {sorted.map(([key, label]) => {
          const count = countMap?.get(key) || 0;
          const isActive = active.has(key);
          return (
            <button
              key={key}
              className={`shot-chip${isActive ? ' active' : ''}`}
              style={!isActive && count === 0 ? { opacity: 0.35 } : undefined}
              onClick={() => onToggle(key)}
            >
              {label}
              {count > 0 && <span className="chip-count">{count}</span>}
            </button>
          );
        })}
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
  const [filterMode, setFilterMode] = useState('AND');
  const [lightbox, setLightbox] = useState(null);
  const [taggingProgress, setTaggingProgress] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);
  const mountTime = useRef(performance.now());

  // Deferred search — input stays snappy, memo runs after
  const deferredSearch = useDeferredValue(search);

  // URL read — mount only
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('q'))    setSearch(p.get('q'));
    if (p.get('src'))  setActiveSource(new Set(p.get('src').split(',')));
    if (p.get('pat'))  setActivePattern(new Set(p.get('pat').split(',')));
    if (p.get('cmp'))  setActiveComponent(new Set(p.get('cmp').split(',')));
    if (p.get('plt'))  setActivePlatform(new Set(p.get('plt').split(',')));
    if (p.get('era'))  setActiveEra(new Set(p.get('era').split(',')));
    if (p.get('mode')) setFilterMode(p.get('mode'));
  }, []);

  // URL write — on every filter change
  useEffect(() => {
    const p = new URLSearchParams();
    if (search) p.set('q', search);
    if (activeSource.size)    p.set('src',  [...activeSource].join(','));
    if (activePattern.size)   p.set('pat',  [...activePattern].join(','));
    if (activeComponent.size) p.set('cmp',  [...activeComponent].join(','));
    if (activePlatform.size)  p.set('plt',  [...activePlatform].join(','));
    if (activeEra.size)       p.set('era',  [...activeEra].join(','));
    if (filterMode !== 'AND') p.set('mode', filterMode);
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [search, activeSource, activePattern, activeComponent, activePlatform, activeEra, filterMode]);

  // Sentinel for progressive rendering
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setVisibleCount(n => n + PAGE_SIZE);
    }, { rootMargin: '400px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loading]);

  // Reset visible count on filter change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, activeSource, activePattern, activeComponent, activePlatform, activeEra, filterMode]);

  // Data fetch + timing
  useEffect(() => {
    performance.mark('shots-fetch-start');
    fetch('/shots').then(r => r.json()).then(d => {
      performance.mark('shots-data-ready');
      performance.measure('shots: mount→data', { start: mountTime.current, end: performance.now() });
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

  // Build filter chip options from data
  function buildOptions(keys, labelMap) {
    const map = {};
    keys.forEach(k => map[k] = (map[k] || 0) + 1);
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([k]) => [k, labelMap[k] || k]);
  }

  const sources    = useMemo(() => buildOptions(shots.map(s => s.source), SOURCE_LABELS), [shots]);
  const patterns   = useMemo(() => buildOptions(shots.flatMap(s => s.patterns || []), PATTERN_LABELS), [shots]);
  const components = useMemo(() => buildOptions(shots.flatMap(s => s.components || []), COMPONENT_LABELS), [shots]);
  const platforms  = useMemo(() => buildOptions(shots.filter(s => s.platform).map(s => s.platform), PLATFORM_LABELS), [shots]);
  const eras       = useMemo(() => buildOptions(shots.filter(s => s.era).map(s => s.era), ERA_LABELS), [shots]);

  // Per-category baselines for counts (AND logic, skipping own category)
  const applySearch = (arr) => {
    if (!deferredSearch.trim()) return arr;
    const q = deferredSearch.toLowerCase();
    return arr.filter(x => x.name.toLowerCase().includes(q) || (x.desc || '').toLowerCase().includes(q));
  };

  const baselineSource = useMemo(() => {
    let s = shots;
    if (activePattern.size)   s = s.filter(x => (x.patterns||[]).some(p => activePattern.has(p)));
    if (activeComponent.size) s = s.filter(x => (x.components||[]).some(c => activeComponent.has(c)));
    if (activePlatform.size)  s = s.filter(x => activePlatform.has(x.platform));
    if (activeEra.size)       s = s.filter(x => activeEra.has(x.era));
    return applySearch(s);
  }, [shots, activePattern, activeComponent, activePlatform, activeEra, deferredSearch]); // eslint-disable-line

  const baselinePattern = useMemo(() => {
    let s = shots;
    if (activeSource.size)    s = s.filter(x => activeSource.has(x.source));
    if (activeComponent.size) s = s.filter(x => (x.components||[]).some(c => activeComponent.has(c)));
    if (activePlatform.size)  s = s.filter(x => activePlatform.has(x.platform));
    if (activeEra.size)       s = s.filter(x => activeEra.has(x.era));
    return applySearch(s);
  }, [shots, activeSource, activeComponent, activePlatform, activeEra, deferredSearch]); // eslint-disable-line

  const baselineComponent = useMemo(() => {
    let s = shots;
    if (activeSource.size)    s = s.filter(x => activeSource.has(x.source));
    if (activePattern.size)   s = s.filter(x => (x.patterns||[]).some(p => activePattern.has(p)));
    if (activePlatform.size)  s = s.filter(x => activePlatform.has(x.platform));
    if (activeEra.size)       s = s.filter(x => activeEra.has(x.era));
    return applySearch(s);
  }, [shots, activeSource, activePattern, activePlatform, activeEra, deferredSearch]); // eslint-disable-line

  const baselinePlatform = useMemo(() => {
    let s = shots;
    if (activeSource.size)    s = s.filter(x => activeSource.has(x.source));
    if (activePattern.size)   s = s.filter(x => (x.patterns||[]).some(p => activePattern.has(p)));
    if (activeComponent.size) s = s.filter(x => (x.components||[]).some(c => activeComponent.has(c)));
    if (activeEra.size)       s = s.filter(x => activeEra.has(x.era));
    return applySearch(s);
  }, [shots, activeSource, activePattern, activeComponent, activeEra, deferredSearch]); // eslint-disable-line

  const baselineEra = useMemo(() => {
    let s = shots;
    if (activeSource.size)    s = s.filter(x => activeSource.has(x.source));
    if (activePattern.size)   s = s.filter(x => (x.patterns||[]).some(p => activePattern.has(p)));
    if (activeComponent.size) s = s.filter(x => (x.components||[]).some(c => activeComponent.has(c)));
    if (activePlatform.size)  s = s.filter(x => activePlatform.has(x.platform));
    return applySearch(s);
  }, [shots, activeSource, activePattern, activeComponent, activePlatform, deferredSearch]); // eslint-disable-line

  // Count maps per category
  const sourceCountMap    = useMemo(() => buildCountMap(baselineSource,    x => x.source), [baselineSource]);
  const patternCountMap   = useMemo(() => buildCountMap(baselinePattern,   x => x.patterns || []), [baselinePattern]);
  const componentCountMap = useMemo(() => buildCountMap(baselineComponent, x => x.components || []), [baselineComponent]);
  const platformCountMap  = useMemo(() => buildCountMap(baselinePlatform,  x => x.platform), [baselinePlatform]);
  const eraCountMap       = useMemo(() => buildCountMap(baselineEra,       x => x.era), [baselineEra]);

  // Main filtered set
  const filtered = useMemo(() => {
    let s = shots;

    if (filterMode === 'AND') {
      if (activeSource.size)    s = s.filter(x => activeSource.has(x.source));
      if (activePattern.size)   s = s.filter(x => (x.patterns||[]).some(p => activePattern.has(p)));
      if (activeComponent.size) s = s.filter(x => (x.components||[]).some(c => activeComponent.has(c)));
      if (activePlatform.size)  s = s.filter(x => activePlatform.has(x.platform));
      if (activeEra.size)       s = s.filter(x => activeEra.has(x.era));
    } else {
      const anyActive = activeSource.size || activePattern.size || activeComponent.size || activePlatform.size || activeEra.size;
      if (anyActive) {
        s = s.filter(x =>
          (activeSource.size    && activeSource.has(x.source))                              ||
          (activePattern.size   && (x.patterns||[]).some(p => activePattern.has(p)))        ||
          (activeComponent.size && (x.components||[]).some(c => activeComponent.has(c)))    ||
          (activePlatform.size  && activePlatform.has(x.platform))                          ||
          (activeEra.size       && activeEra.has(x.era))
        );
      }
    }

    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase();
      s = s.filter(x => x.name.toLowerCase().includes(q) || (x.desc || '').toLowerCase().includes(q));
    }
    return s;
  }, [shots, activeSource, activePattern, activeComponent, activePlatform, activeEra, filterMode, deferredSearch]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const hasFilters = activeSource.size || activePattern.size || activeComponent.size || activePlatform.size || activeEra.size || search;

  function clearAll() {
    setActiveSource(new Set()); setActivePattern(new Set()); setActiveComponent(new Set());
    setActivePlatform(new Set()); setActiveEra(new Set()); setSearch(''); setFilterMode('AND');
  }

  // Render timing log
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
  }, [loading]); // eslint-disable-line

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

        <div className="shots-mode-row">
          <span className="shots-chip-label" style={{ marginRight: 8 }}>Match</span>
          <button
            className={`shot-chip${filterMode === 'AND' ? ' active' : ''}`}
            onClick={() => setFilterMode('AND')}
          >ALL filters</button>
          <button
            className={`shot-chip${filterMode === 'OR' ? ' active' : ''}`}
            onClick={() => setFilterMode('OR')}
          >ANY filter</button>
        </div>

        <ChipGroup title="Source"    options={sources}    active={activeSource}    countMap={sourceCountMap}    onToggle={k => toggle(activeSource, setActiveSource, k)} />
        <ChipGroup title="Screen"    options={patterns}   active={activePattern}   countMap={patternCountMap}   onToggle={k => toggle(activePattern, setActivePattern, k)} />
        <ChipGroup title="Component" options={components} active={activeComponent} countMap={componentCountMap} onToggle={k => toggle(activeComponent, setActiveComponent, k)} />
        <ChipGroup title="Platform"  options={platforms}  active={activePlatform}  countMap={platformCountMap}  onToggle={k => toggle(activePlatform, setActivePlatform, k)} />
        <ChipGroup title="Era"       options={eras}       active={activeEra}       countMap={eraCountMap}       onToggle={k => toggle(activeEra, setActiveEra, k)} />
      </div>

      {loading && <div className="empty-state" style={{ paddingTop: 60 }}>Loading shots…</div>}
      {!loading && filtered.length === 0 && <div className="empty-state">No shots match.</div>}

      {!loading && filtered.length > 0 && (
        <div className="shots-masonry">
          {visible.map((shot, i) => (
            <div key={shot.fullPath} className="shot-card" onClick={() => setLightbox(i)}>
              <ShimmerImg src={`/image?path=${encodeURIComponent(shot.fullPath)}`} alt={shot.name} natural />
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
