-- ==========================================
-- TESLA MONITOR - Add Tesla Credentials
-- Columns added to existing tesla_user_settings table
-- ==========================================

DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tesla_user_settings') THEN
        BEGIN
            ALTER TABLE tesla_user_settings ADD COLUMN IF NOT EXISTS tesla_client_id TEXT;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END;
        BEGIN
            ALTER TABLE tesla_user_settings ADD COLUMN IF NOT EXISTS tesla_client_secret TEXT;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END;
        BEGIN
            ALTER TABLE tesla_user_settings ADD COLUMN IF NOT EXISTS tesla_vehicle_vin TEXT;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END;
        BEGIN
            ALTER TABLE tesla_user_settings ADD COLUMN IF NOT EXISTS tesla_vehicle_name TEXT;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END;
        BEGIN
            ALTER TABLE tesla_user_settings ADD COLUMN IF NOT EXISTS tesla_last_sync TIMESTAMPTZ;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END;
        BEGIN
            ALTER TABLE tesla_user_settings ADD COLUMN IF NOT EXISTS tesla_connected BOOLEAN NOT NULL DEFAULT false;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END;
    END IF;
END $$;

-- NOTE: If you already ran the previous version with tesla_refresh_token,
-- run this SQL to migrate:
-- ALTER TABLE tesla_user_settings RENAME COLUMN tesla_refresh_token TO tesla_client_secret;