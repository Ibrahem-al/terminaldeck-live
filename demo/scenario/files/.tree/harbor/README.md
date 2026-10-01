# Harbor

Shipping-rate quotes and shipment tracking for small warehouses. One API, one
dashboard, one repo.

```
harbor/
├── api/   HTTP API — Express 5, Postgres, zod (port 8787)
└── web/   Dashboard — Vite + React 18 (port 5173, proxies /api)
```

## Getting started

Requires Node 22 and a local Postgres 16.

```powershell
npm install
Copy-Item .env.example .env        # then fill in DATABASE_URL
npm run db:migrate -w api
npm run dev                        # api + web together
```

Open http://localhost:5173. The API answers on http://localhost:8787.

## Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | API (tsx watch) and dashboard (Vite) together |
| `npm test`          | Vitest in both workspaces                     |
| `npm test -w api`   | API tests only                                |
| `npm run build`     | Type-check and build both workspaces          |
| `npm run lint`      | ESLint over the whole repo                    |

## API

All routes except `/health` need `Authorization: Bearer <token>`; tokens live
in `API_TOKENS` (comma separated).

| Method | Path                     | Notes                                   |
| ------ | ------------------------ | --------------------------------------- |
| GET    | `/health`                | liveness + database ping                |
| POST   | `/rates/quote`           | quote a parcel across every carrier     |
| GET    | `/rates/carriers`        | carriers and their service levels       |
| GET    | `/shipments`             | paginated, newest first (`?status=`)    |
| GET    | `/shipments/:id`         | one shipment with its tracking events   |
| POST   | `/shipments`             | book a shipment from a quote            |
| PATCH  | `/shipments/:id/status`  | carrier webhook / manual status change  |

See [docs/api.md](docs/api.md) for request and response bodies.

## Roadmap

- [x] Bearer-token auth
- [x] Structured request logging
- [x] Carrier ETA in the dashboard
- [ ] Rate limiting on the public API (per token, 429 + `Retry-After`)
- [ ] Webhook signature verification
- [ ] Label PDFs
