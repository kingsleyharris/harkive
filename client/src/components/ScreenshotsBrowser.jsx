import { useState, useEffect } from 'react';
import LightBox from './LightBox';

const LABELS = {
  'team-patches': 'Team Patches',
  'goals': 'Goals',
  'q2': 'Q2',
  'screenshots': 'Screenshots',
  'concepts-to-design': 'Concepts to Design',
  'goals-h2': 'Goals H2',
};

export default function ScreenshotsBrowser() {
  const [albums, setAlbums] = useState([]);
  const [selected, setSelected] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetch('/screenshots').then(r => r.json()).then(setAlbums);
  }, []);

  function selectAlbum(album) {
    setSelected(album);
    setLightbox(null);
    setFilter('');
    setLoading(true);
    const dirs = (album.dirs || [album.dir]).map(encodeURIComponent).join(',');
    fetch(`/screenshots/files?dirs=${dirs}`)
      .then(r => r.json())
      .then(files => { setPhotos(files); setLoading(false); });
  }

  const filtered = filter
    ? photos.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()))
    : photos;

  if (selected) {
    return (
      <div>
        <div className="breadcrumb" style={{ marginBottom: 16 }}>
          <span className="crumb" onClick={() => { setSelected(null); setPhotos([]); }}>Screenshots</span>
          <span className="sep">/</span>
          <span className="crumb active">{LABELS[selected.label] || selected.label}</span>
        </div>

        <div className="doc-filter" style={{ marginBottom: 16 }}>
          <input
            className="filter-input"
            type="text"
            placeholder="Filter by filename or date…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-tertiary)' }}>
            {filtered.length} of {photos.length}
          </span>
        </div>

        {loading && <div className="empty-state">Loading…</div>}
        {!loading && (
          <div className="photo-grid">
            {filtered.map((f, i) => (
              <div key={f.fullPath} className="photo-cell" onClick={() => setLightbox(i)}>
                <img src={`/image?path=${encodeURIComponent(f.fullPath)}`} loading="lazy" alt={f.name} />
              </div>
            ))}
            {filtered.length === 0 && <div className="empty-state">No matches.</div>}
          </div>
        )}

        {lightbox !== null && (
          <LightBox
            photos={filtered}
            index={lightbox}
            year=""
            event={selected.label}
            api=""
            onClose={() => setLightbox(null)}
            onChange={setLightbox}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="breadcrumb" style={{ marginBottom: 24 }}>
        <span className="crumb active">Screenshots</span>
      </div>
      <div className="event-grid">
        {albums.map(a => (
          <div key={a.dir} className="event-card" onClick={() => selectAlbum(a)}>
            <img src={`/image?path=${encodeURIComponent(a.cover)}`} loading="lazy" alt={a.label} />
            <div className="event-info">
              <span className="event-name">{LABELS[a.label] || a.label}</span>
              <span className="event-count">{a.count}</span>
            </div>
          </div>
        ))}
        {albums.length === 0 && <div className="empty-state">No screenshot albums found.</div>}
      </div>
    </div>
  );
}
