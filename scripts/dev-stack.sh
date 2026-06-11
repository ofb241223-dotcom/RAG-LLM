#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime"
LOG_DIR="$RUNTIME_DIR/logs"
PID_DIR="$RUNTIME_DIR/pids"

load_env_file() {
  local env_file="$1"
  [[ -f "$env_file" ]] || return

  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
    key="${line%%=*}"
    value="${line#*=}"
    if [[ -z "${!key+x}" ]]; then
      export "$key=$value"
    fi
  done <"$env_file"
}

load_env_file "$ROOT_DIR/.env"

BACKEND_PORT="${BACKEND_PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-5176}"
RAG_SERVICE_PORT="${RAG_SERVICE_PORT:-8000}"
BACKEND_PROFILE="${BACKEND_PROFILE:-}"
VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://127.0.0.1:${BACKEND_PORT}/api}"
RAG_SERVICE_URL="${RAG_SERVICE_URL:-http://127.0.0.1:${RAG_SERVICE_PORT}}"

mkdir -p "$LOG_DIR" "$PID_DIR"

pid_file() {
  printf '%s/%s.pid' "$PID_DIR" "$1"
}

profile_file() {
  printf '%s/%s.profile' "$PID_DIR" "$1"
}

log_file() {
  printf '%s/%s.log' "$LOG_DIR" "$1"
}

is_running() {
  local file="$1"
  [[ -f "$file" ]] && kill -0 "$(cat "$file")" 2>/dev/null
}

start_process() {
  local name="$1"
  shift
  local pidfile
  pidfile="$(pid_file "$name")"
  if is_running "$pidfile"; then
    printf '%s already running, pid=%s\n' "$name" "$(cat "$pidfile")"
    return
  fi

  if command -v setsid >/dev/null 2>&1; then
    nohup setsid "$@" >"$(log_file "$name")" 2>&1 </dev/null &
  else
    nohup "$@" >"$(log_file "$name")" 2>&1 </dev/null &
  fi
  echo "$!" >"$pidfile"
  printf 'started %s, pid=%s, log=%s\n' "$name" "$(cat "$pidfile")" "$(log_file "$name")"
}

start_backend() {
  local profile_arg=""
  if [[ -n "$BACKEND_PROFILE" ]]; then
    profile_arg=" -Dspring-boot.run.profiles='$BACKEND_PROFILE'"
  fi
  printf '%s\n' "${BACKEND_PROFILE:-default}" >"$(profile_file backend)"
  start_process backend bash -lc "cd '$ROOT_DIR/backend' && RAG_SERVICE_URL='$RAG_SERVICE_URL' mvn spring-boot:run$profile_arg -Dspring-boot.run.arguments='--server.port=$BACKEND_PORT'"
}

start_frontend() {
  start_process frontend bash -lc "cd '$ROOT_DIR/frontend' && VITE_API_BASE_URL='$VITE_API_BASE_URL' npm run dev -- --host 0.0.0.0 --port '$FRONTEND_PORT'"
}

start_rag_service() {
  local uvicorn_cmd="$ROOT_DIR/rag-service/.venv/bin/uvicorn"
  if [[ ! -x "$uvicorn_cmd" ]]; then
    uvicorn_cmd="python -m uvicorn"
  fi
  start_process rag-service bash -lc "cd '$ROOT_DIR/rag-service' && $uvicorn_cmd rag_service.main:app --host 0.0.0.0 --port '$RAG_SERVICE_PORT'"
}

stop_process() {
  local name="$1"
  local pidfile
  pidfile="$(pid_file "$name")"
  if ! is_running "$pidfile"; then
    printf '%s not running\n' "$name"
    rm -f "$pidfile"
    return
  fi
  local pid
  pid="$(cat "$pidfile")"
  kill -TERM "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
  sleep 1
  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$pidfile"
  if [[ "$name" == "backend" ]]; then
    rm -f "$(profile_file backend)"
  fi
  printf 'stopped %s, pid=%s\n' "$name" "$pid"
}

status_process() {
  local name="$1"
  local pidfile
  pidfile="$(pid_file "$name")"
  if is_running "$pidfile"; then
    printf '%-12s running pid=%s log=%s\n' "$name" "$(cat "$pidfile")" "$(log_file "$name")"
  else
    printf '%-12s stopped\n' "$name"
  fi
}

status_urls() {
  printf '\nURLs:\n'
  printf '  Frontend:    http://127.0.0.1:%s/\n' "$FRONTEND_PORT"
  printf '  Backend API: http://127.0.0.1:%s/api\n' "$BACKEND_PORT"
  local active_profile="${BACKEND_PROFILE:-}"
  if [[ -z "$active_profile" && -f "$(profile_file backend)" ]]; then
    active_profile="$(cat "$(profile_file backend)")"
  fi
  if [[ -n "$active_profile" ]]; then
    printf '  Backend profile: %s\n' "$active_profile"
  else
    printf '  Backend profile: default\n'
  fi
  printf '  RAG service: http://127.0.0.1:%s\n' "$RAG_SERVICE_PORT"
}

use_h2_backend_profile() {
  BACKEND_PROFILE="dev"
  VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://127.0.0.1:${BACKEND_PORT}/api}"
}

case "${1:-start}" in
  start)
    start_backend
    start_frontend
    status_urls
    ;;
  start-all)
    start_rag_service
    start_backend
    start_frontend
    status_urls
    ;;
  start-h2)
    use_h2_backend_profile
    start_backend
    start_frontend
    status_urls
    ;;
  status)
    status_process rag-service
    status_process backend
    status_process frontend
    status_urls
    ;;
  stop)
    stop_process frontend
    stop_process backend
    ;;
  stop-all)
    stop_process frontend
    stop_process backend
    stop_process rag-service
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  restart-h2)
    "$0" stop
    "$0" start-h2
    ;;
  restart-all)
    "$0" stop-all
    "$0" start-all
    ;;
  logs)
    tail -n 80 -f "$LOG_DIR"/*.log
    ;;
  *)
    echo "Usage: $0 {start|start-all|start-h2|status|stop|stop-all|restart|restart-h2|restart-all|logs}"
    exit 2
    ;;
esac
