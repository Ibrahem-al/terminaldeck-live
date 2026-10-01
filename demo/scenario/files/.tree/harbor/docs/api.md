# Harbor API

Base URL in development: `http://localhost:8787`. Every route except
`/health` needs `Authorization: Bearer <token>`. Errors are JSON:
`{ "error": "message", "details": [...] }`.

## POST /rates/quote

```json
{
  "originZip": "94107",
  "destZip": "10001",
  "parcel": { "weightGrams": 2300, "lengthCm": 30, "widthCm": 20, "heightCm": 15 },
  "carriers": ["ups", "fedex"]
}
```

`carriers` is optional. Response, cheapest first:

```json
{
  "quotes": [
    { "carrier": "usps", "service": "ground", "priceCents": 1398, "transitDays": 8, "eta": "2026-10-08" }
  ],
  "cheapest": { "carrier": "usps", "service": "ground", "priceCents": 1398, "transitDays": 8, "eta": "2026-10-08" }
}
```

Billable weight is the greater of actual and volumetric weight
(L × W × H / divisor — 5000 for UPS, FedEx and DHL, 6000 for USPS), rounded
up to the next 0.5 kg.

## GET /shipments

Query: `status` (optional), `limit` (1–100, default 25), `offset`.

## POST /shipments

Books a shipment from a quote. Returns `201` with a `Location` header.

## PATCH /shipments/:id/status

```json
{ "status": "out_for_delivery", "note": "Loaded on truck 14" }
```

Adds a tracking event and returns the updated shipment.

## Limits

None yet. Rate limiting per token is on the roadmap (`429 Too Many Requests`
with a `Retry-After` header).
