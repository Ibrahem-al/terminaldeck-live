# Notes

## Harbor — this week

- [ ] Rate limiting for the public API — per token, 100 req/min, `429` + `Retry-After`.
      Have Claude write it + tests, Codex reviews.
- [ ] Carrier filter on the quote form (API side done in `routes/rates.ts`, not committed yet)
- [ ] Status filter chips on the shipments table (WIP in `web/src/App.tsx`)
- [x] ETA column in the shipment table
- [x] Request logging with request ids

## Ideas

- Webhook signatures: HMAC-SHA256 of the raw body, header `x-harbor-signature`.
- Label PDFs via the carrier APIs once Stripe billing is in.
- Nightly job that flags shipments past their ETA.
