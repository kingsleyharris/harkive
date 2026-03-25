import { useState } from 'react';

export default function DriveOffline({ label = 'This section' }) {
  const [state, setState] = useState('idle'); // idle | connecting | waiting

  function connect() {
    setState('connecting');
    fetch('/nas/connect', { method: 'POST' })
      .then(() => setState('waiting'))
      .catch(() => setState('idle'));
  }

  function retry() {
    window.location.reload();
  }

  return (
    <div className="drive-offline">
      <div className="drive-offline-icon">⊘</div>
      <div className="drive-offline-title">{label} is offline</div>
      <div className="drive-offline-msg">Connect to your NAS to access this content.</div>
      <div className="drive-offline-actions">
        {state === 'idle' && (
          <button className="drive-offline-btn primary" onClick={connect}>Connect NAS</button>
        )}
        {state === 'connecting' && (
          <button className="drive-offline-btn primary" disabled>Connecting…</button>
        )}
        {state === 'waiting' && (
          <button className="drive-offline-btn primary" onClick={retry}>Refresh</button>
        )}
      </div>
      {state === 'waiting' && (
        <div className="drive-offline-hint">Drives are mounting — click Refresh when ready.</div>
      )}
    </div>
  );
}
