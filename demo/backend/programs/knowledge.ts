/**
 * What an agent "knows" after reading a Harbor file: a few sentences of prose
 * per file, the way a model would explain it. Checked against the file's
 * current text, so an explanation never describes code that isn't there (a
 * file the visitor rewrote falls back to the generic reading in brain.ts).
 */
type Explainer = (text: string) => string | null

const has = (text: string, ...needles: string[]): boolean => needles.every((n) => text.includes(n))

const KNOWN: Record<string, Explainer> = {
  'api/src/server.ts': (t) =>
    has(t, 'createApp', 'listen')
      ? "It's the API's entry point. It builds a Postgres-backed `Db` from `config.databaseUrl`, creates the Express app with `createApp()`, and starts listening on `config.port`.\n\nThe rest is a graceful shutdown: on `SIGINT` or `SIGTERM` it stops accepting connections, lets in-flight requests finish, closes the database pool, then exits. A 10-second timer forces the exit if something hangs, and it's `unref()`'d so it never keeps the process alive by itself. That's what lets `tsx watch` restart the server cleanly during development."
      : null,
  'api/src/app.ts': (t) =>
    has(t, 'createApp', 'app.use')
      ? `It builds the Express app, and the order of the \`app.use\` calls is the request pipeline:\n\n- JSON body parsing (capped at 100 kB) and the request logger run for everything.\n- \`/health\` is mounted **before** \`requireAuth\`, so load balancers can probe it without a token.\n${t.includes('rateLimit(') ? '- The rate limiter comes next, so every API route after it is covered.\n' : ''}- Then bearer-token auth, and the \`/rates\` and \`/shipments\` routers.\n- \`notFound\` and \`errorHandler\` come last and turn anything unmatched or thrown into a JSON error.\n\nDependencies (the \`Db\` and the token list) are passed in, which is what lets the tests build the app with an in-memory database.`
      : null,
  'api/src/db.ts': (t) =>
    has(t, 'interface Db', 'createPgDb')
      ? "It's the data layer. The `Db` interface lists everything the routes need (ping, list, get, create and update shipments), so the routes never touch SQL and the tests can swap in an in-memory version.\n\n`createPgDb()` implements it on a `pg` connection pool (max 10 connections). `listShipments` filters by status and pages with `LIMIT`/`OFFSET`, newest first. `getShipment` also loads the tracking events. `updateStatus` changes the status and records a tracking event in one transaction, rolling back if either query fails."
      : null,
  'api/src/config.ts': (t) =>
    has(t, 'Env', 'safeParse')
      ? "It reads the environment once at startup and validates it with zod: `DATABASE_URL` must be a URL, `PORT` defaults to 8787, `API_TOKENS` is split on commas, `STRIPE_KEY` is optional and `LOG_LEVEL` defaults to `info`.\n\nIf anything is missing or malformed the process stops right away with a list of the problems and a pointer to `.env.example`, instead of failing later on the first request."
      : null,
  'api/src/types.ts': () =>
    "It holds the domain types the API shares: carriers and service levels, parcels and quotes, shipments with their status, and tracking events. There's no logic in it.",
  'api/src/routes/shipments.ts': (t) =>
    has(t, 'shipmentsRouter')
      ? `It's the shipments REST API:\n\n- \`GET /\` lists shipments, optionally filtered by \`status\`, with \`limit\` (1 to 100, default 25) and \`offset\` paging${t.includes('hasMore') ? ', and a `hasMore` flag for the next page' : ''}.\n- \`GET /:id\` returns one shipment with its tracking events, or a 404.\n- \`POST /\` validates the body with zod and creates a shipment (201 with a \`Location\` header).\n- \`PATCH /:id/status\` changes the status and can attach a note.\n\nValidation failures and missing rows are thrown as \`HttpError\`s, which the error middleware turns into JSON responses.`
      : null,
  'api/src/routes/rates.ts': (t) =>
    has(t, 'ratesRouter')
      ? "It serves rate quotes. `POST /quote` validates the origin and destination ZIPs and the parcel (weight and dimensions), asks `quoteAll()` for a price from every carrier, optionally keeps only the carriers the dashboard filtered on, and returns the quotes with the cheapest one picked out. `GET /carriers` lists the carriers and their service levels."
      : null,
  'api/src/routes/health.ts': (t) =>
    has(t, 'healthRouter')
      ? "It's the health check. `GET /health` pings the database and answers 200 with `ok: true` when it's reachable, or 503 when it isn't, along with the uptime and the package version. It's mounted before auth, so monitors don't need a token."
      : null,
  'api/src/middleware/auth.ts': (t) =>
    has(t, 'requireAuth')
      ? "It's bearer-token auth. `requireAuth(tokens)` reads the `Authorization: Bearer …` header and accepts the request only if the token is in the allow-list from `API_TOKENS`, comparing with `timingSafeEqual` so the check doesn't leak timing. It stores the token on `req.token` and answers 401 otherwise."
      : null,
  'api/src/middleware/errors.ts': () =>
    "It defines `HttpError` (an error that carries a status code and optional details) and the two middlewares at the end of the pipeline: `notFound` for unmatched routes, and `errorHandler`, which turns `HttpError`s and malformed JSON bodies into 4xx responses and logs anything else as a 500.",
  'api/src/middleware/logger.ts': () =>
    "It sets up pino (pretty-printed outside production, with the auth header redacted) and `requestLogger`, which gives every request an id (taken from `x-request-id` or generated), echoes it back in the response header, and logs one structured line per request with the status and duration.",
  'api/src/middleware/validate.ts': () =>
    "It's a tiny helper: `validateBody(schema)` parses `req.body` with a zod schema, replaces the body with the parsed value, and turns a mismatch into a 400 that lists every issue.",
  'api/src/middleware/rateLimit.ts': (t) =>
    has(t, 'rateLimit', 'buckets')
      ? `It's a fixed-window rate limiter. Each client (by \`req.ip\` unless you pass a \`key\` function) gets a bucket that counts requests until its window ends. Every response carries \`RateLimit-Limit\`, \`RateLimit-Remaining\` and \`RateLimit-Reset\`, and once the budget is spent it answers 429 with \`Retry-After\`.\n\nThe buckets live in memory, so the limit is per process${t.includes('lastSweep') ? '; expired buckets are swept once per window' : ''}.`
      : null,
  'api/src/services/carriers.ts': () =>
    "It's the carrier price table: for UPS, FedEx, DHL and USPS, each service level's base fee, price per kilogram and transit days, plus the volumetric divisor each carrier uses to turn a parcel's size into billable weight.",
  'api/src/services/quote.ts': () =>
    "It does the pricing maths: billable weight (the greater of actual and volumetric weight, rounded up to half a kilo), a rough zone from the ZIP codes, business-day ETAs, and `quoteAll()`, which prices every carrier and service and sorts the quotes cheapest first.",
  'api/src/db/migrate.ts': () =>
    "It's the migration runner behind `npm run db:migrate`. It keeps a `schema_migrations` table, applies every `.sql` file in `migrations/` that hasn't run yet, in name order, and records each one.",
  'web/src/App.tsx': () =>
    "It's the dashboard's root component: the header, the quote form with its rate cards, and the shipments table with a status filter. Shipments come from the `useShipments` hook, and quotes from `api.quote`.",
  'web/src/api.ts': () =>
    "It's the dashboard's API client. `request()` calls `/api…` (Vite proxies that to the API) with the bearer token from `VITE_API_TOKEN`, and turns error responses into an `ApiError` carrying the status. `api.quote` and `api.shipments` are thin typed wrappers around it.",
  'web/src/hooks/useShipments.ts': () =>
    "It's a React hook that loads shipments for the current status filter, refetches when the filter changes and every 30 seconds, ignores responses that arrive after the filter moved on, and exposes `loading`, `error` and a manual `reload`.",
  'web/src/format.ts': () =>
    "It holds two formatters: `formatPrice` turns cents into dollars, and `formatDate` turns an ISO calendar date into `Fri, Oct 2`. The date is parsed at noon so a time zone can never shift it to the day before.",
  'web/vite.config.ts': () =>
    "It configures Vite for the dashboard: the React plugin, and a dev-server proxy that forwards `/api` to the API on port 8787 so the browser never deals with CORS."
}

/** A prose explanation of `file` (project-relative, `/`), or null when we have none for its current text. */
export function explainKnown(file: string, text: string): string | null {
  const fn = KNOWN[file]
  if (!fn) return null
  try {
    return fn(text)
  } catch {
    return null
  }
}
