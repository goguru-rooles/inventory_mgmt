-- ============================================================
-- Frozen Inventory App — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Items (products you sell)
CREATE TABLE IF NOT EXISTS items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  has_12oz    BOOLEAN NOT NULL DEFAULT false,
  has_16oz    BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Markets (farmers market locations)
CREATE TABLE IF NOT EXISTS markets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Weekly sessions (one per week)
CREATE TABLE IF NOT EXISTS weekly_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start  DATE NOT NULL UNIQUE,
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Starting inventory set at the beginning of each week
CREATE TABLE IF NOT EXISTS starting_inventory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES weekly_sessions(id) ON DELETE CASCADE,
  item_id     UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  qty_12oz    INTEGER NOT NULL DEFAULT 0,
  qty_16oz    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, item_id)
);

-- Market transactions: given out, returned, restocked per market per item per session
CREATE TABLE IF NOT EXISTS market_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES weekly_sessions(id) ON DELETE CASCADE,
  market_id     UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  item_id       UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  given_12oz    INTEGER NOT NULL DEFAULT 0,
  returned_12oz INTEGER NOT NULL DEFAULT 0,
  restock_12oz  INTEGER NOT NULL DEFAULT 0,
  given_16oz    INTEGER NOT NULL DEFAULT 0,
  returned_16oz INTEGER NOT NULL DEFAULT 0,
  restock_16oz  INTEGER NOT NULL DEFAULT 0,
  market_date   DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, market_id, item_id)
);

-- ============================================================
-- Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_starting_inventory_session ON starting_inventory(session_id);
CREATE INDEX IF NOT EXISTS idx_market_transactions_session ON market_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_market_transactions_market  ON market_transactions(market_id);
CREATE INDEX IF NOT EXISTS idx_market_transactions_item    ON market_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_weekly_sessions_week_start  ON weekly_sessions(week_start DESC);

-- ============================================================
-- Seed data: default markets
-- ============================================================
INSERT INTO markets (name, display_order) VALUES
  ('La Canada',      1),
  ('Marina Del Rey', 2),
  ('Brentwood',      3)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- Enable Realtime (run these in SQL editor)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE items;
ALTER PUBLICATION supabase_realtime ADD TABLE markets;
ALTER PUBLICATION supabase_realtime ADD TABLE weekly_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE starting_inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE market_transactions;
