-- =============================================================================
-- MIGRATION: Dynamic Sizes Support
-- Run this entire script in your Supabase SQL Editor (one-shot).
-- It creates new tables, migrates existing data, then swaps the old tables.
-- Old tables are renamed to *_backup so you can verify before dropping them.
-- =============================================================================

-- ── 1. sizes table ────────────────────────────────────────────────────────────
CREATE TABLE sizes (
  id            serial PRIMARY KEY,
  name          text   NOT NULL,
  display_order int    NOT NULL DEFAULT 0
);

-- Seed with the four sizes matching the CSV template
INSERT INTO sizes (name, display_order) VALUES
  ('12 oz',  1),
  ('16 oz',  2),
  ('2 Pack',  3),
  ('1 Pack',  4);

-- ── 2. item_sizes junction (which sizes each item is sold in) ─────────────────
CREATE TABLE item_sizes (
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  size_id int  NOT NULL REFERENCES sizes(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, size_id)
);

-- Migrate existing has_12oz / has_16oz boolean flags → item_sizes rows
INSERT INTO item_sizes (item_id, size_id)
  SELECT id, 1 FROM items WHERE has_12oz = true;

INSERT INTO item_sizes (item_id, size_id)
  SELECT id, 2 FROM items WHERE has_16oz = true;

-- ── 3. New market_transactions (one row per session + market + item + size) ───
CREATE TABLE market_transactions_new (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES weekly_sessions(id) ON DELETE CASCADE,
  market_id  uuid NOT NULL,
  item_id    uuid NOT NULL,
  size_id    int  NOT NULL REFERENCES sizes(id) ON DELETE RESTRICT,
  given      int  NOT NULL DEFAULT 0,
  returned   int  NOT NULL DEFAULT 0,
  restock    int  NOT NULL DEFAULT 0,
  UNIQUE (session_id, market_id, item_id, size_id)
);

-- Migrate 12 oz rows (only where there is actual data)
INSERT INTO market_transactions_new
  (session_id, market_id, item_id, size_id, given, returned, restock)
SELECT session_id, market_id, item_id, 1,
       given_12oz, returned_12oz, restock_12oz
FROM market_transactions
WHERE given_12oz > 0 OR returned_12oz > 0 OR restock_12oz > 0;

-- Migrate 16 oz rows
INSERT INTO market_transactions_new
  (session_id, market_id, item_id, size_id, given, returned, restock)
SELECT session_id, market_id, item_id, 2,
       given_16oz, returned_16oz, restock_16oz
FROM market_transactions
WHERE given_16oz > 0 OR returned_16oz > 0 OR restock_16oz > 0;

-- Swap tables (old kept as _backup for safety)
ALTER TABLE market_transactions     RENAME TO market_transactions_backup;
ALTER TABLE market_transactions_new RENAME TO market_transactions;

-- ── 4. New starting_inventory (one row per session + item + size) ─────────────
CREATE TABLE starting_inventory_new (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES weekly_sessions(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL,
  size_id    int  NOT NULL REFERENCES sizes(id) ON DELETE RESTRICT,
  qty        int  NOT NULL DEFAULT 0,
  UNIQUE (session_id, item_id, size_id)
);

-- Migrate 12 oz rows
INSERT INTO starting_inventory_new (session_id, item_id, size_id, qty)
  SELECT session_id, item_id, 1, qty_12oz
  FROM starting_inventory WHERE qty_12oz > 0;

-- Migrate 16 oz rows
INSERT INTO starting_inventory_new (session_id, item_id, size_id, qty)
  SELECT session_id, item_id, 2, qty_16oz
  FROM starting_inventory WHERE qty_16oz > 0;

-- Swap tables
ALTER TABLE starting_inventory     RENAME TO starting_inventory_backup;
ALTER TABLE starting_inventory_new RENAME TO starting_inventory;

-- =============================================================================
-- Done! After verifying everything works you can drop the backup tables:
--   DROP TABLE market_transactions_backup;
--   DROP TABLE starting_inventory_backup;
-- =============================================================================
