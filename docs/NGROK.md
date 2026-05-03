# ngrok (optional)

Snap install often fails with **“unable to contact snap store”**. Use a **direct download** or switch to **Cloudflare Quick Tunnel** — see **[PUBLIC_TUNNEL.md](./PUBLIC_TUNNEL.md)** for full options.

Quick ngrok without Snap:

```bash
cd ~/Downloads
curl -fL -o ngrok.tgz https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
tar xzf ngrok.tgz && sudo mv ngrok /usr/local/bin/
ngrok config add-authtoken YOUR_TOKEN
ngrok http 5173
```

Then open the printed HTTPS URL on your phone (with `VITE_API_URL=` empty and Vite + FastAPI running as in **PUBLIC_TUNNEL.md**).
