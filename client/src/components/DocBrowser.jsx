import { useState, useEffect } from 'react';

const ICONS = {
  pdf: '📄', doc: '📝', docx: '📝', pages: '📝',
  xls: '📊', xlsx: '📊', numbers: '📊', csv: '📊',
  ppt: '📋', pptx: '📋', keynote: '📋',
  ai: '🎨', psd: '🎨', indd: '🎨',
  zip: '🗜', epub: '📖', txt: '📃', md: '📃',
};

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function DocBrowser() {
  const [categories, setCategories] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [files, setFiles] = useState([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetch('/docs').then(r => r.json()).then(setCategories);
  }, []);

  function selectCat(cat) {
    setSelectedCat(cat);
    setFilter('');
    fetch(`/docs/${encodeURIComponent(cat)}`).then(r => r.json()).then(setFiles);
  }

  function openFile(cat, filePath) {
    window.open(`/doc/${encodeURIComponent(cat)}?file=${encodeURIComponent(filePath)}`, '_blank');
  }

  const filtered = filter
    ? files.filter(f => f.name.toLowerCase().includes(filter.toLowerCase()))
    : files;

  return (
    <div className="doc-browser">
      {!selectedCat ? (
        <div className="cat-grid">
          {categories.map(cat => (
            <div key={cat.name} className="cat-card" onClick={() => selectCat(cat.name)}>
              <span className="cat-icon">🗂</span>
              <span className="cat-name">{cat.name}</span>
              <span className="cat-count">{cat.count} items</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="file-list">
          <div className="file-filter">
            <input
              autoFocus
              type="text"
              placeholder={`Filter ${selectedCat}…`}
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>
          <div className="file-rows">
            {filtered.map(f => (
              <div key={f.path} className="file-row" onClick={() => openFile(selectedCat, f.path)}>
                <span className="file-icon">{ICONS[f.ext] || '📄'}</span>
                <span className="file-name">{f.name}</span>
                <span className="file-meta">{formatDate(f.modified)}</span>
                <span className="file-size">{formatSize(f.size)}</span>
              </div>
            ))}
            {filtered.length === 0 && <div className="empty">No files match "{filter}"</div>}
          </div>
        </div>
      )}
    </div>
  );
}
