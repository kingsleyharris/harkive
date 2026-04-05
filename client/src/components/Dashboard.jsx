import { useState, useEffect } from 'react';

function StatCard({ value, label, sub, onClick }) {
  return (
    <div className="stat-card" onClick={onClick} style={onClick ? { cursor: 'pointer' } : {}}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function Dashboard({ onNavigate }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch('/dashboard').then(r => r.json()).then(setStats);
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, marginBottom: 6 }}>Harkive</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Your personal archive.</div>
      </div>

      {!stats && <div className="empty-state">Loading…</div>}

      {stats && (
        <>
          <div className="section-heading" style={{ marginBottom: 12 }}>Photos</div>
          <div className="stat-grid" style={{ marginBottom: 32 }}>
            <StatCard value={stats.photoYears} label="Years" onClick={() => onNavigate('photos')} />
            <StatCard value={stats.photoEvents} label="Events" onClick={() => onNavigate('photos')} />
          </div>

          <div className="section-heading" style={{ marginBottom: 12 }}>Archive</div>
          <div className="stat-grid" style={{ marginBottom: 32 }}>
            <StatCard value={stats.archiveAlbums} label="Albums" onClick={() => onNavigate('archive')} />
          </div>

          <div className="section-heading" style={{ marginBottom: 12 }}>Studio</div>
          <div className="stat-grid" style={{ marginBottom: 32 }}>
            <StatCard value={stats.studioProjects} label="Projects" sub={`${stats.studioTracks} sessions total`} onClick={() => onNavigate('studio')} />
          </div>

          <div className="section-heading" style={{ marginBottom: 12 }}>Library</div>
          <div className="stat-grid" style={{ marginBottom: 32 }}>
            <StatCard value={stats.docCategories} label="Doc Categories" onClick={() => onNavigate('docs')} />
            <StatCard value={stats.videos} label="Videos" onClick={() => onNavigate('videos')} />
          </div>

          {(stats.dropboxFolders > 0 || stats.dropboxFiles > 0) && <>
            <div className="section-heading" style={{ marginBottom: 12 }}>Dropbox</div>
            <div className="stat-grid" style={{ marginBottom: 32 }}>
              <StatCard value={stats.dropboxFolders} label="Folders" onClick={() => onNavigate('dropbox')} />
              <StatCard value={stats.dropboxFiles}   label="Root Files" onClick={() => onNavigate('dropbox')} />
            </div>
          </>}
        </>
      )}
    </div>
  );
}
