import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const EDGE_FUNCTION_BASE = import.meta.env.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tesla-proxy`
    : '';

function TeslaPullButton({ onDataReceived, onError, onSuccess }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);

    const handlePull = async () => {
        if (!user || loading) return;
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

            // Show success toast with key data
            if (onSuccess) {
                onSuccess({
                    battery_level: data.battery_level,
                    battery_range: data.battery_range,
                    is_charging: data.is_charging,
                });
            }

            if (onDataReceived) {
                onDataReceived({
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
        } catch (e) {
            if (onError) onError(e.message);
        }
        setLoading(false);
    };

    return (
        <button className="tesla-pull-btn" onClick={handlePull} disabled={loading}>
            <span className="material-symbols-outlined">{loading ? 'radar' : 'bolt'}</span>
            {loading ? 'Fetching...' : 'Pull from Tesla'}
        </button>
    );
}

export default TeslaPullButton;