export default function YearGrid({ years, onSelect }) {
  return (
    <div className="year-grid">
      {years.map(year => (
        <div key={year} className="year-card" onClick={() => onSelect(year)}>
          <span className="year-label">{year}</span>
        </div>
      ))}
    </div>
  );
}
