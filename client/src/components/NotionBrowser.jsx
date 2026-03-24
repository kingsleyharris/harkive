import { useState, useEffect } from 'react';

function BlockRenderer({ block }) {
  const t = block.type;
  const text = (arr) => (arr || []).map((r, i) => {
    let s = r.plain_text;
    if (r.annotations?.bold) s = <strong key={i}>{s}</strong>;
    else if (r.annotations?.italic) s = <em key={i}>{s}</em>;
    else if (r.annotations?.code) s = <code key={i} style={{ background: 'rgba(0,0,0,0.06)', borderRadius: 3, padding: '1px 4px', fontFamily: 'monospace' }}>{s}</code>;
    else s = <span key={i}>{s}</span>;
    return s;
  });

  if (t === 'paragraph') return <p className="notion-p">{text(block.paragraph.rich_text)}</p>;
  if (t === 'heading_1') return <h1 className="notion-h1">{text(block.heading_1.rich_text)}</h1>;
  if (t === 'heading_2') return <h2 className="notion-h2">{text(block.heading_2.rich_text)}</h2>;
  if (t === 'heading_3') return <h3 className="notion-h3">{text(block.heading_3.rich_text)}</h3>;
  if (t === 'bulleted_list_item') return <li className="notion-li">{text(block.bulleted_list_item.rich_text)}</li>;
  if (t === 'numbered_list_item') return <li className="notion-li">{text(block.numbered_list_item.rich_text)}</li>;
  if (t === 'to_do') return (
    <div className="notion-todo">
      <input type="checkbox" readOnly checked={block.to_do.checked} />
      <span style={{ textDecoration: block.to_do.checked ? 'line-through' : 'none', color: block.to_do.checked ? 'var(--text-tertiary)' : 'inherit' }}>
        {text(block.to_do.rich_text)}
      </span>
    </div>
  );
  if (t === 'code') return (
    <pre className="notion-code"><code>{block.code.rich_text.map(r => r.plain_text).join('')}</code></pre>
  );
  if (t === 'quote') return <blockquote className="notion-quote">{text(block.quote.rich_text)}</blockquote>;
  if (t === 'divider') return <hr className="notion-divider" />;
  if (t === 'callout') return (
    <div className="notion-callout">
      <span>{block.callout.icon?.emoji}</span>
      <span>{text(block.callout.rich_text)}</span>
    </div>
  );
  return null;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function NotionBrowser() {
  const [configured, setConfigured] = useState(null);
  const [pages, setPages] = useState([]);
  const [databases, setDatabases] = useState([]);
  const [selected, setSelected] = useState(null);   // { type: 'page'|'db', id, title }
  const [content, setContent] = useState(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('pages'); // 'pages' | 'databases'

  useEffect(() => {
    fetch('/notion/token-check').then(r => r.json()).then(d => {
      setConfigured(d.configured);
      if (d.configured) {
        fetch('/notion/pages').then(r => r.json()).then(setPages);
        fetch('/notion/databases').then(r => r.json()).then(setDatabases);
      }
    });
  }, []);

  function openPage(page) {
    setSelected({ type: 'page', ...page });
    setContent(null);
    setLoading(true);
    fetch(`/notion/page/${page.id}`).then(r => r.json()).then(d => { setContent(d); setLoading(false); });
  }

  function openDb(db) {
    setSelected({ type: 'db', ...db });
    setContent(null);
    setLoading(true);
    fetch(`/notion/db/${db.id}`).then(r => r.json()).then(d => { setContent(d); setLoading(false); });
  }

  if (configured === false) {
    return (
      <div>
        <div className="breadcrumb" style={{ marginBottom: 24 }}>
          <span className="crumb active">Notion</span>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 480 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Connect Notion</div>
          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
            Set your Notion integration token to browse your workspace in Harkive.
          </div>
          <ol style={{ color: 'var(--text-secondary)', lineHeight: 2, paddingLeft: 18, marginBottom: 16 }}>
            <li>Go to <strong>notion.so/my-integrations</strong></li>
            <li>Create a new integration, copy the token</li>
            <li>Share the pages you want with the integration</li>
            <li>Restart the server with:<br />
              <code style={{ background: 'rgba(0,0,0,0.06)', borderRadius: 4, padding: '2px 8px', fontFamily: 'monospace', fontSize: 12 }}>
                NOTION_TOKEN=secret_xxx node index.js
              </code>
            </li>
          </ol>
        </div>
      </div>
    );
  }

  if (configured === null) return <div className="empty-state">Connecting…</div>;

  const filteredPages = pages.filter(p => p.title.toLowerCase().includes(filter.toLowerCase()));
  const filteredDbs = databases.filter(d => d.title.toLowerCase().includes(filter.toLowerCase()));

  // Page detail view
  if (selected?.type === 'page') {
    return (
      <div>
        <div className="breadcrumb" style={{ marginBottom: 24 }}>
          <span className="crumb" onClick={() => { setSelected(null); setContent(null); }}>Notion</span>
          <span className="sep">/</span>
          <span className="crumb active">{selected.icon} {selected.title}</span>
        </div>
        {loading && <div className="empty-state">Loading…</div>}
        {content && (
          <div className="notion-page">
            <div className="notion-page-title">
              {content.icon && <span style={{ marginRight: 10 }}>{content.icon}</span>}
              {content.title}
            </div>
            <div className="notion-body">
              {content.blocks.map((b, i) => <BlockRenderer key={b.id || i} block={b} />)}
              {content.blocks.length === 0 && <div style={{ color: 'var(--text-tertiary)' }}>Empty page</div>}
            </div>
            <a href={content.url} target="_blank" rel="noreferrer" className="notion-open-link">
              Open in Notion ↗
            </a>
          </div>
        )}
      </div>
    );
  }

  // Database detail view
  if (selected?.type === 'db') {
    const rows = Array.isArray(content) ? content : [];
    const cols = rows.length ? Object.keys(rows[0].properties) : [];
    return (
      <div>
        <div className="breadcrumb" style={{ marginBottom: 24 }}>
          <span className="crumb" onClick={() => { setSelected(null); setContent(null); }}>Notion</span>
          <span className="sep">/</span>
          <span className="crumb active">{selected.icon} {selected.title}</span>
        </div>
        {loading && <div className="empty-state">Loading…</div>}
        {!loading && rows.length > 0 && (
          <div className="notion-table-wrap">
            <table className="notion-table">
              <thead>
                <tr>{cols.map(c => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    {cols.map(c => {
                      const v = row.properties[c];
                      const display = Array.isArray(v) ? v.join(', ') : v === null ? '' : String(v);
                      return <td key={c}>{display}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && rows.length === 0 && <div className="empty-state">No rows found.</div>}
      </div>
    );
  }

  // Index view
  return (
    <div>
      <div className="breadcrumb" style={{ marginBottom: 24 }}>
        <span className="crumb active">Notion</span>
      </div>

      <div className="doc-filter" style={{ marginBottom: 20 }}>
        <input
          className="filter-input"
          type="text"
          placeholder="Filter…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className={`notion-tab${view === 'pages' ? ' active' : ''}`} onClick={() => setView('pages')}>
          Pages {pages.length > 0 && <span className="notion-count">{pages.length}</span>}
        </button>
        <button className={`notion-tab${view === 'databases' ? ' active' : ''}`} onClick={() => setView('databases')}>
          Databases {databases.length > 0 && <span className="notion-count">{databases.length}</span>}
        </button>
      </div>

      {view === 'pages' && (
        <div className="notion-list">
          {filteredPages.length === 0 && <div className="empty-state">No pages found.</div>}
          {filteredPages.map(p => (
            <div key={p.id} className="notion-row" onClick={() => openPage(p)}>
              <span className="notion-icon">{p.icon || '📄'}</span>
              <div className="notion-row-meta">
                <span className="notion-row-title">{p.title || 'Untitled'}</span>
                <span className="notion-row-date">{formatDate(p.lastEdited)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'databases' && (
        <div className="notion-list">
          {filteredDbs.length === 0 && <div className="empty-state">No databases found.</div>}
          {filteredDbs.map(d => (
            <div key={d.id} className="notion-row" onClick={() => openDb(d)}>
              <span className="notion-icon">{d.icon || '🗄️'}</span>
              <div className="notion-row-meta">
                <span className="notion-row-title">{d.title || 'Untitled'}</span>
                <span className="notion-row-date">{formatDate(d.lastEdited)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
