-- ==========================================
-- TESLA MONITOR - OAuth PKCE Flow
-- ==========================================

-- 1. Ensure tesla_oauth_state table exists
CREATE TABLE IF NOT EXISTS tesla_oauth_state (
    id UUID PRIMARY KEY,
    code_verifier TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clean up old states
DELETE FROM tesla_oauth_state WHERE created_at < NOW() - INTERVAL '30 minutes';

-- 2. Ensure tesla_user_settings has all required columns
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tesla_user_settings') THEN
        BEGIN ALTER TABLE tesla_user_settings ADD COLUMN IF NOT EXISTS tesla_client_id TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN ALTER TABLE tesla_user_settings ADD COLUMN IF NOT EXISTS tesla_refresh_token TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN ALTER TABLE tesla_user_settings ADD COLUMN IF NOT EXISTS tesla_access_token TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN ALTER TABLE tesla_user_settings ADD COLUMN IF NOT EXISTS tesla_token_expiry TIMESTAMPTZ; EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN ALTER TABLE tesla_user_settings ADD COLUMN IF NOT EXISTS tesla_vehicle_name TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN ALTER TABLE tesla_user_settings ADD COLUMN IF NOT EXISTS tesla_vehicle_vin TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN ALTER TABLE tesla_user_settings ADD COLUMN IF NOT EXISTS tesla_last_sync TIMESTAMPTZ; EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN ALTER TABLE tesla_user_settings ADD COLUMN IF NOT EXISTS tesla_connected BOOLEAN NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END;
    END IF;
END $$;

-- 3. Enable RLS and policies
ALTER TABLE tesla_oauth_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'tesla_oauth_state' AND policyname = 'Users can read own oauth state') THEN
        CREATE POLICY "Users can read own oauth state" ON tesla_oauth_state FOR SELECT USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'tesla_oauth_state' AND policyname = 'Users can insert own oauth state') THEN
        CREATE POLICY "Users can insert own oauth state" ON tesla_oauth_state FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'tesla_oauth_state' AND policyname = 'Users can delete own oauth state') THEN
        CREATE POLICY "Users can delete own oauth state" ON tesla_oauth_state FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- RLS for tesla_user_settings
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'tesla_user_settings' AND rowsecurity = true) THEN
        ALTER TABLE tesla_user_settings ENABLE ROW LEVEL SECURITY;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'tesla_user_settings' AND policyname = 'Users can read own settings') THEN
        CREATE POLICY "Users can read own settings" ON tesla_user_settings FOR SELECT USING (auth.uid() = id);
    END IF;
    IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'tesla_user_settings' AND policyname = 'Users can insert own settings') THEN
        CREATE POLICY "Users can insert own settings" ON tesla_user_settings FOR INSERT WITH CHECK (auth.uid() = id);
    END IF;
    IF NOT EXISTS (SELECT FROM pg_policies WHERE tablename = 'tesla_user_settings' AND policyname = 'Users can update own settings') THEN
        CREATE POLICY "Users can update own settings" ON tesla_user_settings FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
    END IF;
END $$;