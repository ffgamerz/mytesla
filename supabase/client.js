import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase credentials not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ==========================================
// Database helpers
// ==========================================

/**
 * Get or create user settings
 */
export async function getUserSettings(userId) {
    let { data, error } = await supabase
        .from('tesla_user_settings')
        .select('*')
        .eq('id', userId)
        .single();

    if (error && error.code === 'PGRST116') {
        // No settings yet, create default
        const { data: newData, error: insertError } = await supabase
            .from('tesla_user_settings')
            .insert({ id: userId })
            .select()
            .single();

        if (insertError) throw insertError;
        return newData;
    }

    if (error) throw error;
    return data;
}

/**
 * Update user settings
 */
export async function updateUserSettings(userId, updates) {
    const { data, error } = await supabase
        .from('tesla_user_settings')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Get user's locations
 */
export async function getLocations(userId) {
    const { data, error } = await supabase
        .from('tesla_locations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
}

/**
 * Save a location
 */
export async function saveLocation(userId, location) {
    const { data, error } = await supabase
        .from('tesla_locations')
        .insert({ user_id: userId, ...location })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Update a location
 */
export async function updateLocation(locationId, updates) {
    const { data, error } = await supabase
        .from('tesla_locations')
        .update(updates)
        .eq('id', locationId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Delete a location
 */
export async function deleteLocation(locationId) {
    const { error } = await supabase
        .from('tesla_locations')
        .delete()
        .eq('id', locationId);

    if (error) throw error;
}

/**
 * Save charging record to history
 */
export async function saveChargingRecord(userId, record) {
    const { data, error } = await supabase
        .from('tesla_charging_history')
        .insert({ user_id: userId, ...record })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Get charging history for a user
 */
export async function getChargingHistory(userId, limit = 20) {
    const { data, error } = await supabase
        .from('tesla_charging_history')
        .select('*, location:location_id(name, icon)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data || [];
}

/**
 * Delete a charging record
 */
export async function deleteChargingRecord(recordId) {
    const { error } = await supabase
        .from('tesla_charging_history')
        .delete()
        .eq('id', recordId);

    if (error) throw error;
}

/**
 * Get Tesla connection settings for a user
 */
export async function getTeslaSettings(userId) {
    try {
        const { data, error } = await supabase
            .from('tesla_user_settings')
            .select('*')
            .eq('id', userId)
            .single();

        if (error && error.code === 'PGRST116') return null;
        if (error) throw error;

        return {
            tesla_client_id: data?.tesla_client_id || null,
            tesla_refresh_token: data?.tesla_refresh_token || null,
            tesla_access_token: data?.tesla_access_token || null,
            tesla_token_expiry: data?.tesla_token_expiry || null,
            tesla_vehicle_vin: data?.tesla_vehicle_vin || null,
            tesla_vehicle_name: data?.tesla_vehicle_name || null,
            tesla_last_sync: data?.tesla_last_sync || null,
            tesla_connected: data?.tesla_connected || false,
        };
    } catch (e) {
        console.warn('getTeslaSettings failed:', e?.message || e);
        return null;
    }
}

/**
 * Update Tesla connection settings
 */
export async function updateTeslaSettings(userId, updates) {
    const { data, error } = await supabase
        .from('tesla_user_settings')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Disconnect Tesla (clear credentials)
 */
export async function disconnectTesla(userId) {
    const { data, error } = await supabase
        .from('tesla_user_settings')
        .update({
            tesla_client_id: null,
            tesla_refresh_token: null,
            tesla_access_token: null,
            tesla_token_expiry: null,
            tesla_vehicle_vin: null,
            tesla_vehicle_name: null,
            tesla_last_sync: null,
            tesla_connected: false,
        })
        .eq('id', userId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Save Tesla vehicle data pulled from API to database
 */
export async function saveTeslaVehicleData(userId, data) {
    const { error } = await supabase
        .from('tesla_vehicle_data')
        .insert({
            user_id: userId,
            battery_level: data.battery_level,
            battery_range: data.battery_range,
            estimated_range: data.estimated_range,
            is_charging: data.is_charging,
            charge_power: data.charge_power,
            charge_voltage: data.charge_voltage,
            charge_amps: data.charge_amps,
            odometer: data.odometer,
            locked: data.locked,
            sentry_mode: data.sentry_mode,
            inside_temp: data.inside_temp,
            outside_temp: data.outside_temp,
            latitude: data.latitude,
            longitude: data.longitude,
            model: data.model,
            trim: data.trim,
        });

    if (error) throw error;
}

/**
 * Get the latest Tesla vehicle data from the database for a user
 */
export async function getLatestTeslaData(userId) {
    const { data, error } = await supabase
        .from('tesla_vehicle_data')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error && error.code === 'PGRST116') return null;
    if (error) throw error;
    return data;
}

/**
 * Get the timestamp of the last pull for a user
 */
export async function getLastTeslaPullTime(userId) {
    const data = await getLatestTeslaData(userId);
    return data ? new Date(data.created_at) : null;
}

/**
 * Get pull frequency setting for a user (default 15 min)
 */
export async function getPullFrequency(userId) {
    try {
        const { data, error } = await supabase
            .from('tesla_user_settings')
            .select('pull_frequency_minutes')
            .eq('id', userId)
            .single();

        if (error && error.code === 'PGRST116') return 15;
        if (error) throw error;
        return data?.pull_frequency_minutes ?? 15;
    } catch (e) {
        console.warn('getPullFrequency failed:', e?.message || e);
        return 15;
    }
}

/**
 * Update pull frequency setting for a user
 */
export async function updatePullFrequency(userId, minutes) {
    const { data, error } = await supabase
        .from('tesla_user_settings')
        .update({ pull_frequency_minutes: minutes })
        .eq('id', userId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export default supabase;
