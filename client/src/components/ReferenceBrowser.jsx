import { useState, useEffect } from 'react';
import ShimmerImg from './ShimmerImg';

export default function ReferenceBrowser() {
  const [items, setItems]       = useState(null);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    fetch('/knowledge').then(r => r.json()).then(setItems).catch(() => setItems([]));
  }, []);

  function remove(id) {
    fetch(`/knowledge/${id}`, { method: 'DELETE' }).then(() => setItems(prev => prev.filter(i => i.id !== id)));
  }

  const images = (items || []).filter(i => i.source === 'dropbox' && /\.(png|jpe?g|gif|webp)$/i.test(i.path));

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, marginBottom: 4 }}>References</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Curated items from across your archive.</div>
      </div>

      {!items && <div className="empty-state">Loading…</div>}
      {items && items.length === 0 && (
        <div className="empty-state">No references yet. Save items from Dropbox to pin them here.</div>
      )}

      {items && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.map((item, i) => (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 14,
                padding: '12px 14px', borderRadius: 8,
                background: 'var(--surface)',
                cursor: images.indexOf(item) >= 0 ? 'pointer' : 'default',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
              onClick={() => { const idx = images.indexOf(item); if (idx >= 0) setLightbox(idx); }}
            >
              {/* Thumbnail */}
              {item.source === 'dropbox' && /\.(png|jpe?g|gif|webp)$/i.test(item.path) && (
                <div style={{ flexShrink: 0, width: 64, height: 64, borderRadius: 6, overflow: 'hidden', background: 'var(--bg)' }}>
                  <ShimmerImg
                    src={`/dropbox/file?path=${encodeURIComponent(item.path)}`}
                    alt={item.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              )}

              {/* Meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: item.notes ? 6 : 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.source} · {item.path}
                </div>
                {item.notes && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {item.notes}
                  </div>
                )}
                {item.tags?.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                    {item.tags.map(t => (
                      <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Remove */}
              <button
                style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 16, cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}
                onClick={e => { e.stopPropagation(); remove(item.id); }}
                title="Remove"
              >⊗</button>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox !== null && images[lightbox] && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setLightbox(null)}
        >
          <img
            src={`/dropbox/file?path=${encodeURIComponent(images[lightbox].path)}`}
            alt={images[lightbox].title}
            style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 4, cursor: images.length > 1 ? 'pointer' : 'default' }}
            onClick={e => {
              e.stopPropagation();
              const { left, width } = e.currentTarget.getBoundingClientRect();
              if (e.clientX - left < width / 2) { if (lightbox > 0) setLightbox(lightbox - 1); }
              else { if (lightbox < images.length - 1) setLightbox(lightbox + 1); }
            }}
          />
          <div style={{ position: 'absolute', bottom: 28, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
            {images[lightbox].title}
          </div>
          {lightbox > 0 && (
            <button style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 24, borderRadius: 4, padding: '8px 14px', cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); setLightbox(lightbox - 1); }}>‹</button>
          )}
          {lightbox < images.length - 1 && (
            <button style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 24, borderRadius: 4, padding: '8px 14px', cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); setLightbox(lightbox + 1); }}>›</button>
          )}
          <button style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer' }}
            onClick={() => setLightbox(null)}>⊗</button>
        </div>
      )}
    </div>
  );
}
