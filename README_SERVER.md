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
