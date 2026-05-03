#!/usr/bin/env bash
# Writes frontend/.env VITE_API_URL to this machine's LAN IP so phones on the same Wi‑Fi work.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_ENV="$ROOT/frontend/.env"

ip=""
if command -v hostname >/dev/null 2>&1; then
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
if [[ -z "$ip" ]] && command -v ip >/dev/null 2>&1; then
  ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')"
fi
if [[ -z "$ip" ]]; then
  echo "Could not detect LAN IP. Set VITE_API_URL manually in frontend/.env"
  exit 1
fi

API="http://${ip}:8000"
if [[ -f "$FRONTEND_ENV" ]]; then
  if grep -q '^VITE_API_URL=' "$FRONTEND_ENV"; then
    sed -i "s|^VITE_API_URL=.*|VITE_API_URL=${API}|" "$FRONTEND_ENV"
  else
    printf '\nVITE_API_URL=%s\n' "$API" >> "$FRONTEND_ENV"
  fi
else
  echo "VITE_API_URL=${API}" > "$FRONTEND_ENV"
fi

echo "Updated $FRONTEND_ENV"
echo "  VITE_API_URL=$API"
echo ""
echo "On your phone (same Wi‑Fi), open:"
echo "  http://${ip}:5173"
echo "(If Vite chose another port, use the port shown in the Vite terminal — try :5174 or :5175.)"
echo ""
echo "Restart: backend with  uvicorn ... --host 0.0.0.0  and  npm run dev  in frontend."
