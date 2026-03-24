import { useState } from 'react';
import AppScreensGallery from './AppScreensGallery';
import MusicPlayer from './MusicPlayer';

export default function ProjectsBrowser() {
  const [view, setView] = useState(null); // null | 'screens' | 'music'

  if (view === 'screens') return <AppScreensGallery onBack={() => setView(null)} />;
  if (view === 'music') return <MusicPlayer onBack={() => setView(null)} />;

  return (
    <div className="cat-grid">
      <div className="cat-card" onClick={() => setView('screens')}>
        <span className="cat-icon">📱</span>
        <span className="cat-name">App Screens</span>
        <span className="cat-count">1,077+ screenshots</span>
      </div>
      <div className="cat-card" onClick={() => setView('music')}>
        <span className="cat-icon">🎵</span>
        <span className="cat-name">Music</span>
        <span className="cat-count">MP3s + WAV stems</span>
      </div>
    </div>
  );
}
