import { useState, useEffect, useRef } from 'react';

function formatSize(bytes) {
  if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes > 1e6) return (bytes / 1e6).toFixed(0) + ' MB';
  return (bytes / 1e3).toFixed(0) + ' KB';
}

export default function VideoPlayer() {
  const [videos, setVideos] = useState([]);
  const [playing, setPlaying] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    fetch('/videos').then(r => r.json()).then(setVideos);
  }, []);

  function play(video) {
    setPlaying(video);
    setTimeout(() => videoRef.current?.play(), 50);
  }

  return (
    <div>
      <div className="breadcrumb" style={{ marginBottom: 24 }}>
        <span className="crumb active">Videos</span>
      </div>

      {playing && (
        <div className="video-player-wrap" style={{ marginBottom: 28 }}>
          <video
            ref={videoRef}
            key={playing.fullPath}
            controls
            style={{ width: '100%', maxHeight: 480, borderRadius: 'var(--radius-lg)', background: '#000', display: 'block' }}
          >
            <source src={`/video?path=${encodeURIComponent(playing.fullPath)}`} type={`video/${playing.ext}`} />
          </video>
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>{playing.name}</div>
        </div>
      )}

      {videos.length === 0 && (
        <div className="empty-state">No videos found.</div>
      )}

      <div className="track-list">
        {videos.map(v => (
          <div
            key={v.fullPath}
            className={`track-row${playing?.fullPath === v.fullPath ? ' active' : ''}`}
            onClick={() => play(v)}
            style={{ cursor: 'pointer' }}
          >
            <span className="track-num" style={{ fontSize: 16 }}>▶</span>
            <div className="track-meta">
              <span className="track-title">{v.name}</span>
              <span className="track-ext" style={{ marginLeft: 8 }}>{v.ext.toUpperCase()}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: 11 }}>{formatSize(v.size)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
