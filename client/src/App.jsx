import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import StartScreen from './components/StartScreen';
import YearGrid from './components/YearGrid';
import EventGrid from './components/EventGrid';
import LightBox from './components/LightBox';
import SearchResults from './components/SearchResults';
import DriveOffline from './components/DriveOffline';
import './App.css';

const DocBrowser      = lazy(() => import('./components/DocBrowser'));
const ProjectsBrowser = lazy(() => import('./components/ProjectsBrowser'));
const ArchiveBrowser  = lazy(() => import('./components/ArchiveBrowser'));
const StudioBrowser   = lazy(() => import('./components/StudioBrowser'));
const VideoPlayer     = lazy(() => import('./components/VideoPlayer'));
const Dashboard       = lazy(() => import('./components/Dashboard'));
const NotionBrowser   = lazy(() => import('./components/NotionBrowser'));
const ShotsBrowser    = lazy(() => import('./components/ShotsBrowser'));

const API = '';

const NAV = [
  { id: 'dashboard', label: 'Home',      icon: '⌂' },
  { id: 'photos',    label: 'Photos',    icon: '⬡' },
  { id: 'archive',   label: 'Archive',   icon: '◫' },
  { id: 'studio',    label: 'Studio',    icon: '♩' },
  { id: 'videos',    label: 'Videos',    icon: '▶' },
  { id: 'shots',     label: 'Shots',     icon: '⊞' },
  { id: 'notion',    label: 'Notion',    icon: 'N' },
  { id: 'docs',      label: 'Documents', icon: '≡' },
  { id: 'projects',  label: 'Projects',  icon: '◉' },
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [years, setYears] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const searchTimeout = useRef(null);

  useEffect(() => {
    fetch('/years').then(r => r.json()).then(setYears);
  }, []);

  useEffect(() => {
    clearTimeout(searchTimeout.current);
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    searchTimeout.current = setTimeout(() => {
      fetch(`/search?q=${encodeURIComponent(searchQuery)}`).then(r => r.json()).then(setSearchResults);
    }, 300);
  }, [searchQuery]);

  function switchTab(id) {
    setTab(id);
    setSearchQuery('');
    setSearchResults(null);
  }

  function selectYear(year) {
    setSelectedYear(year);
    setSelectedEvent(null);
    setPhotos([]);
    fetch(`/years/${year}`).then(r => r.json()).then(setEvents);
  }

  function selectEvent(event) {
    setSelectedEvent(event.name);
    setSelectedYear(event.year || selectedYear);
    fetch(`/years/${event.year || selectedYear}/${event.name}`).then(r => r.json()).then(setPhotos);
    setSearchResults(null);
    setSearchQuery('');
    setTab('photos');
  }

  function resetPhotos() {
    setSelectedYear(null);
    setSelectedEvent(null);
    setPhotos([]);
  }

  const showSearch = searchResults !== null;

  // Breadcrumb for toolbar
  let breadcrumb = null;
  if (!showSearch && tab === 'photos' && selectedYear) {
    breadcrumb = (
      <div className="toolbar-breadcrumb">
        <span className="tb-crumb" onClick={resetPhotos}>All Years</span>
        <span className="tb-sep">›</span>
        <span className={selectedEvent ? 'tb-crumb' : 'tb-crumb active'} onClick={() => { setSelectedEvent(null); setPhotos([]); }}>{selectedYear}</span>
        {selectedEvent && <>
          <span className="tb-sep">›</span>
          <span className="tb-crumb active">{selectedEvent.replace(/^\d{4}-?\d{0,2}_?/, '').replace(/-/g, ' ')}</span>
        </>}
      </div>
    );
  }

  if (!ready) return <StartScreen onReady={() => setReady(true)} />;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-title">Harkive</div>
        <nav className="sidebar-nav">
          {NAV.map(n => (
            <button
              key={n.id}
              className={`nav-item${tab === n.id ? ' active' : ''}`}
              onClick={() => switchTab(n.id)}
            >
              <span className="nav-icon">{n.icon}</span>
              <span className="nav-label">{n.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="content-area">
        <div className="toolbar">
          <div className="search-wrap">
            <span className="search-icon">⌕</span>
            <input
              className="search-input"
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && (setSearchQuery(''), setSearchResults(null))}
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => { setSearchQuery(''); setSearchResults(null); }}>⊗</button>
            )}
          </div>
          {breadcrumb}
        </div>

        <main>
          <Suspense fallback={<div className="empty-state">Loading…</div>}>
          {showSearch && <SearchResults results={searchResults} onSelectEvent={selectEvent} api={API} />}

          {!showSearch && tab === 'photos' && <>
            {!selectedYear && years === null && <div className="empty-state">Loading…</div>}
            {!selectedYear && years !== null && years.length === 0 && <DriveOffline label="Photos" />}
            {!selectedYear && years?.length > 0 && <YearGrid years={years} onSelect={selectYear} />}
            {selectedYear && !selectedEvent && <EventGrid year={selectedYear} events={events} api={API} onSelect={selectEvent} />}
            {selectedEvent && (
              <div className="photo-grid">
                {photos.map((f, i) => (
                  <div key={f.fullPath} className={`photo-cell${!f.displayable ? ' raw' : ''}`} onClick={() => f.displayable && setLightbox(i)}>
                    {f.displayable ? (
                      <img src={`/image?path=${encodeURIComponent(f.fullPath)}`} loading="lazy" alt={f.name} />
                    ) : (
                      <div className="raw-placeholder">
                        <span className="raw-ext">{f.name.split('.').pop().toUpperCase()}</span>
                        <span className="raw-name">{f.name}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>}

          {!showSearch && tab === 'archive' && <ArchiveBrowser />}
          {!showSearch && tab === 'studio' && <StudioBrowser />}
          {!showSearch && tab === 'videos' && <VideoPlayer />}
          {!showSearch && tab === 'shots' && <ShotsBrowser />}
          {!showSearch && tab === 'notion' && <NotionBrowser />}
          {!showSearch && tab === 'docs' && <DocBrowser />}
          {!showSearch && tab === 'projects' && <ProjectsBrowser />}
          {!showSearch && tab === 'dashboard' && <Dashboard onNavigate={switchTab} />}
          </Suspense>
        </main>
      </div>

      {lightbox !== null && (
        <LightBox
          photos={photos}
          index={lightbox}
          year={selectedYear}
          event={selectedEvent}
          api={API}
          onClose={() => setLightbox(null)}
          onChange={setLightbox}
        />
      )}
    </div>
  );
}
