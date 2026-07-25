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

export default supabase;