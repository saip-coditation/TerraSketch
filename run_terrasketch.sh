#!/usr/bin/env bash
# TerraSketch local dev launcher: backend (8000) + Vite (5173) + optional Cloudflare quick tunnel.
#
# Frontend env (tunnel / same-origin API):
#   In frontend/.env keep VITE_API_URL= empty so the browser uses the tunnel host and Vite proxies /api → FastAPI.
#   Restart npm run dev after changing .env.
#
# Tunnel only reaches port 5173; Vite proxies /api and /admin → :8000.
# More detail: docs/PUBLIC_TUNNEL.md
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

USE_TUNNEL=1
for arg in "$@"; do
  case "$arg" in
    --no-tunnel) USE_TUNNEL=0 ;;
    -h|--help)
      echo "Usage: $0 [--no-tunnel]"
      echo "  (default) Opens backend, frontend, and Cloudflare tunnel terminals."
      echo "  --no-tunnel  Only backend + frontend (e.g. LAN testing)."
      exit 0
      ;;
  esac
done

backend_cmd="cd \"$BACKEND_DIR\" && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000; exec bash"
frontend_cmd="cd \"$FRONTEND_DIR\" && ([ -f .env ] || cp .env.example .env) && npm run dev -- --host 0.0.0.0; exec bash"
# Wait for Vite before tunnel so the first requests don’t race a cold start.
tunnel_cmd='echo "Waiting for Vite on 5173..." && for i in $(seq 1 40); do curl -sf http://127.0.0.1:5173/ >/dev/null && break; sleep 0.5; done; cloudflared tunnel --url http://127.0.0.1:5173; exec bash'

open_in_terminal() {
  local title="$1"
  local cmd="$2"

  if command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal --title="$title" -- bash -lc "$cmd"
  elif command -v x-terminal-emulator >/dev/null 2>&1; then
    x-terminal-emulator -T "$title" -e bash -lc "$cmd"
  elif command -v konsole >/dev/null 2>&1; then
    konsole --new-tab -p tabtitle="$title" -e bash -lc "$cmd"
  elif command -v xfce4-terminal >/dev/null 2>&1; then
    xfce4-terminal --title="$title" --command="bash -lc '$cmd'"
  else
    echo "No supported GUI terminal found."
    echo "Install gnome-terminal (or equivalent), or run commands manually:"
    echo
    echo "Backend:"
    echo "  cd \"$BACKEND_DIR\""
    echo "  source .venv/bin/activate"
    echo "  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
    echo
    echo "Frontend:"
    echo "  cd \"$FRONTEND_DIR\""
    echo "  [ -f .env ] || cp .env.example .env"
    echo "  npm run dev -- --host 0.0.0.0"
    echo
    echo "Cloudflare tunnel (after Vite is up):"
    echo "  cloudflared tunnel --url http://127.0.0.1:5173"
    exit 1
  fi
}

ensure_frontend_env_hint() {
  if [[ ! -f "$FRONTEND_DIR/.env" ]]; then
    cp "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env"
  fi
  if [[ "$USE_TUNNEL" -eq 1 ]] && grep -qE '^[[:space:]]*VITE_API_URL=[[:space:]]*https?://' "$FRONTEND_DIR/.env" 2>/dev/null; then
    echo "WARNING: Tunnel mode works best with empty VITE_API_URL= in frontend/.env (same host + Vite /api proxy)."
    echo "         Edit: $FRONTEND_DIR/.env"
  fi
}

if [[ ! -d "$BACKEND_DIR" || ! -d "$FRONTEND_DIR" ]]; then
  echo "Project folders not found. Expected:"
  echo "  $BACKEND_DIR"
  echo "  $FRONTEND_DIR"
  exit 1
fi

if [[ ! -f "$BACKEND_DIR/.venv/bin/activate" ]]; then
  echo "Backend venv not found at $BACKEND_DIR/.venv"
  echo "Create it first:"
  echo "  cd \"$BACKEND_DIR\" && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi

ensure_frontend_env_hint

echo "Launching TerraSketch..."
open_in_terminal "TerraSketch Backend" "$backend_cmd"
sleep 1
open_in_terminal "TerraSketch Frontend" "$frontend_cmd"

if [[ "$USE_TUNNEL" -eq 1 ]]; then
  if command -v cloudflared >/dev/null 2>&1; then
    sleep 1
    open_in_terminal "TerraSketch Cloudflare tunnel" "$tunnel_cmd"
  else
    echo ""
    echo "cloudflared not in PATH. Install: see docs/PUBLIC_TUNNEL.md"
    echo "Then run: cloudflared tunnel --url http://127.0.0.1:5173"
  fi
fi

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
if [[ "$USE_TUNNEL" -eq 1 ]]; then
  echo "Started backend + frontend + Cloudflare tunnel terminals."
else
  echo "Started backend + frontend terminals."
fi
echo "Local:  Backend http://127.0.0.1:8000/docs   Frontend http://127.0.0.1:5173"
echo "Confirm generate works locally, then use the https://….trycloudflare.com URL from the tunnel terminal."
echo "If the tunnel site hits CORS/API errors, add that origin to backend/.env ALLOWED_ORIGINS and restart Uvicorn."
if [[ "$USE_TUNNEL" -eq 1 ]]; then
  echo "SQLAdmin: https://….trycloudflare.com/admin (requires ADMIN_UI_PASSWORD in backend/.env)."
fi
if [[ -n "${LAN_IP:-}" ]]; then
  echo ""
  echo "Same Wi‑Fi (no tunnel): use PC IP, not localhost — e.g."
  echo "  Frontend: http://${LAN_IP}:5173   (or :5174 if that port was busy)"
  echo "  Set frontend/.env:  VITE_API_URL=http://${LAN_IP}:8000"
  echo "  Set backend/.env:   ALLOWED_ORIGINS=...http://${LAN_IP}:5173,http://${LAN_IP}:5174..."
  echo "Firewall: e.g. sudo ufw allow 8000/tcp && sudo ufw allow 5173/tcp"
fi