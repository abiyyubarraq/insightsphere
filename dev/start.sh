#!/usr/bin/env bash
# Starts the local backend stack (qdrant, doc-parser, api).
# Runs from anywhere: it resolves its own directory first.
#
#   ./dev/start.sh            start, reusing cached images
#   ./dev/start.sh --rebuild  force a rebuild first
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -f .env ]; then
  echo "dev/.env not found."
  echo "  cp dev/.env.example dev/.env   then fill in the Supabase and OpenAI values"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running."
  exit 1
fi

if [ "${1:-}" = "--rebuild" ]; then
  echo "Rebuilding images..."
  docker compose build
fi

echo "Starting services..."
docker compose up -d --remove-orphans

echo "Waiting for health checks..."
deadline=$(( SECONDS + 180 ))
while [ $SECONDS -lt $deadline ]; do
  # Ask docker for health rather than curl: the images have no HTTP client.
  pending=$(docker compose ps --format '{{.Status}}' | grep -c -E 'starting|unhealthy' || true)
  [ "$pending" -eq 0 ] && break
  sleep 5
done

echo
docker compose ps --format 'table {{.Name}}\t{{.Status}}'
echo
if docker compose ps --format '{{.Status}}' | grep -q -E 'starting|unhealthy'; then
  echo "Some services are not healthy. Check: docker compose -f dev/compose.yaml logs"
  exit 1
fi

cat <<'EOF'

Ready.

  API      http://localhost:8000     (health: /health)
  Parser   http://localhost:8080     (internal use)
  Qdrant   http://localhost:6333/dashboard

Start the frontend separately:

  cd frontend && npm run start       http://localhost:5173

Useful:
  docker compose -f dev/compose.yaml logs -f
  docker compose -f dev/compose.yaml restart api     after changing API code
  docker compose -f dev/compose.yaml watch           rebuild Go on change (run in its own terminal)
  ./dev/reset.sh                                     wipe this project's data and start over
EOF
