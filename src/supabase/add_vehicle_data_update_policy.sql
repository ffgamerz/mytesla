-- Add missing UPDATE policy for tesla_vehicle_data
-- Needed for phone GPS location fallback after initial insert

CREATE POLICY "Users can update own vehicle data"
    ON tesla_vehicle_data FOR UPDATE
    USING (auth.uid() = user_id);