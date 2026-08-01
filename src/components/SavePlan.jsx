import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    saveChargingRecord,
    getChargingHistory,
    deleteChargingRecord,
    updateUserSettings,
    getUserSettings,
} from '../../supabase/client';
import teslaModels from '../data/teslaModels';

function SavePlan({ currentState, results }) {
    const { user } = useAuth();
    const [showMenu, setShowMenu] = useState(false);
    const [history, setHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState(null);

    const hasResults = results && results.energyNeeded > 0;

    useEffect(() => {
        if (user) {
            loadSettings();
        }
    }, [user]);

    const loadSettings = async () => {
        try {
            const s = await getUserSettings(user.id);
            setSettings(s);
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    };

    const loadHistory = async () => {
        setLoading(true);
        try {
            const h = await getChargingHistory(user.id);
            setHistory(h);
        } catch (e) {
            console.error('Failed to load history:', e);
        }
        setLoading(false);
    };

    const handleSave = async () => {
        if (!user || !hasResults) return;
        setSaving(true);
        try {
            const record = {
                model_id: currentState.selectedModelId,
                current_pct: currentState.currentPct,
                target_pct: currentState.targetPct,
                schedule_mode: currentState.scheduleMode,
                target_date: currentState.completionDate,
                target_time: currentState.completionTime,
                start_date: currentState.startDate,
                start_time: currentState.startTime,
                amps_used: results.recommendedAmps,
                duration_minutes: Math.round(results.durationHours * 60),
                energy_kwh: results.energyNeeded,
                cost_rm: results.totalCost,
                location_id: currentState.location?.db_id || null,
                notes: `${currentState.location?.name || 'Home'} · ${currentState.selectedModelId} ${currentState.currentPct}% → ${currentState.targetPct}%`,
            };
            await saveChargingRecord(user.id, record);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            console.error('Failed to save:', e);
        }
        setSaving(false);
    };

    const handleDelete = async (id) => {
        try {
            await deleteChargingRecord(id);
            setHistory(prev => prev.filter(h => h.id !== id));
        } catch (e) {
            console.error('Failed to delete:', e);
        }
    };

    const toggleHistory = () => {
        if (!showHistory) {
            loadHistory();
        }
        setShowHistory(!showHistory);
        setShowMenu(false);
    };

    const getModelName = (modelId) => {
        const model = teslaModels.find(m => m.id === modelId);
        return model ? model.name : modelId;
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-MY', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    };

    // Format duration from minutes, e.g. "3h 20min"
    const formatDuration = (minutes) => {
        if (!minutes || minutes <= 0) return '0 min';
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        if (h === 0) return `${m} min`;
        if (m === 0) return `${h}h`;
        return `${h}h ${m}min`;
    };

    // Format a Date object like the Charging Summary, e.g. "Mon, 25 Jul · 5:45 AM"
    const formatDateTime = (date) => {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const ampm = date.getHours() >= 12 ? 'PM' : 'AM';
        const hour12 = date.getHours() % 12 || 12;
        return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} · ${hour12}:${String(date.getMinutes()).padStart(2, '0')} ${ampm}`;
    };

    // Build a Date from "YYYY-MM-DD" + "HH:MM" (or null)
    const buildDateTime = (dateStr, timeStr) => {
        if (!dateStr || !timeStr) return null;
        const [h, m] = timeStr.split(':').map(Number);
        const [y, mo, d] = dateStr.split('-').map(Number);
        if ([h, m, y, mo, d].some(isNaN)) return null;
        return new Date(y, mo - 1, d, h, m, 0);
    };

    // Start Charging time:
    // - 'completion' mode: start = user's chosen target minus duration
    // - 'start' mode:      start = the stored start date/time
    const getStartFormatted = (record) => {
        const durationMs = (Number(record.duration_minutes) || 0) * 60 * 1000;
        if (record.schedule_mode === 'completion') {
            const end = buildDateTime(record.target_date, record.target_time);
            if (!end) return '—';
            return formatDateTime(new Date(end.getTime() - durationMs));
        }
        const start = buildDateTime(record.start_date, record.start_time);
        return start ? formatDateTime(start) : '—';
    };

    // Ready By / Will Complete time:
    // - 'completion' mode: user's chosen target
    // - 'start' mode:      stored start plus charging duration
    const getReadyByFormatted = (record) => {
        const durationMs = (Number(record.duration_minutes) || 0) * 60 * 1000;
        if (record.schedule_mode === 'start') {
            const start = buildDateTime(record.start_date, record.start_time);
            if (!start) return '—';
            return formatDateTime(new Date(start.getTime() + durationMs));
        }
        const end = buildDateTime(record.target_date, record.target_time);
        return end ? formatDateTime(end) : '—';
    };

    const getModeLabel = (mode) => {
        return mode === 'start' ? 'By Start Time' : 'By Completion';
    };

    return (
        <>
            {/* Save Button */}
            <div className="save-section">
                {saved ? (
                    <div className="save-success-msg">
                        <span className="material-symbols-outlined">check_circle</span>
                        Plan Saved!
                    </div>
                ) : (
                    <button
                        className="btn-save"
                        onClick={handleSave}
                        disabled={saving || !hasResults}
                    >
                        <span className="material-symbols-outlined btn-save-icon">
                            {saving ? 'hourglass_top' : 'save'}
                        </span>
                        {saving ? 'Saving...' : 'Save This Plan'}
                    </button>
                )}
            </div>

            {/* History Toggle Button */}
            <button className="btn-history-toggle" onClick={toggleHistory}>
                <span className="material-symbols-outlined">history</span>
                {showHistory ? 'Hide History' : 'Charging History'}
                {history.length > 0 && !showHistory && (
                    <span className="tag tag-blue" style={{ marginLeft: 6 }}>{history.length}</span>
                )}
            </button>

            {/* History Panel */}
            {showHistory && (
                <div className="card-custom history-panel">
                    <div className="card-custom-title">
                        <span className="material-symbols-outlined card-title-icon">history</span>
                        Saved Records
                    </div>

                    {loading ? (
                        <div className="history-loading">Loading...</div>
                    ) : history.length === 0 ? (
                        <div className="history-empty">
                            <span className="material-symbols-outlined empty-icon">database</span>
                            <p>No charging records yet.</p>
                            <p className="text-muted">Calculate and save your first plan!</p>
                        </div>
                    ) : (
                        <div className="history-list">
                            {history.map(record => (
                                <div key={record.id} className="history-item">
                                    <div
                                        className="history-item-main"
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                setExpandedId(expandedId === record.id ? null : record.id);
                                            }
                                        }}
                                    >
                                        <div className="history-item-header">
                                            <span className="history-model">{getModelName(record.model_id)}</span>
                                            <span className={`history-expand-icon ${expandedId === record.id ? 'open' : ''}`}>
                                                <span className="material-symbols-outlined">expand_more</span>
                                            </span>
                                        </div>
                                        <div className="history-details">
                                            <span className="history-pct">
                                                {record.current_pct}% → {record.target_pct}%
                                            </span>
                                            <span className="history-sep">&middot;</span>
                                            <span className="history-energy">{record.energy_kwh} kWh</span>
                                            {record.cost_rm > 0 && (
                                                <>
                                                    <span className="history-sep">&middot;</span>
                                                    <span className="history-cost">RM {record.cost_rm.toFixed(2)}</span>
                                                </>
                                            )}
                                        </div>
                                        <div className="history-date">{formatDate(record.created_at)}</div>
                                    </div>

                                    {/* Expanded detail view like Charging Summary */}
                                    {expandedId === record.id && (
                                        <div className="history-detail">
                                            <div className="history-detail-header">
                                                <span className="material-symbols-outlined history-detail-icon">summarize</span>
                                                Charge Details
                                            </div>
                                            <div className="results-section">
                                                <div className="result-item">
                                                    <span className="result-label">
                                                        <span className="material-symbols-outlined result-icon">tune</span>
                                                        Charging Amps
                                                    </span>
                                                    <span className="result-value accent">{record.amps_used} A</span>
                                                </div>
                                                <div className="result-item">
                                                    <span className="result-label">
                                                        <span className="material-symbols-outlined result-icon">location_on</span>
                                                        Location
                                                    </span>
                                                    <span className="result-value">{record.location?.name || '—'}</span>
                                                </div>
                                                <div className="result-item">
                                                    <span className="result-label">
                                                        <span className="material-symbols-outlined result-icon">battery_charging_full</span>
                                                        Energy Needed
                                                    </span>
                                                    <span className="result-value">{record.energy_kwh} kWh</span>
                                                </div>
                                                <div className="result-item">
                                                    <span className="result-label">
                                                        <span className="material-symbols-outlined result-icon">timer</span>
                                                        Charging Duration
                                                    </span>
                                                    <span className="result-value">{formatDuration(record.duration_minutes)}</span>
                                                </div>
                                                <div className="result-item">
                                                    <span className="result-label">
                                                        <span className="material-symbols-outlined result-icon">wb_twilight</span>
                                                        Start Charging
                                                    </span>
                                                    <span className="result-value green">{getStartFormatted(record)}</span>
                                                </div>
                                                <div className="result-item">
                                                    <span className="result-label">
                                                        <span className="material-symbols-outlined result-icon">check_circle</span>
                                                        {record.schedule_mode === 'completion' ? 'Will Complete' : 'Ready By'}
                                                    </span>
                                                    <span className="result-value green">{getReadyByFormatted(record)}</span>
                                                </div>
                                                <div className="result-item">
                                                    <span className="result-label">
                                                        <span className="material-symbols-outlined result-icon">schedule</span>
                                                        Schedule Mode
                                                    </span>
                                                    <span className="result-value">{getModeLabel(record.schedule_mode)}</span>
                                                </div>
                                                <div className="result-item">
                                                    <span className="result-label">
                                                        <span className="material-symbols-outlined result-icon">payments</span>
                                                        Est. Cost
                                                    </span>
                                                    <span className="result-value">RM {Number(record.cost_rm || 0).toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

export default SavePlan;