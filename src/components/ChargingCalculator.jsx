import { useState, useEffect, useCallback } from 'react';
import teslaModels from '../data/teslaModels';
import LocationRate from './LocationRate';
import SavePlan from './SavePlan';
import TeslaPullButton from './TeslaPullButton';
import TeslaMap from './TeslaMap';
import { useAuth } from '../context/AuthContext';
import { getUserSettings } from '../../supabase/client';
import {
    calcEnergyNeeded,
    calcRequiredAmps,
    calcChargingPower,
    calcChargingTime,
    calcCost,
    formatDuration,
    calcChargeSchedule,
    calcHoursAvailable,
    calcSafeAmps,
    getTodayDateStr,
    formatDateTime,
    calcEstimatedRangeAtTarget,
    timeAgo,
} from '../utils/calculations';

const DEFAULT_MODEL = teslaModels[0]; // Model 3

const SCHEDULE_MODES = {
    COMPLETION: 'completion',
    START: 'start',
};

function ChargingCalculator({ onNavigateSettings }) {
    const { user, signOut } = useAuth();
    const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
    const [currentPct, setCurrentPct] = useState(45);
    const [targetPct, setTargetPct] = useState(100);
    const [location, setLocation] = useState(null);
    const [scheduleMode, setScheduleMode] = useState(SCHEDULE_MODES.COMPLETION);
    const [hasCalculated, setHasCalculated] = useState(false);
    const [results, setResults] = useState(null);

    // Tesla range from pull
    const [teslaRange, setTeslaRange] = useState(null);
    const [teslaTimestamp, setTeslaTimestamp] = useState(null);

    // Completion time inputs
    // Default today string for completion date
    const todayStr = new Date().toISOString().split('T')[0];
    
    const [completionDate, setCompletionDate] = useState(todayStr);
    const [completionTime, setCompletionTime] = useState('08:00');

    // Start time inputs
    const [startDate, setStartDate] = useState(todayStr);
    const [startTime, setStartTime] = useState('08:00');

    // Manual amperage mode (when planning by start time)
    const [manualAmps, setManualAmps] = useState(32);
    const [ampsMode, setAmpsMode] = useState('auto'); // 'auto' or 'manual'
    const [toastMsg, setToastMsg] = useState(null);
    const [teslaCoordinate, setTeslaCoordinate] = useState(null);
    const [locationSource, setLocationSource] = useState(null);

    // Load user's default model from settings
    useEffect(() => {
        if (!user) return;
        (async () => {
            try {
                const settings = await getUserSettings(user.id);
                if (settings?.default_model_id) {
                    const model = teslaModels.find(m => m.id === settings.default_model_id);
                    if (model) setSelectedModel(model);
                }
            } catch (e) {
                console.warn('Failed to load user settings:', e);
            }
        })();
    }, [user]);

    // Energy needed (live preview)
    const energyNeeded = calcEnergyNeeded({
        batteryCapacity: selectedModel.batteryCapacity,
        currentPct,
        targetPct,
        batteryRange: teslaRange,
        theoreticalRange: selectedModel.range,
    });

    const handleCalculate = useCallback(() => {
        if (!location) return;
        const safeMaxAmps = calcSafeAmps(location.maxAmps);

        if (scheduleMode === SCHEDULE_MODES.COMPLETION) {
            // Plan by completion time → calculate required amps & start time
            const hoursAvailable = calcHoursAvailable(completionDate, completionTime);

            if (hoursAvailable <= 0 || energyNeeded <= 0) {
                setResults(null);
                setHasCalculated(false);
                return;
            }

            const requiredAmps = calcRequiredAmps(
                energyNeeded,
                hoursAvailable,
                location.voltage
            );

            const actualAmps = Math.min(requiredAmps, safeMaxAmps);
            const actualPower = calcChargingPower(location.voltage, actualAmps);
            const actualDuration = calcChargingTime(energyNeeded, actualPower);
            const schedule = calcChargeSchedule(completionDate, completionTime, actualDuration);

            const totalCost = calcCost(energyNeeded, location.rate);

            setResults({
                mode: 'completion',
                recommendedAmps: Math.round(actualAmps * 10) / 10,
                requestedAmps: Math.round(requiredAmps * 10) / 10,
                duration: formatDuration(actualDuration),
                durationHours: actualDuration,
                startFormatted: schedule.startFormatted,
                endFormatted: schedule.endFormatted,
                energyNeeded: Math.round(energyNeeded * 100) / 100,
                totalCost: Math.round(totalCost * 100) / 100,
                isWithinLimit: requiredAmps <= safeMaxAmps,
                safeMaxAmps,
            });
        } else {
            // Plan by start time → calculate completion time at given amps
            const actualAmps = ampsMode === 'manual' ? manualAmps : safeMaxAmps;
            const clampedAmps = Math.min(actualAmps, safeMaxAmps);

            if (clampedAmps <= 0 || energyNeeded <= 0) {
                setResults(null);
                setHasCalculated(false);
                return;
            }

            const actualPower = calcChargingPower(location.voltage, clampedAmps);
            const actualDuration = calcChargingTime(energyNeeded, actualPower);

            // Calculate completion time from start date/time + duration
            const [sh, smin] = startTime.split(':').map(Number);
            const [sy, smon, sday] = startDate.split('-').map(Number);
            const startDateTime = new Date(sy, smon - 1, sday, sh, smin, 0);

            // If start time is in the past, move to next day
            const now = new Date();
            if (startDateTime <= now) {
                startDateTime.setDate(startDateTime.getDate() + 1);
            }

            const endDateTime = new Date(startDateTime.getTime() + actualDuration * 60 * 60 * 1000);

            const totalCost = calcCost(energyNeeded, location.rate);

            setResults({
                mode: 'start',
                recommendedAmps: clampedAmps,
                duration: formatDuration(actualDuration),
                durationHours: actualDuration,
                startFormatted: formatDateTime(startDateTime),
                endFormatted: formatDateTime(endDateTime),
                energyNeeded: Math.round(energyNeeded * 100) / 100,
                totalCost: Math.round(totalCost * 100) / 100,
                isWithinLimit: actualAmps <= safeMaxAmps,
                safeMaxAmps,
            });
        }

        setHasCalculated(true);
    }, [energyNeeded, scheduleMode, completionDate, completionTime, startDate, startTime, manualAmps, ampsMode, location]);

    // Auto-calculate on input changes
    useEffect(() => {
        if (hasCalculated && location) {
            handleCalculate();
        }
    }, [selectedModel, currentPct, targetPct, scheduleMode, completionDate, completionTime, startDate, startTime, manualAmps, ampsMode, location?.rate, location?.maxAmps, hasCalculated]);

    const handleTeslaDataReceived = useCallback((data) => {
        // Auto-populate battery level from Tesla data
        if (data.battery_level !== undefined) {
            setCurrentPct(data.battery_level);
        }
        // Store actual range from Tesla
        if (data.battery_range !== undefined) {
            setTeslaRange(data.battery_range);
        }
        // Store timestamp from data or now
        setTeslaTimestamp(data.timestamp || new Date().toISOString());

        // Location comes from DB (Tesla Fleet API or phone GPS fallback, handled in TeslaPullButton)
        if (data.latitude !== undefined && data.longitude !== undefined && data.latitude !== null && data.longitude !== null) {
            setTeslaCoordinate({ lat: data.latitude, lng: data.longitude });
        }

        // Track where location came from (tesla vs device)
        if (data.locationSource) {
            setLocationSource(data.locationSource);
        }

        setHasCalculated(false);
    }, []);

    const handleTeslaError = useCallback((errorMsg) => {
        alert(errorMsg);
    }, []);

    const handleTeslaSuccess = useCallback((data) => {
        // Show success toast
        const charging = data.is_charging ? '⚡ Charging' : '';
        const rangeStr = data.battery_range ? ` · ${Math.round(data.battery_range)} km` : '';
        setToastMsg({
            type: 'success',
            text: `🔋 ${data.battery_level}%${rangeStr}${charging ? ' · ' + charging : ''}`,
        });
    }, []);

    // State to force re-render for timeAgo updates
    const [, setTick] = useState(0);
    
    // Update timeAgo every 30 seconds
    useEffect(() => {
        if (!teslaTimestamp) return;
        const interval = setInterval(() => setTick(t => t + 1), 30000);
        return () => clearInterval(interval);
    }, [teslaTimestamp]);

    // Estimated range at target
    const rangeAtTarget = teslaRange ? calcEstimatedRangeAtTarget(teslaRange, currentPct, targetPct) : null;

    return (
        <div className="app-container">
            {/* Toast message */}
            {toastMsg && (
                <div className={`tesla-toast ${toastMsg.type === 'error' ? 'tesla-toast-error' : 'tesla-toast-success'}`}>
                    <span className="material-symbols-outlined">{toastMsg.type === 'error' ? 'error' : 'check_circle'}</span>
                    {toastMsg.text}
                    <button className="toast-close" onClick={() => setToastMsg(null)}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
            )}

            {/* Header */}
            <div className="app-header">
                <div className="app-header-icon">
                    <span className="material-symbols-outlined header-icon-symbol">bolt</span>
                </div>
                <div className="header-title-row">
                    <h1>Mad Max</h1>
                    <button className="btn-settings-icon" onClick={onNavigateSettings} title="Tesla Settings">
                        <span className="material-symbols-outlined">settings</span>
                    </button>
                </div>
                <p>Charging Calculator</p>
            </div>

            {/* Vehicle Card - Read only display */}
            <div className="card-custom">
                <div className="card-custom-title">
                    <span className="material-symbols-outlined card-title-icon">directions_car</span>
                    Vehicle
                </div>
                <div className="vehicle-display">
                    <div className="vehicle-display-icon">
                        <span className="material-symbols-outlined">directions_car</span>
                    </div>
                    <div className="vehicle-display-info">
                        <div className="vehicle-display-name">{selectedModel.name}</div>
                        <div className="vehicle-display-specs">
                            {selectedModel.batteryCapacity} kWh · {selectedModel.range} km
                        </div>
                    </div>
                    <button className="btn-vehicle-change" onClick={onNavigateSettings} title="Change vehicle in Settings">
                        <span className="material-symbols-outlined">settings</span>
                    </button>
                </div>
            </div>

            {/* Battery Card */}
            <div className="card-custom">
                <div className="card-custom-title">
                    <span className="material-symbols-outlined card-title-icon">battery_full</span>
                    Battery
                </div>

                <div className="battery-display">
                    <div className="battery-icon-large">
                        <span className="material-symbols-outlined battery-main-icon">battery_charging_full</span>
                    </div>
                    <div className="battery-info">
                        <div className="battery-pct-label">
                            Current: <span>{currentPct}%</span> &rarr; Target: {targetPct}%
                        </div>
                        <div className="battery-track">
                            <div
                                className="battery-fill"
                                style={{ width: `${(currentPct / targetPct) * 100}%` }}
                            ></div>
                        </div>
                        <div className="battery-markers">
                            <span>
                                {currentPct}% now
                                {teslaRange !== null && <span className="range-indicator"> · {Math.round(teslaRange)} km</span>}
                            </span>
                            <span>
                                {Math.round(energyNeeded)} kWh needed
                                {rangeAtTarget !== null && <span className="range-indicator"> · {rangeAtTarget} km</span>}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="tesla-pull-wrapper">
                    <TeslaPullButton
                        onDataReceived={handleTeslaDataReceived}
                        onError={handleTeslaError}
                        onSuccess={handleTeslaSuccess}
                    />
                    {teslaTimestamp && (
                        <div className="tesla-timestamp">
                            Last updated: {timeAgo(teslaTimestamp)}
                        </div>
                    )}
                </div>

                <div className="form-group mt-4">
                    <label className="form-label">Current Level</label>
                    <div className="range-wrap">
                        <input
                            type="range"
                            className="form-control-custom"
                            min="0"
                            max="100"
                            value={currentPct}
                            onChange={e => setCurrentPct(Number(e.target.value))}
                        />
                        <span className="range-value">{currentPct}%</span>
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label">Target Level</label>
                    <div className="range-wrap">
                        <input
                            type="range"
                            className="form-control-custom"
                            min="50"
                            max="100"
                            value={targetPct}
                            onChange={e => setTargetPct(Number(e.target.value))}
                        />
                        <span className="range-value">{targetPct}%</span>
                    </div>
                </div>
            </div>

            {/* Tesla Location Map */}
            <TeslaMap
                latitude={teslaCoordinate?.lat}
                longitude={teslaCoordinate?.lng}
                locationSource={locationSource}
            />

            {/* Schedule Card */}
            <div className="card-custom">
                <div className="card-custom-title">
                    <span className="material-symbols-outlined card-title-icon">schedule</span>
                    Schedule
                </div>

                {/* Schedule Mode Toggle */}
                <div className="schedule-toggle">
                    <button
                        className={`toggle-btn ${scheduleMode === SCHEDULE_MODES.COMPLETION ? 'active' : ''}`}
                        onClick={() => setScheduleMode(SCHEDULE_MODES.COMPLETION)}
                    >
                        <span className="material-symbols-outlined toggle-icon">check_circle</span>
                        By Completion
                    </button>
                    <button
                        className={`toggle-btn ${scheduleMode === SCHEDULE_MODES.START ? 'active' : ''}`}
                        onClick={() => setScheduleMode(SCHEDULE_MODES.START)}
                    >
                        <span className="material-symbols-outlined toggle-icon">wb_twilight</span>
                        By Start Time
                    </button>
                </div>

                {scheduleMode === SCHEDULE_MODES.COMPLETION ? (
                    <>
                        <div className="form-group">
                            <label className="form-label">Target Date (when to finish)</label>
                            <input
                                type="date"
                                className="form-control-custom"
                                value={completionDate}
                                onChange={e => setCompletionDate(e.target.value)}
                                min={getTodayDateStr()}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Ready by (Time)</label>
                            <input
                                type="time"
                                className="form-control-custom"
                                value={completionTime}
                                onChange={e => setCompletionTime(e.target.value)}
                            />
                        </div>
                    </>
                ) : (
                    <>
                        <div className="form-group">
                            <label className="form-label">Start Date</label>
                            <input
                                type="date"
                                className="form-control-custom"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Start Time</label>
                            <input
                                type="time"
                                className="form-control-custom"
                                value={startTime}
                                onChange={e => setStartTime(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">
                                Amperage Setting
                                <span className="form-label-hint"> (Max safe: {location ? calcSafeAmps(location.maxAmps) : '?'}A)</span>
                            </label>
                            <div className="amps-mode-toggle">
                                <button
                                    className={`toggle-btn-sm ${ampsMode === 'auto' ? 'active' : ''}`}
                                    onClick={() => setAmpsMode('auto')}
                                >
                                    <span className="material-symbols-outlined toggle-icon-sm">auto_schedule</span>
                                    Auto (Max)
                                </button>
                                <button
                                    className={`toggle-btn-sm ${ampsMode === 'manual' ? 'active' : ''}`}
                                    onClick={() => setAmpsMode('manual')}
                                >
                                    <span className="material-symbols-outlined toggle-icon-sm">tune</span>
                                    Manual
                                </button>
                            </div>
                            {ampsMode === 'manual' && (
                                <div className="range-wrap mt-2">
                                    <input
                                        type="range"
                                        className="form-control-custom"
                                        min="5"
                                        max={location ? location.maxAmps : 32}
                                        value={manualAmps}
                                        onChange={e => setManualAmps(Number(e.target.value))}
                                    />
                                    <span className="range-value">{manualAmps} A</span>
                                </div>
                            )}
                            {ampsMode === 'auto' && (
                                <div className="auto-amps-info">
                                    <span className="material-symbols-outlined auto-amps-icon">bolt</span>
                                    Using max safe amperage: <strong>{location ? calcSafeAmps(location.maxAmps) : '?'}A</strong> ({location?.voltage || 240}V)
                                </div>
                            )}
                        </div>
                    </>
                )}

                <div className="form-group">
                    <label className="form-label">Location & Rate</label>
                    <LocationRate
                        selectedLocation={location}
                        onLocationChange={setLocation}
                        teslaCoordinate={teslaCoordinate}
                    />
                </div>
            </div>

            {/* Calculate Button */}
            <button
                className="btn-primary-custom"
                onClick={handleCalculate}
                disabled={energyNeeded <= 0}
            >
                <span className="material-symbols-outlined btn-icon">calculate</span>
                Calculate Charge Plan
            </button>

            {/* Results */}
            {hasCalculated && results && (
                <div className="card-custom mt-4">
                    <div className="card-custom-title">
                        <span className="material-symbols-outlined card-title-icon">summarize</span>
                        Charge Summary
                    </div>

                    <div className="results-section">
                        {results.mode === 'completion' && (
                            <div className="result-item">
                                <span className="result-label">
                                    <span className="material-symbols-outlined result-icon">bolt</span>
                                    Recommended Amps
                                </span>
                                <span className="result-value accent">
                                    {results.recommendedAmps} A
                                    {!results.isWithinLimit && (
                                        <span className="tag tag-green" style={{ marginLeft: 8 }}>
                                            Max {results.safeMaxAmps}A
                                        </span>
                                    )}
                                </span>
                            </div>
                        )}

                        {results.mode === 'start' && (
                            <div className="result-item">
                                <span className="result-label">
                                    <span className="material-symbols-outlined result-icon">bolt</span>
                                    Charging Amps
                                </span>
                                <span className="result-value accent">
                                    {results.recommendedAmps} A
                                    {!results.isWithinLimit && (
                                        <span className="tag tag-green" style={{ marginLeft: 8 }}>
                                            Max {results.safeMaxAmps}A
                                        </span>
                                    )}
                                </span>
                            </div>
                        )}

                        <div className="result-item">
                            <span className="result-label">
                                <span className="material-symbols-outlined result-icon">battery_charging_full</span>
                                Energy Needed
                            </span>
                            <span className="result-value">{results.energyNeeded} kWh</span>
                        </div>

                        <div className="result-item">
                            <span className="result-label">
                                <span className="material-symbols-outlined result-icon">timer</span>
                                Charging Duration
                            </span>
                            <span className="result-value">{results.duration}</span>
                        </div>

                        <div className="result-item">
                            <span className="result-label">
                                <span className="material-symbols-outlined result-icon">wb_twilight</span>
                                Start Charging
                            </span>
                            <span className="result-value green">{results.startFormatted}</span>
                        </div>

                        <div className="result-item">
                            <span className="result-label">
                                <span className="material-symbols-outlined result-icon">check_circle</span>
                                Will Complete
                            </span>
                            <span className="result-value green">{results.endFormatted}</span>
                        </div>

                        <div className="result-item">
                            <span className="result-label">
                                <span className="material-symbols-outlined result-icon">payments</span>
                                Est. Cost
                            </span>
                            <span className="result-value">RM {results.totalCost.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="info-box">
                        <span className="material-symbols-outlined info-icon">lightbulb</span>
                        <span>
                            {results.mode === 'completion' ? (
                                <>Plug in at <strong>{results.startFormatted}</strong> and charge for <strong>{results.duration}</strong>. Ready by <strong>{results.endFormatted}</strong></>
                            ) : (
                                <>Start at <strong>{results.startFormatted}</strong> and charge for <strong>{results.duration}</strong>. Ready by <strong>{results.endFormatted}</strong></>
                            )}
                            {!results.isWithinLimit && (
                                <>
                                    <br />
                                    <span className="material-symbols-outlined warning-icon">warning</span>
                                    Required amps ({results.requestedAmps}A) exceeds safe limit. Using max safe amperage: <strong>{results.safeMaxAmps}A</strong>.
                                </>
                            )}
                        </span>
                    </div>
                </div>
            )}

            {/* Save Plan */}
            <SavePlan
                currentState={{
                    selectedModelId: selectedModel.id,
                    currentPct,
                    targetPct,
                    scheduleMode,
                    completionDate,
                    completionTime,
                    startDate,
                    startTime,
                    location,
                }}
                results={results}
            />

            {/* Bottom Nav Dots */}
            {!hasCalculated && (
                <div className="bottom-nav">
                    <div className="bottom-nav-dot active"></div>
                    <div className="bottom-nav-dot"></div>
                    <div className="bottom-nav-dot"></div>
                </div>
            )}

            {/* Sign Out & User Info */}
            <div className="user-footer">
                <div className="user-email">{user?.email}</div>
                <button className="btn-signout" onClick={signOut}>
                    <span className="material-symbols-outlined">logout</span>
                    Sign Out
                </button>
            </div>
        </div>
    );
}

export default ChargingCalculator;