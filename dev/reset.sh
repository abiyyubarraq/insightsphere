#!/usr/bin/env bash
# Deletes this project's containers and volumes, then starts fresh.
# Qdrant vectors are destroyed. Supabase is untouched.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

echo "This deletes all Qdrant collections and every processed embedding."
echo "Supabase data and uploaded files are NOT affected."
echo
read -r -p "Type 'yes' to continue: " confirm
[ "$confirm" = "yes" ] || { echo "Cancelled."; exit 0; }

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running."
  exit 1
fi

# Scoped to this compose project only. A bare `docker system prune -af --volumes`
# would delete unrelated images and volumes across the whole machine.
echo "Removing this project's containers and volumes..."
docker compose down --volumes --remove-orphans

exec ./start.sh "$@"
