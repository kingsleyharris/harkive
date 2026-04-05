import { useState, useEffect } from 'react';
import ShimmerImg from './ShimmerImg';

function fmt(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function FileIcon({ ext, type }) {
  if (type === 'image') return <span>⬡</span>;
  if (type === 'video') return <span>▶</span>;
  if (type === 'audio') return <span>♩</span>;
  if (ext === 'pdf')    return <span>≡</span>;
  return <span>◻</span>;
}

export default function DropboxBrowser() {
  const [stack, setStack]       = useState([]); // [{name, rel}]
  const [contents, setContents] = useState(null);
  const [lightbox, setLightbox] = useState(null); // index into contents.files

  const currentRel = stack.map(s => s.rel).join('/');

  useEffect(() => {
    setContents(null);
    const url = currentRel
      ? `/dropbox/browse?path=${encodeURIComponent(currentRel)}`
      : '/dropbox';
    fetch(url)
      .then(r => r.json())
      .then(setContents)
      .catch(() => setContents({ folders: [], files: [], error: true }));
  }, [currentRel]);

  function enter(folder) {
    const rel = currentRel ? `${currentRel}/${folder.name}` : folder.name;
    setStack(prev => [...prev, { name: folder.name, rel }]);
    setLightbox(null);
  }

  function goTo(idx) {
    setStack(prev => prev.slice(0, idx + 1));
    setLightbox(null);
  }

  function goRoot() {
    setStack([]);
    setLightbox(null);
  }

  if (contents && !contents.configured && !currentRel) {
    return (
      <div className="empty-state">
        Dropbox not configured. Add <code>dropbox: '~/Dropbox'</code> to your{' '}
        <code>harkive.config.js</code>.
      </div>
    );
  }

  const images = (contents?.files || []).filter(f => f.displayable);

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        <span
          className="tb-crumb"
          onClick={goRoot}
          style={{ cursor: 'pointer', color: stack.length ? 'var(--text-secondary)' : 'var(--text)' }}
        >
          Dropbox
        </span>
        {stack.map((s, i) => (
          <span key={s.rel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="tb-sep">›</span>
            <span
              className="tb-crumb"
              onClick={() => goTo(i)}
              style={{ cursor: i < stack.length - 1 ? 'pointer' : 'default', color: i < stack.length - 1 ? 'var(--text-secondary)' : 'var(--text)' }}
            >
              {s.name}
            </span>
          </span>
        ))}
      </div>

      {!contents && <div className="empty-state">Loading…</div>}

      {contents?.error && <div className="empty-state">Could not read folder.</div>}

      {contents && !contents.error && (
        <>
          {/* Folders */}
          {contents.folders.length > 0 && (
            <>
              <div className="section-heading" style={{ marginBottom: 10 }}>Folders</div>
              <div className="stat-grid" style={{ marginBottom: 28 }}>
                {contents.folders.map(f => (
                  <div
                    key={f.fullPath}
                    className="stat-card"
                    style={{ cursor: 'pointer' }}
                    onClick={() => enter(f)}
                  >
                    <div className="stat-value" style={{ fontSize: 22 }}>◫</div>
                    <div className="stat-label" style={{ wordBreak: 'break-word' }}>{f.name}</div>
                    {f.count > 0 && <div className="stat-sub">{f.count} items</div>}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Image grid */}
          {images.length > 0 && (
            <>
              <div className="section-heading" style={{ marginBottom: 10 }}>Images</div>
              <div className="photo-grid" style={{ marginBottom: 28 }}>
                {images.map((f, i) => (
                  <div
                    key={f.fullPath}
                    className="photo-cell"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setLightbox(i)}
                  >
                    <ShimmerImg
                      src={`/dropbox/file?path=${encodeURIComponent(f.fullPath)}`}
                      alt={f.name}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Non-image files */}
          {contents.files.filter(f => !f.displayable).length > 0 && (
            <>
              <div className="section-heading" style={{ marginBottom: 10 }}>Files</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {contents.files.filter(f => !f.displayable).map(f => (
                  <a
                    key={f.fullPath}
                    href={`/dropbox/file?path=${encodeURIComponent(f.fullPath)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 6,
                      color: 'var(--text)', textDecoration: 'none',
                      background: 'var(--surface)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
                  >
                    <span style={{ color: 'var(--text-secondary)', width: 18, textAlign: 'center' }}>
                      <FileIcon ext={f.ext} type={f.type} />
                    </span>
                    <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>{f.ext?.toUpperCase()}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0, minWidth: 52, textAlign: 'right' }}>{fmt(f.size)}</span>
                  </a>
                ))}
              </div>
            </>
          )}

          {contents.folders.length === 0 && contents.files.length === 0 && (
            <div className="empty-state">Empty folder.</div>
          )}
        </>
      )}

      {/* Inline lightbox */}
      {lightbox !== null && images[lightbox] && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setLightbox(null)}
        >
          <img
            src={`/dropbox/file?path=${encodeURIComponent(images[lightbox].fullPath)}`}
            alt={images[lightbox].name}
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 4 }}
            onClick={e => e.stopPropagation()}
          />
          {lightbox > 0 && (
            <button
              style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 24, borderRadius: 4, padding: '8px 14px', cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); setLightbox(lightbox - 1); }}
            >‹</button>
          )}
          {lightbox < images.length - 1 && (
            <button
              style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 24, borderRadius: 4, padding: '8px 14px', cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); setLightbox(lightbox + 1); }}
            >›</button>
          )}
          <button
            style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer' }}
            onClick={() => setLightbox(null)}
          >⊗</button>
        </div>
      )}
    </div>
  );
}
