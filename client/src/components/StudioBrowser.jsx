import { useState, useEffect } from 'react';
import DriveOffline from './DriveOffline';

export default function StudioBrowser() {
  const [albums, setAlbums] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetch('/studio/albums').then(r => r.json()).then(setAlbums);
  }, []);

  if (albums === null) return <div className="empty-state">Loading…</div>;
  if (albums.length === 0) return <DriveOffline label="Studio" />;

  if (selected) {
    return (
      <div>
        <div className="breadcrumb" style={{ marginBottom: 24 }}>
          <span className="crumb" onClick={() => setSelected(null)}>Studio</span>
          <span className="sep">/</span>
          <span className="crumb active">{selected.name}</span>
        </div>
        <div className="track-list">
          {selected.tracks.map((t, i) => (
            <div key={t.fullPath} className="track-row">
              <span className="track-num">{String(i + 1).padStart(2, '0')}</span>
              <div className="track-meta">
                <span className="track-title">{t.name}</span>
                <span className="track-ext">ALS</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="breadcrumb" style={{ marginBottom: 24 }}>
        <span className="crumb active">Studio</span>
      </div>
      <div className="event-grid">
        {albums.map(a => (
          <div key={a.name} className="album-card" onClick={() => setSelected(a)}>
            <div className="album-cover">
              <span className="album-icon">◈</span>
            </div>
            <div className="event-info">
              <span className="event-name">{a.name}</span>
              <span className="event-count">{a.trackCount} {a.trackCount === 1 ? 'session' : 'sessions'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
