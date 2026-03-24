import { useState, useEffect } from 'react';
import LightBox from './LightBox';

export default function AppScreensGallery({ onBack }) {
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    fetch('/projects/app-screens').then(r => r.json()).then(setFolders);
  }, []);

  function selectFolder(folder) {
    setSelectedFolder(folder);
    fetch(`/projects/app-screens/files?dir=${encodeURIComponent(folder.dir)}`)
      .then(r => r.json())
      .then(files => setPhotos(files.map(f => ({ ...f, type: 'image', displayable: true }))));
  }

  function back() {
    if (selectedFolder) { setSelectedFolder(null); setPhotos([]); }
    else onBack();
  }

  return (
    <div>
      <div className="breadcrumb" style={{ marginBottom: 24 }}>
        <span className="crumb" onClick={onBack}>Projects</span>
        <span className="sep">/</span>
        <span className={selectedFolder ? 'crumb' : 'crumb active'} onClick={() => { setSelectedFolder(null); setPhotos([]); }}>App Screens</span>
        {selectedFolder && (
          <>
            <span className="sep">/</span>
            <span className="crumb active">{selectedFolder.label}</span>
          </>
        )}
      </div>

      {!selectedFolder && (
        <div className="event-grid">
          {folders.map(f => (
            <div key={f.dir} className="event-card" onClick={() => selectFolder(f)}>
              <img
                src={`/image?path=${encodeURIComponent(f.cover)}`}
                loading="lazy"
                alt={f.label}
              />
              <div className="event-info">
                <span className="event-name">{f.label}</span>
                <span className="event-count">{f.count}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedFolder && (
        <div className="photo-grid">
          {photos.map((f, i) => (
            <div key={f.fullPath} className="photo-cell" onClick={() => setLightbox(i)}>
              <img
                src={`/image?path=${encodeURIComponent(f.fullPath)}`}
                loading="lazy"
                alt={f.name}
              />
            </div>
          ))}
        </div>
      )}

      {lightbox !== null && (
        <LightBox
          photos={photos}
          index={lightbox}
          year=""
          event=""
          api=""
          onClose={() => setLightbox(null)}
          onChange={setLightbox}
        />
      )}
    </div>
  );
}
