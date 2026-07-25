import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    saveTeslaVehicleData,
    getLatestTeslaData,
    getLastTeslaPullTime,
    getPullFrequency,
} from '../../supabase/client';

const EDGE_FUNCTION_BASE = import.meta.env.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tesla-proxy`
    : '';

function TeslaPullButton({ onDataReceived, onError, onSuccess }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [cooldown, setCooldown] = useState(false);
    const initialLoadDone = useRef(false);
    const loadingRef = useRef(false);

    // Stable callback refs for event handlers
    const onDataReceivedRef = useRef(onDataReceived);
    const onErrorRef = useRef(onError);
    const onSuccessRef = useRef(onSuccess);
    onDataReceivedRef.current = onDataReceived;
    onErrorRef.current = onError;
    onSuccessRef.current = onSuccess;

    const performPull = useCallback(async (silent = false) => {
        if (!user || loadingRef.current) return;
        loadingRef.current = true;
        setLoading(true);

        try {
            const response = await fetch(`${EDGE_FUNCTION_BASE}/vehicle-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to pull data');
            }

            const data = await response.json();

            // Save to database
            await saveTeslaVehicleData(user.id, data);

            // Show success toast (unless silent auto-pull)
            if (!silent && onSuccessRef.current) {
                onSuccessRef.current({
                    battery_level: data.battery_level,
                    battery_range: data.battery_range,
                    is_charging: data.is_charging,
                });
            }

            // Send data to parent
            if (onDataReceivedRef.current) {
                onDataReceivedRef.current({
                    battery_level: data.battery_level,
                    battery_range: data.battery_range,
                    estimated_range: data.estimated_range,
                    charge_state: data.charge_state,
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
                    timestamp: new Date().toISOString(),
                });
            }

            // Update cooldown state (now freshly pulled)
            setCooldown(true);
        } catch (e) {
            if (!silent && onErrorRef.current) onErrorRef.current(e.message);
        }
        loadingRef.current = false;
        setLoading(false);
    }, [user]);

    // On mount: load latest DB data, then decide if auto-pull needed
    useEffect(() => {
        if (!user || initialLoadDone.current) return;
        initialLoadDone.current = true;

        (async () => {
            try {
                // 1. Load latest data from DB to pre-populate
                const latest = await getLatestTeslaData(user.id);
                if (latest) {
                    const dbData = {
                        battery_level: latest.battery_level,
                        battery_range: latest.battery_range,
                        estimated_range: latest.estimated_range,
                        charge_state: latest.is_charging ? 'Charging' : 'Disconnected',
                        is_charging: latest.is_charging,
                        charge_power: latest.charge_power,
                        charge_voltage: latest.charge_voltage,
                        charge_amps: latest.charge_amps,
                        odometer: latest.odometer,
                        locked: latest.locked,
                        sentry_mode: latest.sentry_mode,
                        inside_temp: latest.inside_temp,
                        outside_temp: latest.outside_temp,
                        latitude: latest.latitude,
                        longitude: latest.longitude,
                        model: latest.model,
                        trim: latest.trim,
                        timestamp: latest.created_at,
                    };

                    if (onDataReceivedRef.current) {
                        onDataReceivedRef.current(dbData);
                    }
                }

                // 2. Check if auto-pull should trigger
                const lastPull = await getLastTeslaPullTime(user.id);
                const frequencyMinutes = await getPullFrequency(user.id);
                const frequencyMs = frequencyMinutes * 60 * 1000;

                const now = Date.now();
                const sinceLastPull = lastPull ? now - lastPull.getTime() : Infinity;

                // Set cooldown state for button color
                const isCooldown = lastPull !== null && sinceLastPull < frequencyMs;
                setCooldown(isCooldown);

                // Auto-pull if no recent data
                if (sinceLastPull >= frequencyMs) {
                    await performPull(true); // silent = true
                }
            } catch (e) {
                console.warn('TeslaPullButton init error:', e);
            }
        })();
    }, [user, performPull]);

    const handlePull = () => {
        performPull(false);
    };

    const btnClass = `tesla-pull-btn${cooldown ? ' cooldown' : ''}`;

    return (
        <button className={btnClass} onClick={handlePull} disabled={loading}>
            <span className="material-symbols-outlined">{loading ? 'radar' : cooldown ? 'check_circle' : 'bolt'}</span>
            {loading ? 'Fetching...' : cooldown ? 'Data Ready' : 'Pull from Tesla'}
        </button>
    );
}

export default TeslaPullButton;