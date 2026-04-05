#!/usr/bin/env zsh
# Launch Harkive — starts server + client, opens browser

HARKIVE="$(cd "$(dirname "$0")" && pwd)"

# Kill any existing instances
lsof -ti :3001 | xargs kill -9 2>/dev/null
lsof -ti :5173 | xargs kill -9 2>/dev/null

# Load local env if present
[ -f "$HARKIVE/.env" ] && export $(grep -v '^#' "$HARKIVE/.env" | xargs)

# Mount NAS shares from config (reads nas.shares array)
# Requires harkive.config.js to define nas.shares
NAS_SHARES=$(node -e "try{const c=require('$HARKIVE/harkive.config.js');(c.nas?.shares||[]).forEach(s=>console.log(s))}catch(_){}" 2>/dev/null)
if [ -n "$NAS_SHARES" ]; then
  echo "$NAS_SHARES" | while read -r share_url; do
    mount_name=$(basename "$share_url")
    if ! mount | grep -q "/Volumes/$mount_name"; then
      echo "Mounting $mount_name..."
      open "$share_url"
    fi
  done
fi

# Start server
node "$HARKIVE/server/index.js" &
SERVER_PID=$!

# Start client
cd "$HARKIVE/client" && npm run dev &
CLIENT_PID=$!

# Wait for client to be ready, then open browser
sleep 3 && open http://localhost:5173 &

echo "Harkive running — server PID $SERVER_PID, client PID $CLIENT_PID"
echo "Press Ctrl+C to stop both."

trap "kill $SERVER_PID $CLIENT_PID 2>/dev/null; echo 'Harkive stopped.'" INT TERM
wait $CLIENT_PID
