import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getUserSettings, updateUserSettings, getTeslaSettings, updateTeslaSettings, disconnectTesla, getPullFrequency, updatePullFrequency, getLatestTeslaData, getSnapshotTime, updateSnapshotTime } from '../../supabase/client';
import { getChargingEfficiency, setChargingEfficiency, resetChargingEfficiency, calibrateEfficiencyFromData } from '../utils/calibration';
import teslaModels from '../data/teslaModels';

const EDGE_FUNCTION_BASE = import.meta.env.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tesla-proxy`
    : '';

function TeslaSettings({ initialMessage }) {
    const { user, signOut } = useAuth();

    const [isConnected, setIsConnected] = useState(false);
    const [lastSync, setLastSync] = useState(null);
    const [vehicleName, setVehicleName] = useState('');
    const [vehicleVin, setVehicleVin] = useState('');
    const [message, setMessage] = useState(initialMessage || null);
    const [loading, setLoading] = useState(true);
    const [pullFrequency, setPullFrequency] = useState(15);
    const [snapshotTime, setSnapshotTime] = useState('02:30');
    const [defaultModelId, setDefaultModelId] = useState('model3');
    const [showDisconnect, setShowDisconnect] = useState(false);
    const [showSaveVin, setShowSaveVin] = useState(false);

    useEffect(() => {
        if (!user) return;
        loadSettings();
    }, [user]);

    // Auto-fill borang calibration dari data pull Tesla terkini
    const prefillCalibration = (latest) => {
        if (!latest) return;
        if (latest.battery_level != null) setCalCurrentPct(Math.round(latest.battery_level));
        if (latest.battery_range != null) {
            const km = Math.round(latest.battery_range);
            setCalCurrentKm(km);
            // Target range penuh = range semasa / (level/100), cth 139km @ 31% -> ~448km
            if (latest.battery_level > 0) {
                setCalTargetKm(Math.round(km / (latest.battery_level / 100)));
            }
        }
        if (latest.charge_amps > 0) setCalAmps(latest.charge_amps);
        if (latest.charge_voltage > 0) setCalVoltage(latest.charge_voltage);
        setTeslaLatest(latest);
    };

    const loadSettings = async () => {
        try {
            const s = await getTeslaSettings(user.id);
            if (s) {
                setIsConnected(s.tesla_connected || false);
                setLastSync(s.tesla_last_sync || null);
                setVehicleName(s.tesla_vehicle_name || '');
                setVehicleVin(s.tesla_vehicle_vin || '');
            }
            // Load pull frequency
            const freq = await getPullFrequency(user.id);
            setPullFrequency(freq);
            // Load daily snapshot time
            const snapTime = await getSnapshotTime(user.id);
            setSnapshotTime(snapTime);
            // Load default model
            const userSettings = await getUserSettings(user.id);
            if (userSettings?.default_model_id) {
                setDefaultModelId(userSettings.default_model_id);
            }
            // Auto-fill borang calibration dari data pull terkini
            try {
                const latest = await getLatestTeslaData(user.id);
                if (latest) prefillCalibration(latest);
            } catch (e) {
                console.warn('No Tesla data to prefill calibration:', e.message);
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

    const handleModelChange = async (e) => {
        const val = e.target.value;
        setDefaultModelId(val);
        if (!user) return;
        try {
            await updateUserSettings(user.id, { default_model_id: val });
            setMessage({ type: 'success', text: `Vehicle set to ${teslaModels.find(m => m.id === val)?.name || val}.` });
        } catch (err) {
            setMessage({ type: 'error', text: 'Failed: ' + err.message });
        }
    };

    const handleFrequencyChange = async (e) => {
        const val = parseInt(e.target.value, 10);
        setPullFrequency(val);
        if (!user) return;
        try {
            await updatePullFrequency(user.id, val);
            setMessage({ type: 'success', text: `Auto-pull frequency set to ${val} minutes.` });
        } catch (err) {
            setMessage({ type: 'error', text: 'Failed: ' + err.message });
        }
    };

    const handleSnapshotTimeChange = async (e) => {
        const val = e.target.value; // 'HH:MM'
        setSnapshotTime(val);
        if (!user || !val) return;
        try {
            await updateSnapshotTime(user.id, val);
            setMessage({ type: 'success', text: `Daily snapshot set to ${val} (Malaysia time).` });
        } catch (err) {
            setMessage({ type: 'error', text: 'Failed: ' + err.message });
        }
    };

    // ===== Calibration Charging =====
    const [efficiency, setEfficiency] = useState(getChargingEfficiency);
    const [calAmps, setCalAmps] = useState('');
    const [calVoltage, setCalVoltage] = useState(240);
    const [calCurrentPct, setCalCurrentPct] = useState('');
    const [calTargetPct, setCalTargetPct] = useState(100);
    // Mode input data calibration: 'pct' atau 'km' (ikut apa Tesla app tunjuk)
    const [calMode, setCalMode] = useState('pct');
    const [teslaLatest, setTeslaLatest] = useState(null);
    const [calCurrentKm, setCalCurrentKm] = useState('');
    const [calTargetKm, setCalTargetKm] = useState('');
    const [calHours, setCalHours] = useState('');
    const [calMinutes, setCalMinutes] = useState('');
    const [calResult, setCalResult] = useState(null);

    const handleEfficiencySave = () => {
        const v = setChargingEfficiency(efficiency);
        setEfficiency(v);
        setMessage({ type: 'success', text: `Calibration efficiency disimpan: ${(v * 100).toFixed(0)}%.` });
    };

    const handleEfficiencyReset = () => {
        const v = resetChargingEfficiency();
        setEfficiency(v);
        setCalResult(null);
        setMessage({ type: 'success', text: `Calibration di-reset ke default (${(v * 100).toFixed(0)}%).` });
    };

    const handleReloadTeslaData = async () => {
        if (!user) return;
        try {
            const latest = await getLatestTeslaData(user.id);
            if (!latest) {
                setMessage({ type: 'error', text: 'Tiada data pull. Tekan Pull from Tesla dulu di calculator.' });
                return;
            }
            prefillCalibration(latest);
            setMessage({ type: 'success', text: 'Borang calibration di-auto-fill dari data pull terkini.' });
        } catch (e) {
            setMessage({ type: 'error', text: 'Failed: ' + e.message });
        }
    };

    const handleAutoCalibrate = () => {
        const model = teslaModels.find(m => m.id === defaultModelId) || teslaModels[0];
        const hours = parseFloat(calHours) || 0;
        const minutes = parseFloat(calMinutes) || 0;
        const durationHours = hours + minutes / 60;

        const eff = calibrateEfficiencyFromData({
            batteryCapacity: model.batteryCapacity,
            currentPct: calCurrentPct,
            targetPct: calTargetPct,
            currentKm: calCurrentKm,
            targetKm: calTargetKm,
            theoreticalRange: model.range,
            amps: calAmps,
            voltage: calVoltage,
            durationHours,
        });
        if (isNaN(eff)) {
            setCalResult({ error: 'Data tak lengkap atau tak sah. Pastikan semua ruang diisi dengan betul.' });
            return;
        }
        setCalResult({ efficiency: eff, durationHours });
    };

    const handleApplyCalibration = () => {
        if (!calResult?.efficiency) return;
        const v = setChargingEfficiency(calResult.efficiency);
        setEfficiency(v);
        setMessage({ type: 'success', text: `Auto-calibration diguna: ${(v * 100).toFixed(1)}% efficiency.` });
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
                    <>
                        <div className="hidden-btn-area" onClick={() => setShowDisconnect(!showDisconnect)}>
                            <span className="material-symbols-outlined hidden-btn-icon">more_horiz</span>
                            <span className="hidden-btn-label">Tap for options</span>
                        </div>
                        {showDisconnect && (
                            <button className="btn-danger" onClick={handleDisconnect}>
                                <span className="material-symbols-outlined">link_off</span>
                                Disconnect Tesla
                            </button>
                        )}
                    </>
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
                    <div className="hidden-btn-area" onClick={() => setShowSaveVin(!showSaveVin)}>
                        <span className="material-symbols-outlined hidden-btn-icon">more_horiz</span>
                        <span className="hidden-btn-label">Tap to save</span>
                    </div>
                    {showSaveVin && (
                        <button className="btn-primary-custom mt-2" onClick={handleSaveVin} disabled={!vehicleVin.trim()}>
                            <span className="material-symbols-outlined">save</span>
                            Save VIN
                        </button>
                    )}
                </div>
            )}

            {/* Charging Calibration */}
            <div className="card-custom">
                <div className="card-custom-title">
                    <span className="material-symbols-outlined card-title-icon">bolt</span>
                    Calibration Charging
                </div>
                <p className="tesla-hint">
                    Efficiency = % tenaga dari dinding yang sampai ke bateri (AC charging ada ~10% loss).
                    Default 90% dicap dari data sebenar Tesla app. Adjust ikut pengalaman anda.
                </p>

                {/* (a) Adjust manual */}
                <div className="form-group">
                    <label className="form-label">Efficiency ({(efficiency * 100).toFixed(0)}%)</label>
                    <input
                        type="range"
                        className="form-range"
                        min="70"
                        max="100"
                        step="1"
                        value={Math.round(efficiency * 100)}
                        onChange={(e) => setEfficiency(parseInt(e.target.value, 10) / 100)}
                    />
                    <div className="d-flex gap-2 mt-2">
                        <button className="btn-signout flex-fill" style={{ background: '#2e7d32', color: '#fff' }} onClick={handleEfficiencySave}>
                            Simpan
                        </button>
                        <button className="btn-signout flex-fill" onClick={handleEfficiencyReset}>
                            Reset Default
                        </button>
                    </div>
                </div>

                <hr />

                {/* (b) Auto-calibrate dari data Tesla app */}
                <p className="tesla-hint">
                    <strong>Auto-Calibrate:</strong> bandingkan anggaran masa Tesla app dengan kalkulator.
                    Isi data yang sama macam dalam Tesla app, sistem kira efficiency sendiri.
                </p>
                {teslaLatest && (
                    <div className="tesla-message tesla-message-success mb-3">
                        <div className="d-flex align-items-start justify-content-between gap-2">
                            <span style={{ minWidth: 0, wordBreak: 'break-word' }}>
                                <strong>Data pull:</strong> {Math.round(teslaLatest.battery_range || 0)} km · {Math.round(teslaLatest.battery_level || 0)}%
                                {teslaLatest.created_at && (
                                    <>
                                        <br />
                                        <small>{new Date(teslaLatest.created_at).toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
                                    </>
                                )}
                            </span>
                            <button
                                type="button"
                                className="btn-signout"
                                style={{ padding: '0.35rem 0.9rem', flexShrink: 0, whiteSpace: 'nowrap' }}
                                onClick={handleReloadTeslaData}
                            >
                                Auto-fill
                            </button>
                        </div>
                    </div>
                )}
                <div className="form-group">
                    <label className="form-label">Isi Data Ikut</label>
                    <div className="d-flex gap-2">
                        <button type="button" className="btn-signout flex-fill"
                            style={calMode === 'pct' ? { background: '#1565c0', color: '#fff' } : {}}
                            onClick={() => setCalMode('pct')}>
                            Peratus (%)
                        </button>
                        <button type="button" className="btn-signout flex-fill"
                            style={calMode === 'km' ? { background: '#1565c0', color: '#fff' } : {}}
                            onClick={() => setCalMode('km')}>
                            Jarak (km)
                        </button>
                    </div>
                </div>
                <div className="row g-2">
                    {calMode === 'km' ? (
                        <>
                            <div className="col-6">
                                <label className="form-label">Range semasa (km)</label>
                                <input type="number" min="0" className="form-control-custom" placeholder="cth: 139"
                                    value={calCurrentKm} onChange={(e) => setCalCurrentKm(e.target.value)} />
                            </div>
                            <div className="col-6">
                                <label className="form-label">Target range (km)</label>
                                <input type="number" min="0" className="form-control-custom" placeholder={"cth: " + (teslaModels.find(m => m.id === defaultModelId)?.range || 490)}
                                    value={calTargetKm} onChange={(e) => setCalTargetKm(e.target.value)} />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="col-6">
                                <label className="form-label">Bateri semasa (%)</label>
                                <input type="number" min="1" max="99" className="form-control-custom" placeholder="cth: 31"
                                    value={calCurrentPct} onChange={(e) => setCalCurrentPct(e.target.value)} />
                            </div>
                            <div className="col-6">
                                <label className="form-label">Target (%)</label>
                                <input type="number" min="50" max="100" className="form-control-custom" value={calTargetPct}
                                    onChange={(e) => setCalTargetPct(e.target.value)} />
                            </div>
                        </>
                    )}
                    <div className="col-6">
                        <label className="form-label">Amps di app (A)</label>
                        <input type="number" min="1" max="64" className="form-control-custom" placeholder="cth: 17"
                            value={calAmps} onChange={(e) => setCalAmps(e.target.value)} />
                    </div>
                    <div className="col-6">
                        <label className="form-label">Voltage (V)</label>
                        <input type="number" min="100" max="500" className="form-control-custom" value={calVoltage}
                            onChange={(e) => setCalVoltage(e.target.value)} />
                    </div>
                    <div className="col-6">
                        <label className="form-label">Masa Tesla app (jam)</label>
                        <input type="number" min="0" max="48" className="form-control-custom" placeholder="cth: 11"
                            value={calHours} onChange={(e) => setCalHours(e.target.value)} />
                    </div>
                    <div className="col-6">
                        <label className="form-label">Minit</label>
                        <input type="number" min="0" max="59" className="form-control-custom" placeholder="cth: 20"
                            value={calMinutes} onChange={(e) => setCalMinutes(e.target.value)} />
                    </div>
                </div>
                <button className="btn-signout w-100 mt-3" style={{ background: '#1565c0', color: '#fff' }} onClick={handleAutoCalibrate}>
                    Kira Efficiency
                </button>

                {calResult?.error && (
                    <div className="tesla-message tesla-message-error mt-3">{calResult.error}</div>
                )}
                {calResult?.efficiency && (
                    <div className="tesla-message tesla-message-success mt-3">
                        Efficiency dicap: <strong>{(calResult.efficiency * 100).toFixed(1)}%</strong>
                        <button className="btn-signout w-100 mt-2" style={{ background: '#2e7d32', color: '#fff' }} onClick={handleApplyCalibration}>
                            Guna Nilai Ni
                        </button>
                    </div>
                )}
            </div>

            {/* Vehicle Model Selection */}
            <div className="card-custom">
                <div className="card-custom-title">
                    <span className="material-symbols-outlined card-title-icon">directions_car</span>
                    Vehicle Model
                </div>
                <p className="tesla-hint">Pilih model Tesla kau. Guna data sebenar dari Tesla untuk anggaran lebih tepat.</p>
                <div className="form-group">
                    <label className="form-label">Model</label>
                    <select className="form-control-custom" value={defaultModelId} onChange={handleModelChange}>
                        {teslaModels.map(model => (
                            <option key={model.id} value={model.id}>
                                {model.name} ({model.batteryCapacity} kWh · {model.range} km)
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Pull Frequency Setting */}
            {isConnected && (
                <div className="card-custom">
                    <div className="card-custom-title">
                        <span className="material-symbols-outlined card-title-icon">sync</span>
                        Auto-Pull Frequency
                    </div>
                    <p className="tesla-hint">Set berapa minit sekali auto-pull data dari Tesla. Button manual tetap boleh guna bila-bila masa.</p>
                    <div className="form-group">
                        <label className="form-label">Check every</label>
                        <select className="form-control-custom" value={pullFrequency} onChange={handleFrequencyChange}>
                            <option value={1}>1 minute</option>
                            <option value={5}>5 minutes</option>
                            <option value={10}>10 minutes</option>
                            <option value={15}>15 minutes</option>
                            <option value={30}>30 minutes</option>
                            <option value={60}>60 minutes</option>
                        </select>
                    </div>
                </div>
            )}

            {/* Daily Snapshot Time Setting */}
            {isConnected && (
                <div className="card-custom">
                    <div className="card-custom-title">
                        <span className="material-symbols-outlined card-title-icon">schedule</span>
                        Daily Snapshot Time
                    </div>
                    <p className="tesla-hint">Masa (Malaysia) sistem auto-pull odometer &amp; battery untuk graf Mileage. Default 02:30 — elak masa Tesla auto-update (biasanya ~3-4 AM).</p>
                    <div className="form-group">
                        <label className="form-label">Run daily at</label>
                        <input
                            type="time"
                            className="form-control-custom"
                            value={snapshotTime}
                            onChange={handleSnapshotTimeChange}
                        />
                    </div>
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