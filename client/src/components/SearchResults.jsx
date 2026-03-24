const ICONS = {
  pdf: '📄', doc: '📝', docx: '📝', pages: '📝',
  xls: '📊', xlsx: '📊', numbers: '📊', csv: '📊',
  ai: '🎨', psd: '🎨', epub: '📖', txt: '📃',
};

export default function SearchResults({ results, onSelectEvent, api }) {
  const { events, docs } = results;

  if (!events.length && !docs.length) {
    return <div className="empty">No results</div>;
  }

  return (
    <div className="search-results">
      {events.length > 0 && (
        <section>
          <h3 className="results-heading">Photos</h3>
          <div className="event-grid">
            {events.map(e => (
              <div key={`${e.year}/${e.name}`} className="event-card" onClick={() => onSelectEvent(e)}>
                {e.cover ? (
                  <img
                    src={`${api}/image/${e.year}/${encodeURIComponent(e.name)}/${encodeURIComponent(e.cover)}`}
                    loading="lazy"
                    alt={e.name}
                  />
                ) : (
                  <div className="event-no-cover" />
                )}
                <div className="event-info">
                  <span className="event-name">{e.name.replace(/^\d{4}-?\d{0,2}_?/, '').replace(/-/g, ' ')}</span>
                  <span className="event-count">{e.year} · {e.count}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {docs.length > 0 && (
        <section>
          <h3 className="results-heading">Documents</h3>
          <div className="file-rows">
            {docs.map(f => (
              <div key={`${f.category}/${f.path}`} className="file-row"
                onClick={() => window.open(`/doc/${encodeURIComponent(f.category)}?file=${encodeURIComponent(f.path)}`, '_blank')}>
                <span className="file-icon">{ICONS[f.ext] || '📄'}</span>
                <span className="file-name">{f.name}</span>
                <span className="file-meta">{f.category}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
