-- Allow returned to be NULL (null = market not yet settled, 0 = all sold)
ALTER TABLE market_transactions ALTER COLUMN returned DROP NOT NULL;

-- Reset any existing 0 returned values to NULL
-- (these were default placeholders, not explicitly entered)
-- Only reset rows where given > 0 and returned = 0 (the "never touched" state)
UPDATE market_transactions SET returned = NULL WHERE returned = 0;
