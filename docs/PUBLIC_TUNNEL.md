# Open TerraSketch from your phone (public URL)

Your app uses a **Vite dev proxy**: one tunnel to the **frontend port** is enough; **`/api`** and **`/admin`** (SQLAdmin) are forwarded to FastAPI on your PC.

Prerequisites: backend on port **8000**, frontend on **5173** (or whatever Vite prints), `frontend/.env` has **`VITE_API_URL=`** (empty). The repo’s `vite.config.js` sets **`server.allowedHosts: true`** so Cloudflare/ngrok hostnames are not blocked—restart `npm run dev` after pulling changes.

---

## Option A — Cloudflare Quick Tunnel (no Snap, often works when ngrok won’t install)

1. Download the binary (pick **amd64** or **arm64** to match your CPU):

   ```bash
   cd ~/Downloads
   curl -fL -o cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
   chmod +x cloudflared
   sudo mv cloudflared /usr/local/bin/cloudflared
   ```

   **ARM64** (some laptops / Raspberry Pi): replace `amd64` with `arm64` in the URL.

2. With Vite already running on 5173:

   ```bash
   cloudflared tunnel --url http://127.0.0.1:5173
   ```

3. Copy the printed `https://….trycloudflare.com` URL and open it on your phone.

No Cloudflare account required for this quick tunnel. The URL changes each time you restart the command.

---

## Option B — ngrok without Snap

Snap fails with **“unable to contact snap store”** when the Snap Store is blocked or offline. Use a direct install instead.

1. Open [ngrok download](https://ngrok.com/downloads) → **Linux** → copy the **ZIP** link, or use:

   ```bash
   cd ~/Downloads
   curl -fL -o ngrok.tgz https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
   tar xzf ngrok.tgz
   sudo mv ngrok /usr/local/bin/
   ```

   (On **ARM64**, get the ARM build from the same downloads page.)

2. Add your authtoken (from the ngrok dashboard):

   ```bash
   ngrok config add-authtoken YOUR_TOKEN
   ```

3. Start TerraSketch, then:

   ```bash
   ngrok http 5173
   ```

Use the `https://….ngrok-free.app` URL on your phone.

---

## Option C — localtunnel (needs Node/npm only)

```bash
npx localtunnel --port 5173
```

Use the printed URL. First load may ask for a tunnel password; follow the CLI hint. Less reliable than Cloudflare/ngrok for some networks.

---

## Option D — Same Wi‑Fi only (no tunnel)

Use your PC’s LAN IP and open `http://192.168.x.x:5173` on the phone. See **backend README** section *Same Wi‑Fi*. No ngrok needed.

---

## If Cloudflare/GitHub downloads are blocked

Use **Option D** (LAN IP) or fix outbound HTTPS (proxy, firewall, corporate network).
