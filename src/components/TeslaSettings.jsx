import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getTeslaSettings, updateTeslaSettings, disconnectTesla } from '../../supabase/client';

const EDGE_FUNCTION_BASE = import.meta.env.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tesla-proxy`
    : '';

function TeslaSettings({ onBack, initialMessage }) {
    const { user, signOut } = useAuth();

    const [isConnected, setIsConnected] = useState(false);
    const [lastSync, setLastSync] = useState(null);
    const [vehicleName, setVehicleName] = useState('');
    const [vehicleVin, setVehicleVin] = useState('');
    const [message, setMessage] = useState(initialMessage || null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        loadSettings();
    }, [user]);

    const loadSettings = async () => {
        try {
            const s = await getTeslaSettings(user.id);
            if (s) {
                setIsConnected(s.tesla_connected || false);
                setLastSync(s.tesla_last_sync || null);
                setVehicleName(s.tesla_vehicle_name || '');
                setVehicleVin(s.tesla_vehicle_vin || '');
            }
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const handleConnect = () => {
        if (!user) return;
        const url = `${EDGE_FUNCTION_BASE}/authorize?user_id=${encodeURIComponent(user.id)}`;
        window.location.href = url;
    };

    const handleDisconnect = async () => {
        try {
            await disconnectTesla(user.id);
            setIsConnected(false);
            setVehicleName('');
            setVehicleVin('');
            setLastSync(null);
            setMessage({ type: 'success', text: 'Disconnected.' });
        } catch (e) {
            setMessage({ type: 'error', text: e.message });
        }
    };

    const handleSaveVin = async () => {
        if (!user || !vehicleVin.trim()) return;
        try {
            await updateTeslaSettings(user.id, {
                tesla_vehicle_vin: vehicleVin.trim().toUpperCase(),
                tesla_vehicle_name: vehicleName.trim() || 'My Tesla',
            });
            setMessage({ type: 'success', text: 'VIN saved! Try Pull from Tesla.' });
        } catch (e) {
            setMessage({ type: 'error', text: 'Failed: ' + e.message });
        }
    };

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';

    if (loading) {
        return (
            <div className="app-container">
                <div className="app-header">
                    <div className="app-header-icon"><span className="material-symbols-outlined header-icon-symbol">settings</span></div>
                    <h1>Mad Max</h1>
                    <p>Tesla Settings</p>
                </div>
                <div className="loading-card"><div className="history-loading">Loading...</div></div>
            </div>
        );
    }

    return (
        <div className="app-container">
            <div className="app-header">
                <div className="app-header-icon"><span className="material-symbols-outlined header-icon-symbol">settings</span></div>
                <h1>Mad Max</h1>
                <p>Tesla Settings</p>
            </div>

            <button className="btn-back" onClick={onBack}>
                <span className="material-symbols-outlined">arrow_back</span> Back
            </button>

            <div className="card-custom">
                <div className="card-custom-title">
                    <span className="material-symbols-outlined card-title-icon">{isConnected ? 'check_circle' : 'link_off'}</span>
                    Status
                </div>
                <div className={`tesla-status-badge ${isConnected ? 'connected' : 'disconnected'}`}>
                    <span className="material-symbols-outlined">{isConnected ? 'check_circle' : 'cancel'}</span>
                    <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
                </div>
                {vehicleVin && (
                    <div className="tesla-vehicle-preview">
                        <div className="tesla-vehicle-preview-icon"><span className="material-symbols-outlined">directions_car</span></div>
                        <div className="tesla-vehicle-preview-info">
                            <div className="tesla-vehicle-preview-name">{vehicleName || 'Tesla'}</div>
                            <div className="tesla-vehicle-preview-vin">VIN: {vehicleVin}</div>
                        </div>
                    </div>
                )}
                <div className="tesla-info-row">
                    <span className="tesla-info-label">Last Sync</span>
                    <span className="tesla-info-value">{formatDate(lastSync)}</span>
                </div>
            </div>

            <div className="card-custom">
                <div className="card-custom-title">
                    <span className="material-symbols-outlined card-title-icon">link</span>
                    Connect Your Tesla
                </div>
                <p className="tesla-hint">Click the button to log in with your Tesla account and authorize this app.</p>

                {!isConnected ? (
                    <button className="btn-connect-tesla" onClick={handleConnect}>
                        <span className="material-symbols-outlined">directions_car</span>
                        Connect with Tesla
                    </button>
                ) : (
                    <button className="btn-danger" onClick={handleDisconnect}>
                        <span className="material-symbols-outlined">link_off</span>
                        Disconnect Tesla
                    </button>
                )}
            </div>

            {/* VIN Input - show when connected */}
            {isConnected && (
                <div className="card-custom">
                    <div className="card-custom-title">
                        <span className="material-symbols-outlined card-title-icon">directions_car</span>
                        Vehicle VIN
                    </div>
                    <p className="tesla-hint">Masukkan VIN kereta Tesla kau untuk pull data.</p>
                    <div className="form-group">
                        <label className="form-label">VIN</label>
                        <input type="text" className="form-control-custom"
                            placeholder="Contoh: LRW3F7FS6SC704473"
                            value={vehicleVin}
                            onChange={e => setVehicleVin(e.target.value.toUpperCase())} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Vehicle Name (optional)</label>
                        <input type="text" className="form-control-custom"
                            placeholder="My Tesla"
                            value={vehicleName}
                            onChange={e => setVehicleName(e.target.value)} />
                    </div>
                    <button className="btn-primary-custom" onClick={handleSaveVin} disabled={!vehicleVin.trim()}>
                        <span className="material-symbols-outlined">save</span>
                        Save VIN
                    </button>
                </div>
            )}

            {message && (
                <div className={`tesla-message ${message.type === 'error' ? 'tesla-message-error' : 'tesla-message-success'}`}>
                    <span className="material-symbols-outlined">{message.type === 'error' ? 'error' : 'check_circle'}</span>
                    {message.text}
                </div>
            )}

            <div className="info-box mt-4">
                <span className="material-symbols-outlined info-icon">info</span>
                <span>
                    <strong>PENTING:</strong><br />
                    Dalam <strong>Tesla Developer Portal</strong>, pastikan Redirect URI set ke:<br />
                    <code className="tesla-code">{window.location.origin}/callback</code>
                    <br />Lepas connect, isi VIN dan click <strong>Save VIN</strong>. Lepas tu balik calculator → <strong>Pull from Tesla</strong>!
                </span>
            </div>

            <div className="user-footer">
                <div className="user-email">{user?.email}</div>
                <button className="btn-signout" onClick={signOut}>
                    <span className="material-symbols-outlined">logout</span> Sign Out
                </button>
            </div>
        </div>
    );
}

export default TeslaSettings;