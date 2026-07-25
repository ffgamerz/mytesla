-- ==========================================
-- REMOVE ALL DEFAULT LOCATIONS TRIGGERS/FUNCTIONS
-- Run this ONCE in Supabase SQL Editor
-- ==========================================

-- 1. Drop any trigger that inserts default locations
DROP TRIGGER IF EXISTS on_user_created_insert_default_locations ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_insert_default_locations ON auth.users;
DROP TRIGGER IF EXISTS on_user_signin_insert_default_locations ON auth.users;

-- 2. Drop the function that inserts them (if exists)
DROP FUNCTION IF EXISTS insert_default_locations;
DROP FUNCTION IF EXISTS insert_default_locations_for_user;

-- 3. Delete any existing default rows from tesla_locations
--    Only deletes the known defaults: Home, Office, Supercharger, Public AC
DELETE FROM tesla_locations WHERE name IN ('Home', 'Office', 'Supercharger', 'Public AC');

-- 4. Verify nothing is left
SELECT COUNT(*) as remaining_defaults FROM tesla_locations WHERE name IN ('Home', 'Office', 'Supercharger', 'Public AC');