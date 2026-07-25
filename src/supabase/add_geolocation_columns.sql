-- ==========================================
-- Add latitude/longitude columns to existing table
-- Run this ONLY if you already have tesla_locations table
-- ==========================================

ALTER TABLE tesla_locations ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE tesla_locations ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;