import { useState, useEffect, useCallback } from 'react';
import teslaModels from '../data/teslaModels';
import LocationRate from './LocationRate';
import SavePlan from './SavePlan';
import { useAuth } from '../context/AuthContext';
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
} from '../utils/calculations';

const DEFAULT_MODEL = teslaModels[0]; // Model 3

const SCHEDULE_MODES = {
    COMPLETION: 'completion',
    START: 'start',
};

function ChargingCalculator() {
    const { user, signOut } = useAuth();
    const [selectedModelId, setSelectedModelId] = useState(DEFAULT_MODEL.id);
    const [currentPct, setCurrentPct] = useState(45);
    const [targetPct, setTargetPct] = useState(100);
    const [location, setLocation] = useState({
        id: 'home',
        name: 'Home',
        rate: 0.38,
        voltage: 240,
        icon: 'home',
        maxAmps: 32,
    });
    const [scheduleMode, setScheduleMode] = useState(SCHEDULE_MODES.COMPLETION);
    const [hasCalculated, setHasCalculated] = useState(false);
    const [results, setResults] = useState(null);

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

    const selectedModel = teslaModels.find(m => m.id === selectedModelId) || DEFAULT_MODEL;

    // Energy needed (live preview)
    const energyNeeded = calcEnergyNeeded(
        selectedModel.batteryCapacity,
        currentPct,
        targetPct
    );

    const handleCalculate = useCallback(() => {
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
        if (hasCalculated) {
            handleCalculate();
        }
    }, [selectedModelId, currentPct, targetPct, scheduleMode, completionDate, completionTime, startDate, startTime, manualAmps, ampsMode, location.rate, location.maxAmps, hasCalculated]);

    return (
        <div className="app-container">
            {/* Header */}
            <div className="app-header">
                <div className="app-header-icon">
                    <span className="material-symbols-outlined header-icon-symbol">bolt</span>
                </div>
                <h1>My Tesla Monitor</h1>
                <p>Charging Calculator</p>
            </div>

            {/* Vehicle Card */}
            <div className="card-custom">
                <div className="card-custom-title">
                    <span className="material-symbols-outlined card-title-icon">directions_car</span>
                    Vehicle
                </div>
                <div className="form-group">
                    <label className="form-label">Tesla Model</label>
                    <select
                        className="form-control-custom"
                        value={selectedModelId}
                        onChange={e => setSelectedModelId(e.target.value)}
                    >
                        {teslaModels.map(model => (
                            <option key={model.id} value={model.id}>
                                {model.name} ({model.batteryCapacity} kWh)
                            </option>
                        ))}
                    </select>
                </div>
                <div className="spec-chips">
                    <span className="spec-chip">
                        <span className="material-symbols-outlined spec-icon">battery_charging_full</span>
                        {selectedModel.batteryCapacity} kWh
                    </span>
                    <span className="spec-chip">
                        <span className="material-symbols-outlined spec-icon">route</span>
                        {selectedModel.range} km
                    </span>
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
                            <span>{currentPct}% now</span>
                            <span>{Math.round(energyNeeded)} kWh needed</span>
                        </div>
                    </div>
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
                                <span className="form-label-hint"> (Max safe: {calcSafeAmps(location.maxAmps)}A)</span>
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
                                        max={location.maxAmps}
                                        value={manualAmps}
                                        onChange={e => setManualAmps(Number(e.target.value))}
                                    />
                                    <span className="range-value">{manualAmps} A</span>
                                </div>
                            )}
                            {ampsMode === 'auto' && (
                                <div className="auto-amps-info">
                                    <span className="material-symbols-outlined auto-amps-icon">bolt</span>
                                    Using max safe amperage: <strong>{calcSafeAmps(location.maxAmps)}A</strong> ({location.voltage}V)
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
                    selectedModelId,
                    currentPct,
                    targetPct,
                    scheduleMode,
                    completionDate,
                    completionTime,
                    startDate,
                    startTime,
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