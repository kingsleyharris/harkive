import { useState, useEffect } from 'react';
import LightBox from './LightBox';
import DriveOffline from './DriveOffline';
import ShimmerImg from './ShimmerImg';

export default function ArchiveBrowser() {
  const [albums, setAlbums] = useState(null);
  const [selected, setSelected] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/archive').then(r => r.json()).then(setAlbums);
  }, []);

  function selectAlbum(album) {
    setSelected(album);
    setLightbox(null);
    setLoading(true);
    fetch(`/archive/files?dir=${encodeURIComponent(album.dir)}`)
      .then(r => r.json())
      .then(files => { setPhotos(files); setLoading(false); });
  }

  if (albums === null) return <div className="empty-state">Loading…</div>;
  if (albums.length === 0) return <DriveOffline label="Archive" />;

  // Group albums by section for display
  const sections = {};
  for (const a of albums) {
    if (!sections[a.section]) sections[a.section] = [];
    sections[a.section].push(a);
  }

  return (
    <div>
      <div className="breadcrumb" style={{ marginBottom: 24 }}>
        <span className={selected ? 'crumb' : 'crumb active'} onClick={() => { setSelected(null); setPhotos([]); }}>Archive</span>
        {selected && (
          <>
            <span className="sep">/</span>
            <span className="crumb active">{selected.label}</span>
          </>
        )}
      </div>

      {!selected && (
        <div>
          {Object.entries(sections).map(([section, sectionAlbums]) => (
            <div key={section} style={{ marginBottom: 36 }}>
              <div className="section-heading">{section}</div>
              <div className="event-grid">
                {sectionAlbums.map(a => (
                  <div key={a.dir} className="event-card" onClick={() => selectAlbum(a)}>
                    <ShimmerImg src={`/image?path=${encodeURIComponent(a.cover)}`} alt={a.label} aspectRatio="4/3" />
                    <div className="event-info">
                      <span className="event-name">{a.label}</span>
                      <span className="event-count">{a.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div>
          {loading && <div className="empty-state">Loading…</div>}
          {!loading && (
            <div className="photo-grid">
              {photos.map((f, i) => (
                <div
                  key={f.fullPath}
                  className={`photo-cell${!f.displayable ? ' raw' : ''}`}
                  onClick={() => f.displayable && setLightbox(i)}
                >
                  {f.displayable ? (
                    <ShimmerImg src={`/image?path=${encodeURIComponent(f.fullPath)}`} alt={f.name} />
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
        </div>
      )}

      {lightbox !== null && (
        <LightBox
          photos={photos}
          index={lightbox}
          year=""
          event={selected?.label || ''}
          api=""
          onClose={() => setLightbox(null)}
          onChange={setLightbox}
        />
      )}
    </div>
  );
}
