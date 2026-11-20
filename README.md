<<<<<<< HEAD
# Hotel Offer Orchestrator

Aggregates overlapping hotel offers from two mock suppliers, de-duplicates hotels by name, picks the best (cheapest) offer per hotel, stores the result in Redis and supports price-range filtering **inside Redis**. The whole flow is orchestrated by a **Temporal** workflow.

**Stack:** Node.js 20 (TypeScript) · Express · Temporal · Redis · Docker Compose

---

## Architecture

```
Client ──GET /api/hotels?city=delhi&minPrice&maxPrice──▶ Express API
                                                           │ client.workflow.execute()
                                                           ▼
                                                   Temporal Server ◀──── Worker (workflow + activities)
                                                                              │
                         ┌────────────────────────────────────────────────────┤
                         ▼ (parallel)                                         ▼
          fetchSupplierA ─▶ GET /supplierA/hotels          dedupeAndSelectBest (cheapest per name)
          fetchSupplierB ─▶ GET /supplierB/hotels                             │
                                                                              ▼
                                                            saveHotelsToRedis  (ZSET + HASH)
                                                                              │ only if minPrice/maxPrice given
                                                                              ▼
                                                            queryHotelsByPrice (ZRANGEBYSCORE in Redis)
```

**Workflow (`src/temporal/workflows.ts`)**
1. Calls Supplier A and Supplier B **in parallel** (`Promise.allSettled`); each activity has a retry policy (3 attempts, exponential backoff, 10 s timeout).
2. If only one supplier fails, the workflow continues with the other one and reports a warning (response header `X-Supplier-Warnings`). If **both** fail it fails with a non-retryable `AllSuppliersDown` error → API returns `502`.
3. Deduplicates by hotel name (case/whitespace-insensitive), keeping the cheaper offer (tie → Supplier A).
4. Saves the de-duplicated list in Redis (atomic `MULTI` replace, with TTL).
5. If `minPrice` and/or `maxPrice` is supplied, the filter is executed **by Redis**.

**Redis layout (per city)**

| Key | Type | Content |
|---|---|---|
| `hotels:<city>:byPrice` | ZSET | member = normalized hotel name, score = price |
| `hotels:<city>:data` | HASH | field = normalized name, value = JSON offer |

Filtering = `ZRANGEBYSCORE hotels:<city>:byPrice <min|-inf> <max|+inf>` (inclusive) followed by `HMGET` for the payloads.

The mock suppliers are served by the same Express app. The Temporal activities call them over HTTP (`SUPPLIER_BASE_URL`), so they behave like real external services.

---

## Quick start (Docker – recommended)

Prerequisites: Docker + Docker Compose v2.

```bash
unzip hotel-offer-orchestrator.zip && cd hotel-offer-orchestrator
docker compose up --build -d
docker compose ps          # Temporal needs ~20-30s on first start
```

| Service | URL / Port | Notes |
|---|---|---|
| `api` | http://localhost:3000 | Express API + mock suppliers |
| `worker` | – | Temporal worker (same image as `api`) |
| `temporal` | localhost:7233 | Temporal server (Postgres-backed) |
| `temporal-ui` | http://localhost:8080 | Inspect workflow executions |
| `redis` | localhost:6379 | |

Try it:

```bash
curl "http://localhost:3000/api/hotels?city=delhi"
curl "http://localhost:3000/api/hotels?city=delhi&minPrice=4000&maxPrice=6000"
curl "http://localhost:3000/health"
```

Stop / clean up: `docker compose down -v`

> The API and worker retry connecting to Temporal on startup, so no manual ordering is needed. Logs: `docker compose logs -f api worker`.

## Run locally without building images

```bash
docker compose up -d postgres temporal temporal-ui redis   # infra only
npm install
npm run dev:worker      # terminal 1
npm run dev:api         # terminal 2
```

Build & unit tests: `npm test`. Env defaults match local infra; see `.env.example`.

---

## API

### `GET /api/hotels?city=<city>[&minPrice=<n>][&maxPrice=<n>]`

* `city` – required (case-insensitive). Mock data: `delhi`, `mumbai`. Unknown city → `200 []`.
* `minPrice`, `maxPrice` – optional, inclusive, non-negative; either or both.
* Sorted by price ascending.
* `400` invalid input · `502` both suppliers down · `500` unexpected error.

Example – `GET /api/hotels?city=delhi&minPrice=4000&maxPrice=6000`

```json
[
  { "name": "Lemon Tree", "price": 4500, "supplier": "Supplier A", "commissionPct": 12 },
  { "name": "Holtin",     "price": 5340, "supplier": "Supplier B", "commissionPct": 20 },
  { "name": "Radison",    "price": 5900, "supplier": "Supplier A", "commissionPct": 13 }
]
```

(Holtin: A=6000 vs B=5340 → B wins. Radison: A=5900 vs B=6100 → A wins.)

### Mock supplier APIs

* `GET /supplierA/hotels[?city=delhi]`
* `GET /supplierB/hotels[?city=delhi]`

Static arrays like `{ "hotelId": "a1", "name": "Holtin", "price": 6000, "city": "delhi", "commissionPct": 10 }`, with overlapping names between A and B.

**Simulate an outage:** `POST /mock/supplierA/down|up`, `POST /mock/supplierB/down|up`
(or start with env `SUPPLIER_A_DOWN=true` / `SUPPLIER_B_DOWN=true`).

### `GET /health` (bonus)

Reports health of **both suppliers**, Redis and Temporal. `200` when all are up, `503` otherwise (`status`: `ok` | `degraded` | `down`).

```json
{
  "status": "degraded",
  "suppliers": { "supplierA": { "status": "down", "error": "HTTP 503", "latencyMs": 37 },
                 "supplierB": { "status": "up", "latencyMs": 20 } },
  "dependencies": { "redis": { "status": "up" }, "temporal": { "status": "up" } }
}
```

---

## Postman collection

Import `postman/hotel-offer-orchestrator.postman_collection.json` (`baseUrl` defaults to `http://localhost:3000`) and run with the Collection Runner:

1. Happy path – delhi overlaps, price range (min+max, min only, max only), mumbai
2. Edge cases – city with no results, range with no matches, missing city / invalid price (400)
3. Raw mock supplier endpoints
4. `/health`
5. **Supplier-down simulation** – A down (graceful degradation + `X-Supplier-Warnings`), health `503`, both down (`502`), then restores both

CLI: `npx newman run postman/hotel-offer-orchestrator.postman_collection.json` (21 requests / 50 assertions, all passing).

## Logging & error handling (bonus)

* Structured JSON logs in the API (per request) and in activities/workflow (supplier, attempt, counts, errors).
* Activity retries with backoff, request timeouts, malformed supplier records dropped with a warning.
* Partial-failure tolerance (one supplier down) and an explicit failure type when both are down.

## Configuration

| Env var | Default |
|---|---|
| `PORT` | 3000 |
| `REDIS_URL` | redis://localhost:6379 |
| `TEMPORAL_ADDRESS` | localhost:7233 |
| `TEMPORAL_NAMESPACE` | default |
| `TEMPORAL_TASK_QUEUE` | hotel-offers |
| `SUPPLIER_BASE_URL` | http://localhost:3000 (Compose sets `http://api:3000`) |
| `SUPPLIER_TIMEOUT_MS` | 3000 |
| `CACHE_TTL_SECONDS` | 3600 |

## Project structure

```
src/
  server.ts, app.ts          Express bootstrap
  routes/hotels.ts           GET /api/hotels (starts the workflow)
  routes/health.ts           GET /health
  mock/suppliers.ts          Mock supplier endpoints + outage switches
  temporal/workflows.ts      Orchestration
  temporal/activities.ts     Supplier calls, dedupe, Redis save/filter
  temporal/worker.ts         Worker process
  temporal/connection.ts     Shared Temporal client
  redis/hotelStore.ts        ZSET/HASH storage + ZRANGEBYSCORE filtering
  domain/dedupe.ts           Pure de-dupe / best-price logic
  __tests__/dedupe.test.ts   Unit tests
postman/                     Postman collection
Dockerfile, docker-compose.yml
```
=======
# hotels
>>>>>>> 136138d69fd825f1aab7e82adfd16a4b3df6baa4
