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
                                    <div className="history-item-header">
                                        <span className="history-model">{getModelName(record.model_id)}</span>
                                        <button
                                            className="history-delete-btn"
                                            onClick={() => handleDelete(record.id)}
                                        >
                                            <span className="material-symbols-outlined">delete</span>
                                        </button>
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
                            ))}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

export default SavePlan;