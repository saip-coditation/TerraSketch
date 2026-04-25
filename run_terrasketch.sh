#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="/home/admin1/Downloads/Terraform_files_creater"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

backend_cmd="cd \"$BACKEND_DIR\" && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000; exec bash"
frontend_cmd="cd \"$FRONTEND_DIR\" && [ -f .env ] || cp .env.example .env && npm run dev; exec bash"

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
    echo "  uvicorn app.main:app --reload --port 8000"
    echo
    echo "Frontend:"
    echo "  cd \"$FRONTEND_DIR\""
    echo "  [ -f .env ] || cp .env.example .env"
    echo "  npm run dev"
    exit 1
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

echo "Launching TerraSketch..."
open_in_terminal "TerraSketch Backend" "$backend_cmd"
sleep 1
open_in_terminal "TerraSketch Frontend" "$frontend_cmd"

echo "Done. Backend and frontend terminals started."
echo "Backend docs: http://localhost:8000/docs"
echo "Frontend:     http://localhost:5173"
