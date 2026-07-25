-- ==========================================
-- DIAGNOSE: Find what's inserting default locations
-- Run this in Supabase SQL Editor and copy the result
-- ==========================================

-- 1. Find any triggers on auth.users
SELECT tgname AS trigger_name, tgtype::int AS trigger_type
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
  AND tgname LIKE '%default%location%';

-- 2. Find any function that mentions 'Home' or 'Supercharger' or 'tesla_locations'
SELECT proname AS function_name, prosrc AS function_body
FROM pg_proc
WHERE prosrc ILIKE '%Home%'
   OR prosrc ILIKE '%Supercharger%'
   OR prosrc ILIKE '%tesla_locations%'
   OR prosrc ILIKE '%default_location%';

-- 3. Find any cron jobs or scheduled tasks that might insert
SELECT jobid, schedule, command 
FROM cron.job 
WHERE command ILIKE '%tesla_locations%';

-- 4. List ALL triggers on tesla_locations table
SELECT tgname AS trigger_name, 
       tgenabled AS enabled
FROM pg_trigger
WHERE tgrelid = 'tesla_locations'::regclass;

-- 5. List all policies on tesla_locations
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'tesla_locations';