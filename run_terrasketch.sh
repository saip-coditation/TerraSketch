#!/usr/bin/env bash
# TerraSketch launcher — opens 3 separate terminal windows:
#   1. Backend  (uvicorn :8010)
#   2. Frontend (Vite :5173)
#   3. ngrok tunnel → matrix-filing-uncanny.ngrok-free.dev
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
NGROK_BIN="/home/admin1/Desktop/happy_birthday_project/ngrok"

# Load NGROK_DOMAIN from backend/.env
NGROK_DOMAIN=""
if [[ -f "$BACKEND_DIR/.env" ]]; then
  NGROK_DOMAIN="$(grep -E '^NGROK_DOMAIN=' "$BACKEND_DIR/.env" | cut -d= -f2- | tr -d '[:space:]')" || true
fi

USE_TUNNEL=1
INLINE=0

for arg in "$@"; do
  case "$arg" in
    --no-tunnel) USE_TUNNEL=0 ;;
    --inline)    INLINE=1 ;;
    -h|--help)
      echo "Usage: $0 [--no-tunnel] [--inline]"
      echo "  (default)   Opens 3 gnome-terminal windows: backend, frontend, ngrok."
      echo "  --inline    Run all 3 in the current terminal (VS Code friendly)."
      echo "  --no-tunnel Only backend + frontend, no ngrok."
      exit 0 ;;
  esac
done

# ── Guards ───────────────────────────────────────────────────────────────────

if [[ ! -d "$BACKEND_DIR" || ! -d "$FRONTEND_DIR" ]]; then
  echo "ERROR: backend or frontend folder not found under $PROJECT_ROOT"; exit 1
fi

if [[ ! -f "$BACKEND_DIR/.venv/bin/activate" ]]; then
  echo "ERROR: Python venv not found. Run:"
  echo "  cd $BACKEND_DIR && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi

if [[ ! -f "$FRONTEND_DIR/.env" ]]; then
  cp "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env"
fi

# ── Commands for each window ─────────────────────────────────────────────────

backend_cmd="cd '$BACKEND_DIR' && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8010; echo; echo '--- Backend stopped. Press Enter to close ---'; read"

frontend_cmd="cd '$FRONTEND_DIR' && npm run dev -- --host 0.0.0.0; echo; echo '--- Frontend stopped. Press Enter to close ---'; read"

if [[ -n "$NGROK_DOMAIN" ]]; then
  ngrok_cmd="echo 'Waiting for Vite on :5173...'; until curl -sf http://127.0.0.1:5173/ >/dev/null 2>&1; do sleep 1; done; echo 'Starting ngrok → https://$NGROK_DOMAIN'; '$NGROK_BIN' http 5173 --domain=$NGROK_DOMAIN --request-header-add='ngrok-skip-browser-warning:true'; echo; echo '--- ngrok stopped. Press Enter to close ---'; read"
else
  ngrok_cmd="echo 'Waiting for Vite on :5173...'; until curl -sf http://127.0.0.1:5173/ >/dev/null 2>&1; do sleep 1; done; '$NGROK_BIN' http 5173 --request-header-add='ngrok-skip-browser-warning:true'; echo; echo '--- ngrok stopped. Press Enter to close ---'; read"
fi

# ── Inline mode (all in one terminal) ───────────────────────────────────────

run_inline() {
  local b="\033[0;34m[backend] \033[0m"
  local f="\033[0;32m[frontend]\033[0m"
  local t="\033[0;35m[tunnel]  \033[0m"

  cleanup() { echo; echo "Stopping TerraSketch..."; kill 0 2>/dev/null || true; }
  trap cleanup INT TERM EXIT

  ( cd "$BACKEND_DIR" && source .venv/bin/activate
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8010 2>&1 \
      | while IFS= read -r l; do printf "${b} %s\n" "$l"; done ) &

  ( cd "$FRONTEND_DIR"
    npm run dev -- --host 0.0.0.0 2>&1 \
      | while IFS= read -r l; do printf "${f} %s\n" "$l"; done ) &

  if [[ "$USE_TUNNEL" -eq 1 && -x "$NGROK_BIN" ]]; then
    (
      until curl -sf http://127.0.0.1:5173/ >/dev/null 2>&1; do sleep 1; done
      if [[ -n "$NGROK_DOMAIN" ]]; then
        "$NGROK_BIN" http 5173 --domain="$NGROK_DOMAIN" --request-header-add='ngrok-skip-browser-warning:true' 2>&1
      else
        "$NGROK_BIN" http 5173 --request-header-add='ngrok-skip-browser-warning:true' 2>&1
      fi | while IFS= read -r l; do printf "${t} %s\n" "$l"; done
    ) &
  fi

  echo ""
  echo "TerraSketch running (Ctrl-C to stop all)"
  echo "  Backend  → http://127.0.0.1:8010/docs"
  echo "  Frontend → http://127.0.0.1:5173"
  [[ -n "$NGROK_DOMAIN" ]] \
    && echo "  Public   → https://$NGROK_DOMAIN" \
    || echo "  Public   → check [tunnel] output for ngrok URL"
  echo ""
  wait
}

# ── 3-window GUI mode ────────────────────────────────────────────────────────

run_gui() {
  echo "Opening 3 terminal windows..."

  DISPLAY=:0 gnome-terminal \
    --title="TerraSketch — Backend" \
    -- bash -c "$backend_cmd"

  sleep 0.5

  DISPLAY=:0 gnome-terminal \
    --title="TerraSketch — Frontend" \
    -- bash -c "$frontend_cmd"

  if [[ "$USE_TUNNEL" -eq 1 && -x "$NGROK_BIN" ]]; then
    sleep 0.5
    DISPLAY=:0 gnome-terminal \
      --title="TerraSketch — ngrok tunnel" \
      -- bash -c "$ngrok_cmd"
  fi

  echo ""
  echo "3 terminal windows launched."
  echo "  Backend  → http://127.0.0.1:8010/docs"
  echo "  Frontend → http://127.0.0.1:5173"
  if [[ "$USE_TUNNEL" -eq 1 ]]; then
    [[ -n "$NGROK_DOMAIN" ]] \
      && echo "  Public   → https://$NGROK_DOMAIN  (permanent)" \
      || echo "  Public   → see the ngrok terminal window"
  fi
  echo ""
  echo "Tip: run with --inline to keep everything in one terminal instead."
}

# ── Entry point ──────────────────────────────────────────────────────────────

if [[ "$INLINE" -eq 1 ]]; then
  run_inline
else
  run_gui
fi
