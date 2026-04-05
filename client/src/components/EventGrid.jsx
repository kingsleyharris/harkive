import ShimmerImg from './ShimmerImg';

export default function EventGrid({ year, events, api, onSelect }) {
  return (
    <div className="event-grid">
      {events.map(event => (
        <div key={event.name} className="event-card" onClick={() => onSelect(event)}>
          {event.coverPath ? (
            <ShimmerImg
              src={`/cover?path=${encodeURIComponent(event.coverPath)}`}
              alt={event.name}
              aspectRatio="4/3"
            />
          ) : (
            <div className="event-no-cover" />
          )}
          <div className="event-info">
            <span className="event-name">{event.name.replace(/^\d{4}-?\d{0,2}_?/, '').replace(/-/g, ' ')}</span>
            <span className="event-count">{event.count}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
