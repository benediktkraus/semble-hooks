#!/usr/bin/env bash
# idle-reindex.sh — Re-index all Git repos when server is idle
# Runs with minimal CPU/IO priority. Skips if load is above threshold.
# Usage: ./idle-reindex.sh [--force]

set -u

SEMBLE="${SEMBLE_PATH:-/root/.local/bin/semble}"
PROJECT_BASE="${SEMBLE_HOOKS_PROJECT_BASE:-/mnt/onedrive/Workspace/projects}"
LOAD_THRESHOLD="${SEMBLE_HOOKS_LOAD_THRESHOLD:-2.0}"
INDEX_MAX_AGE_HOURS="${SEMBLE_HOOKS_INDEX_MAX_AGE:-6}"
LOCK_DIR="/tmp/semble-hooks-locks"
LOG="/root/.semble-hooks/logs/idle-reindex.log"
FORCE="${1:-}"

mkdir -p "$(dirname "$LOG")" "$LOCK_DIR"

log() { echo "$(date '+%Y-%m-%dT%H:%M:%S') $*" >> "$LOG"; }

check_load() {
  local load
  load=$(awk '{print $1}' /proc/loadavg)
  local ok
  ok=$(awk "BEGIN{print ($load < $LOAD_THRESHOLD) ? 1 : 0}")
  if [[ "$ok" != "1" ]]; then
    log "SKIP load=$load threshold=$LOAD_THRESHOLD"
    return 1
  fi
  return 0
}

index_stale() {
  local repo="$1"
  local semble_dir="$repo/.semble"
  if [[ ! -d "$semble_dir" ]]; then return 0; fi
  local age_seconds
  age_seconds=$(( $(date +%s) - $(stat -c %Y "$semble_dir" 2>/dev/null || echo 0) ))
  local max_seconds=$(( INDEX_MAX_AGE_HOURS * 3600 ))
  [[ $age_seconds -gt $max_seconds ]]
}

reindex_repo() {
  local repo="$1"
  local name
  name=$(basename "$repo")
  local lockfile="$LOCK_DIR/semble-${name}.lock"

  if [[ -f "$lockfile" ]]; then
    local age=$(( $(date +%s) - $(stat -c %Y "$lockfile" 2>/dev/null || echo 0) ))
    if [[ $age -lt 60 ]]; then
      log "LOCKED $name (age=${age}s)"
      return 0
    fi
    rm -f "$lockfile"
  fi

  touch "$lockfile"
  local start=$SECONDS
  nice -n 19 ionice -c3 "$SEMBLE" search "main entry point" "$repo" -k 1 >/dev/null 2>&1
  local elapsed=$(( SECONDS - start ))
  rm -f "$lockfile"
  log "INDEXED $name elapsed=${elapsed}s"
}

# Main
if [[ "$FORCE" != "--force" ]]; then
  check_load || exit 0
fi

if ! command -v "$SEMBLE" &>/dev/null; then
  log "ERROR semble not found at $SEMBLE"
  exit 1
fi

log "START base=$PROJECT_BASE"
count=0

for repo in "$PROJECT_BASE"/*/; do
  [[ ! -d "$repo/.git" ]] && continue

  if [[ "$FORCE" != "--force" ]]; then
    check_load || { log "ABORT load spike after $count repos"; break; }
  fi

  if [[ "$FORCE" != "--force" ]] && ! index_stale "$repo"; then
    continue
  fi

  reindex_repo "$repo"
  count=$((count + 1))
  sleep 2
done

log "DONE repos=$count"
