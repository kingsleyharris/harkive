import { useState } from 'react';

/**
 * Drop-in replacement for <img> that shows a shimmer while loading/broken.
 *
 * Props:
 *   src, alt, loading   — forwarded to <img>
 *   aspectRatio         — e.g. "4/3". Sets wrapper aspect-ratio; img fills it.
 *   natural             — true for masonry/auto-height images (shot cards)
 *   style               — applied to the wrapper div
 *   imgStyle            — applied to the <img>
 */
export default function ShimmerImg({ src, alt, loading: lazy = 'lazy', aspectRatio, natural, style, imgStyle }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const wrapStyle = {
    position: 'relative',
    width: '100%',
    height: natural ? 'auto' : '100%',
    minHeight: natural ? 80 : undefined,
    ...(aspectRatio ? { aspectRatio, height: undefined } : {}),
    ...style,
  };

  const iStyle = {
    display: 'block',
    width: '100%',
    height: natural ? 'auto' : '100%',
    objectFit: natural ? undefined : 'cover',
    opacity: loaded ? 1 : 0,
    transition: 'opacity 0.25s',
    ...imgStyle,
  };

  return (
    <div style={wrapStyle}>
      {!loaded && (
        <div
          className="shimmer"
          style={{ position: 'absolute', inset: 0, borderRadius: 'inherit' }}
          aria-hidden
        />
      )}
      <img
        src={src}
        alt={alt}
        loading={lazy}
        style={iStyle}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
      />
    </div>
  );
}
