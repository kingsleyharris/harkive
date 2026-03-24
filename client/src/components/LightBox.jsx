import { useEffect } from 'react';

export default function LightBox({ photos, index, year, event, api, onClose, onChange }) {
  const photo = photos[index];

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < photos.length - 1) onChange(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onChange(index - 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length]);

  // Skip non-displayable files when navigating
  const displayable = photos.filter(p => p.displayable);
  const displayIndex = displayable.findIndex(p => p.fullPath === photo?.fullPath);

  if (!photo || !photo.displayable) return null;

  const src = `/image?path=${encodeURIComponent(photo.fullPath)}`;

  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lb-close" onClick={onClose}>✕</button>
      {index > 0 && (
        <button className="lb-prev" onClick={e => { e.stopPropagation(); onChange(index - 1); }}>‹</button>
      )}
      <div className="lb-content" onClick={e => e.stopPropagation()}>
        {photo.type === 'video' ? (
          <video src={src} controls autoPlay />
        ) : (
          <img src={src} alt={photo.name} />
        )}
      </div>
      {index < photos.length - 1 && (
        <button className="lb-next" onClick={e => { e.stopPropagation(); onChange(index + 1); }}>›</button>
      )}
      <div className="lb-counter">{index + 1} / {photos.length}</div>
    </div>
  );
}
