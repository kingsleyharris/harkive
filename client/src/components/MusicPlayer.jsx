import { useState, useEffect, useRef } from 'react';

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatTime(secs) {
  if (!secs || isNaN(secs)) return '—';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const EXT_COLOR = { mp3: '#4a9', wav: '#69f', aiff: '#69f', flac: '#a7f', m4a: '#fa7' };

export default function MusicPlayer({ onBack }) {
  const [tracks, setTracks] = useState([]);
  const [current, setCurrent] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [filter, setFilter] = useState('');
  const audioRef = useRef(null);

  useEffect(() => {
    fetch('/projects/music').then(r => r.json()).then(setTracks);
  }, []);

  useEffect(() => {
    if (!audioRef.current) return;
    const a = audioRef.current;
    const onTime = () => setProgress(a.currentTime);
    const onDur = () => setDuration(a.duration);
    const onEnd = () => { setPlaying(false); playNext(); };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onDur);
    a.addEventListener('ended', onEnd);
    return () => { a.removeEventListener('timeupdate', onTime); a.removeEventListener('loadedmetadata', onDur); a.removeEventListener('ended', onEnd); };
  }, [current, tracks]);

  function play(track) {
    setCurrent(track);
    setProgress(0);
    setPlaying(true);
    setTimeout(() => audioRef.current?.play(), 50);
  }

  function togglePlay() {
    if (!current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  }

  function playNext() {
    const filtered = getFiltered();
    const idx = filtered.findIndex(t => t.fullPath === current?.fullPath);
    if (idx < filtered.length - 1) play(filtered[idx + 1]);
  }

  function playPrev() {
    const filtered = getFiltered();
    const idx = filtered.findIndex(t => t.fullPath === current?.fullPath);
    if (idx > 0) play(filtered[idx - 1]);
  }

  function getFiltered() {
    return filter ? tracks.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()) || t.artist.toLowerCase().includes(filter.toLowerCase())) : tracks;
  }

  const filtered = getFiltered();

  return (
    <div className="music-player">
      <div className="breadcrumb" style={{ marginBottom: 24 }}>
        <span className="crumb" onClick={onBack}>Projects</span>
        <span className="sep">/</span>
        <span className="crumb active">Music</span>
      </div>

      {/* Now playing bar */}
      {current && (
        <div className="now-playing">
          <div className="np-info">
            <span className="np-title">{current.name.replace(/\.[^.]+$/, '')}</span>
            <span className="np-artist">{current.artist || current.ext.toUpperCase()}</span>
          </div>
          <div className="np-controls">
            <button onClick={playPrev}>⏮</button>
            <button className="np-play" onClick={togglePlay}>{playing ? '⏸' : '▶'}</button>
            <button onClick={playNext}>⏭</button>
          </div>
          <div className="np-progress">
            <span>{formatTime(progress)}</span>
            <input
              type="range" min={0} max={duration || 1} step={0.1} value={progress}
              onChange={e => { audioRef.current.currentTime = e.target.value; setProgress(+e.target.value); }}
            />
            <span>{formatTime(duration)}</span>
          </div>
          <audio ref={audioRef} src={`/project-audio?path=${encodeURIComponent(current.fullPath)}`} />
        </div>
      )}

      <div className="file-filter" style={{ marginBottom: 16 }}>
        <input
          type="text" placeholder="Filter tracks…"
          value={filter} onChange={e => setFilter(e.target.value)}
        />
      </div>

      <div className="file-rows">
        {filtered.map((t, i) => (
          <div
            key={t.fullPath}
            className={`file-row track-row${current?.fullPath === t.fullPath ? ' active-track' : ''}`}
            onClick={() => play(t)}
          >
            <span className="track-num">{i + 1}</span>
            <span className="track-play-icon">{current?.fullPath === t.fullPath && playing ? '▶' : ''}</span>
            <span className="file-name">{t.name.replace(/\.[^.]+$/, '')}</span>
            {t.artist && <span className="file-meta">{t.artist}</span>}
            <span className="track-ext" style={{ color: EXT_COLOR[t.ext] || '#555' }}>{t.ext}</span>
            <span className="file-size">{formatSize(t.size)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
