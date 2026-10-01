CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE shipments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference     text        NOT NULL,
  carrier       text        NOT NULL CHECK (carrier IN ('ups', 'fedex', 'dhl', 'usps')),
  service       text        NOT NULL CHECK (service IN ('ground', 'express', 'overnight')),
  status        text        NOT NULL DEFAULT 'booked',
  origin_zip    char(5)     NOT NULL,
  dest_zip      char(5)     NOT NULL,
  weight_grams  integer     NOT NULL CHECK (weight_grams > 0),
  price_cents   integer     NOT NULL CHECK (price_cents >= 0),
  eta           date        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shipments_status_created ON shipments (status, created_at DESC);

CREATE TABLE tracking_events (
  id           bigserial PRIMARY KEY,
  shipment_id  uuid        NOT NULL REFERENCES shipments (id) ON DELETE CASCADE,
  status       text        NOT NULL,
  note         text,
  at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tracking_events_shipment ON tracking_events (shipment_id, at);
