#!/usr/bin/env zsh
# Launch Harkive — starts server + client, opens browser

HARKIVE=/Users/kingsley/harkive

# Kill any existing instances
lsof -ti :3001 | xargs kill -9 2>/dev/null
lsof -ti :5173 | xargs kill -9 2>/dev/null

# Load local env if present
[ -f "$HARKIVE/.env" ] && export $(grep -v '^#' "$HARKIVE/.env" | xargs)

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
