import { useEffect, useState } from 'react';

export default function LightBox({ photos, index, year, event, api, onClose, onChange }) {
  const photo = photos[index];
  const [cursorSide, setCursorSide] = useState(null); // 'left' | 'right'

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < photos.length - 1) onChange(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onChange(index - 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length]);

  if (!photo || !photo.displayable) return null;

  const src = `/image?path=${encodeURIComponent(photo.fullPath)}`;
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  function handleImgClick(e) {
    e.stopPropagation();
    const { left, width } = e.currentTarget.getBoundingClientRect();
    if (e.clientX - left < width / 2) { if (hasPrev) onChange(index - 1); }
    else { if (hasNext) onChange(index + 1); }
  }

  function handleImgMove(e) {
    const { left, width } = e.currentTarget.getBoundingClientRect();
    setCursorSide(e.clientX - left < width / 2 ? 'left' : 'right');
  }

  function imgCursor() {
    if (cursorSide === 'left') return hasPrev ? 'w-resize' : 'default';
    if (cursorSide === 'right') return hasNext ? 'e-resize' : 'default';
    return 'default';
  }

  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lb-close" onClick={onClose}>✕</button>
      {hasPrev && (
        <button className="lb-prev" onClick={e => { e.stopPropagation(); onChange(index - 1); }}>‹</button>
      )}
      <div className="lb-content" onClick={e => e.stopPropagation()}>
        {photo.type === 'video' ? (
          <video src={src} controls autoPlay />
        ) : (
          <img
            src={src}
            alt={photo.name}
            style={{ cursor: imgCursor() }}
            onClick={handleImgClick}
            onMouseMove={handleImgMove}
            onMouseLeave={() => setCursorSide(null)}
          />
        )}
      </div>
      {hasNext && (
        <button className="lb-next" onClick={e => { e.stopPropagation(); onChange(index + 1); }}>›</button>
      )}
      <div className="lb-counter">{index + 1} / {photos.length}</div>
    </div>
  );
}
