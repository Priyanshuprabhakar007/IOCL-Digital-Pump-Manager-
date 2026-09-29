-- Phase 3A-2: CNG Financial Integration

-- 1. Add product_category to historical price snapshots
ALTER TABLE operational_shift_product_prices
ADD COLUMN product_category TEXT;

-- 2. Backfill product_category for existing snapshots
UPDATE operational_shift_product_prices
SET product_category = (
  SELECT p.category
  FROM products p
  WHERE p.id = operational_shift_product_prices.product_id
)
WHERE product_category IS NULL;
