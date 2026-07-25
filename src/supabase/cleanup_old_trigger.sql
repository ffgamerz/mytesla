-- ==========================================
-- Remove old trigger that auto-inserts locations
-- Run this to stop duplicate location inserts
-- ==========================================

DROP TRIGGER IF EXISTS on_user_created_insert_default_locations ON auth.users;
DROP FUNCTION IF EXISTS insert_default_locations;