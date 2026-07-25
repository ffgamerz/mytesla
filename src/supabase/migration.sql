-- ==========================================
-- TESLA MONITOR - Database Migration
-- Prefix: tesla_
-- ==========================================

-- 1. User Settings (1 row per user)
CREATE TABLE IF NOT EXISTS tesla_user_settings (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    default_model_id TEXT NOT NULL DEFAULT 'model3',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Locations (saved by user, with geolocation)
CREATE TABLE IF NOT EXISTS tesla_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    rate DECIMAL(5,2) NOT NULL DEFAULT 0.38,
    voltage INT NOT NULL DEFAULT 240,
    max_amps INT NOT NULL DEFAULT 32,
    icon TEXT NOT NULL DEFAULT 'home',
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns if table already exists (for existing users)
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tesla_locations') THEN
        BEGIN
            ALTER TABLE tesla_locations ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END;
        BEGIN
            ALTER TABLE tesla_locations ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END;
    END IF;
END $$;

-- 3. Charging History / Saved Plans
CREATE TABLE IF NOT EXISTS tesla_charging_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    current_pct INT NOT NULL,
    target_pct INT NOT NULL,
    schedule_mode TEXT NOT NULL DEFAULT 'completion' CHECK (schedule_mode IN ('completion', 'start')),
    target_date DATE,
    target_time TIME,
    start_date DATE,
    start_time TIME,
    amps_used DECIMAL(5,1),
    duration_minutes INT,
    energy_kwh DECIMAL(6,2),
    cost_rm DECIMAL(8,2),
    location_id UUID REFERENCES tesla_locations(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- INDEXES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_tesla_locations_user ON tesla_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_tesla_charging_history_user ON tesla_charging_history(user_id);
CREATE INDEX IF NOT EXISTS idx_tesla_charging_history_created ON tesla_charging_history(user_id, created_at DESC);

-- ==========================================
-- ROW LEVEL SECURITY
-- ==========================================
ALTER TABLE tesla_user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tesla_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tesla_charging_history ENABLE ROW LEVEL SECURITY;

-- User settings
CREATE POLICY "Users can view own settings"
    ON tesla_user_settings FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own settings"
    ON tesla_user_settings FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own settings"
    ON tesla_user_settings FOR UPDATE
    USING (auth.uid() = id);

-- Locations
CREATE POLICY "Users can view own locations"
    ON tesla_locations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own locations"
    ON tesla_locations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own locations"
    ON tesla_locations FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own locations"
    ON tesla_locations FOR DELETE
    USING (auth.uid() = user_id);

-- Charging history
CREATE POLICY "Users can view own history"
    ON tesla_charging_history FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own history"
    ON tesla_charging_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own history"
    ON tesla_charging_history FOR DELETE
    USING (auth.uid() = user_id);

-- ==========================================
-- AUTO-UPDATE updated_at TRIGGER
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_tesla_user_settings_updated ON tesla_user_settings;
CREATE TRIGGER trigger_tesla_user_settings_updated
    BEFORE UPDATE ON tesla_user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();