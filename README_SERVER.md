Server (development) instructions

Requirements:
- Node.js 14+

Install dependencies and run:

```bash
npm init -y
npm install express cors
node server.js
```

API endpoints:
- POST /api/cars  (application/json) — accepts a single car object or an array of cars; returns created item(s).
- GET  /api/cars?page=1&limit=12 — returns { total, page, limit, items }
- GET  /api/cars/:id — returns single car

Notes:
- Metadata is stored in `db.json` in the project root.
- Images are currently expected as URLs/paths in the `img` property. The server serves `/uploads` if you later add file upload handling.
- Admin UI (`admin-upload.html`) POSTs to `/api/cars`. If the server is unavailable the admin UI falls back to `localStorage`.

LAN, deployment and offline sync
--------------------------------

Make API reachable on your LAN (development):

- The app already runs on `0.0.0.0:8000` when started via `python app.py` (uvicorn). Use your machine IP, e.g. `http://192.168.1.42:8000`, from other devices on the same network.
- Allow port 8000 in Windows Firewall for `python.exe` or create a temporary rule.
- For quick public tunneling (temporary):

```bash
ngrok http 8000
```

Deployment options (recommended for production or persistent remote access):

- Deploy to any Python-friendly host: Railway, Render, Fly, AWS Elastic Beanstalk, or a VPS running `uvicorn`/`gunicorn` behind a reverse proxy.
- Ensure you set `SECRET_KEY` and other sensitive values as environment variables in production, and restrict `CORS` origins.

Offline-capable client & sync (pattern):

- The frontend can cache listings locally (IndexedDB) and queue create/update requests while offline.
- A helper `offline-sync.js` is included which provides simple utilities to queue outgoing POSTs and flush them when online.
- Integration pattern in admin pages:
	1. On submit, if `navigator.onLine` is false, call `offlineSync.queuePost('/api/cars', payload)` and update local cache/UI.
	2. When online, call `offlineSync.flushQueue(API_BASE)` or rely on `offlineSync.initAutoSync(API_BASE)` which listens for the `online` event.

Security note: never expose your database directly — always go through the API.
