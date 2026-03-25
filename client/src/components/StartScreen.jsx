import { useState, useEffect } from 'react';

const SECTION_LABELS = {
  photos: 'Photos', docs: 'Documents', archive: 'Archive',
  studio: 'Studio', videos: 'Videos',
};

export default function StartScreen({ onReady }) {
  const [health, setHealth] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [waitingForMount, setWaitingForMount] = useState(false);

  function checkHealth() {
    fetch('/health')
      .then(r => r.json())
      .then(h => {
        setHealth(h);
        // Auto-proceed if drives are up, or nothing is configured
        const nothingConfigured = ['photos','docs','archive','studio','videos'].every(k => h[k] === null) && !h.shots?.length;
        if (isHealthy(h) || nothingConfigured) onReady();
      })
      .catch(() => {
        // Server not ready yet — retry in 1s
        setTimeout(checkHealth, 1000);
      });
  }

  useEffect(() => {
    checkHealth();
  }, []);

  // Poll while waiting for NAS to mount
  useEffect(() => {
    if (!waitingForMount) return;
    const interval = setInterval(() => {
      fetch('/health').then(r => r.json()).then(h => {
        setHealth(h);
        if (isHealthy(h)) { setWaitingForMount(false); onReady(); }
      }).catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [waitingForMount]);

  function isHealthy(h) {
    if (!h) return false;
    return ['photos', 'docs', 'archive', 'studio', 'videos'].some(k => h[k] === true)
      || (h.shots || []).some(s => s.ok);
  }

  function serverReachable(h) {
    // Server responded — at least show the UI even if all drives are offline
    return h !== null;
  }

  function handleConnect() {
    setConnecting(true);
    fetch('/nas/connect', { method: 'POST' })
      .then(() => { setConnecting(false); setWaitingForMount(true); })
      .catch(() => setConnecting(false));
  }

  const mainSections = health
    ? ['photos', 'docs', 'archive', 'studio', 'videos'].filter(k => health[k] !== null)
    : [];
  const onlineCount = mainSections.filter(k => health?.[k] === true).length;
  const hasNas = health?.nas?.length > 0;
  const allOffline = mainSections.length > 0 && onlineCount === 0;

  return (
    <div className="start-screen">
      <div className="start-card">
        <div className="start-logo">H</div>
        <div className="start-title">Harkive</div>

        {!health && (
          <div className="start-status-msg">Checking drives…</div>
        )}

        {health && (
          <>
            <div className="start-drives">
              {mainSections.map(k => (
                <div key={k} className="start-drive-row">
                  <span className={`start-drive-dot ${health[k] ? 'online' : 'offline'}`} />
                  <span className="start-drive-label">{SECTION_LABELS[k]}</span>
                  <span className="start-drive-status">{health[k] ? 'Mounted' : 'Offline'}</span>
                </div>
              ))}
              {(health.shots || []).map((s, i) => (
                <div key={i} className="start-drive-row">
                  <span className={`start-drive-dot ${s.ok ? 'online' : 'offline'}`} />
                  <span className="start-drive-label" style={{ fontSize: 11 }}>{s.path.split('/').pop()}</span>
                  <span className="start-drive-status">{s.ok ? 'Mounted' : 'Offline'}</span>
                </div>
              ))}
            </div>

            {allOffline && hasNas && (
              <div className="start-offline-msg">
                NAS not connected. Connect to mount your drives.
              </div>
            )}

            <div className="start-actions">
              {hasNas && (
                <button
                  className={`start-btn-connect${connecting || waitingForMount ? ' loading' : ''}`}
                  onClick={handleConnect}
                  disabled={connecting || waitingForMount}
                >
                  {connecting ? 'Connecting…' : waitingForMount ? 'Mounting…' : 'Connect NAS'}
                </button>
              )}
              <button
                className="start-btn-open"
                onClick={onReady}
                disabled={allOffline && !onlineCount}
              >
                {onlineCount > 0 ? 'Open Harkive' : 'Open anyway'}
              </button>
            </div>

            {waitingForMount && (
              <div className="start-waiting">Waiting for drives to mount…</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
