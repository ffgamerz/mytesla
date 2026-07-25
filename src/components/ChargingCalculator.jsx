import { useState, useEffect, useCallback } from 'react';
import teslaModels from '../data/teslaModels';
import LocationRate from './LocationRate';
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
    getTomorrowDateStr,
} from '../utils/calculations';

const DEFAULT_MODEL = teslaModels[0]; // Model 3

function ChargingCalculator() {
    const [selectedModelId, setSelectedModelId] = useState(DEFAULT_MODEL.id);
    const [currentPct, setCurrentPct] = useState(45);
    const [targetPct, setTargetPct] = useState(100);
    const [targetDate, setTargetDate] = useState(getTodayDateStr());
    const [targetTime, setTargetTime] = useState('08:00');
    const [location, setLocation] = useState({
        id: 'home',
        name: 'Home',
        rate: 0.38,
        voltage: 240,
        icon: 'home',
        maxAmps: 32,
    });
    const [hasCalculated, setHasCalculated] = useState(false);
    const [results, setResults] = useState(null);

    const selectedModel = teslaModels.find(m => m.id === selectedModelId) || DEFAULT_MODEL;

    // Energy needed (live preview)
    const energyNeeded = calcEnergyNeeded(
        selectedModel.batteryCapacity,
        currentPct,
        targetPct
    );

    const handleCalculate = useCallback(() => {
        const hoursAvailable = calcHoursAvailable(targetDate, targetTime);

        if (hoursAvailable <= 0 || energyNeeded <= 0) {
            setResults(null);
            setHasCalculated(false);
            return;
        }

        // Calculate required amps
        const requiredAmps = calcRequiredAmps(
            energyNeeded,
            hoursAvailable,
            location.voltage
        );

        // Calculate safe max amps (80% rule)
        const safeMaxAmps = calcSafeAmps(location.maxAmps);

        // Get the actual amperage we'll use (clamp to safe max)
        const actualAmps = Math.min(requiredAmps, safeMaxAmps);

        // Recalculate with actual amperage
        const actualPower = calcChargingPower(location.voltage, actualAmps);
        const actualDuration = calcChargingTime(energyNeeded, actualPower);

        // Get schedule with dates
        const schedule = calcChargeSchedule(targetDate, targetTime, actualDuration);

        // Calculate what time it would finish if we start now at these amps
        const finishIfStartNow = new Date();
        finishIfStartNow.setHours(finishIfStartNow.getHours() + actualDuration);

        const totalCost = calcCost(energyNeeded, location.rate);

        setResults({
            recommendedAmps: Math.round(actualAmps * 10) / 10,
            requestedAmps: Math.round(requiredAmps * 10) / 10,
            duration: formatDuration(actualDuration),
            durationHours: actualDuration,
            startFormatted: schedule.startFormatted,
            endFormatted: schedule.endFormatted,
            endDateLong: schedule.endDateLong,
            energyNeeded: Math.round(energyNeeded * 100) / 100,
            totalCost: Math.round(totalCost * 100) / 100,
            isWithinLimit: requiredAmps <= safeMaxAmps,
            safeMaxAmps,
        });

        setHasCalculated(true);
    }, [energyNeeded, targetDate, targetTime, location]);

    // Auto-calculate on input changes
    useEffect(() => {
        if (hasCalculated) {
            handleCalculate();
        }
    }, [selectedModelId, currentPct, targetPct, targetDate, targetTime, location.rate, location.maxAmps, hasCalculated]);

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

                <div className="form-group">
                    <label className="form-label">Target Date</label>
                    <input
                        type="date"
                        className="form-control-custom"
                        value={targetDate}
                        onChange={e => setTargetDate(e.target.value)}
                        min={getTodayDateStr()}
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Ready by (Time)</label>
                    <input
                        type="time"
                        className="form-control-custom"
                        value={targetTime}
                        onChange={e => setTargetTime(e.target.value)}
                    />
                </div>

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
                            Plug in at <strong>{results.startFormatted}</strong> for{' '}
                            <strong>{results.duration}</strong>. Car will be ready by{' '}
                            <strong>{results.endFormatted}</strong>
                            {!results.isWithinLimit && (
                                <>
                                    <br />
                                    <span className="material-symbols-outlined warning-icon">warning</span>
                                    Required amps ({results.requestedAmps}A) exceeds safe limit.{' '}
                                    Using max safe amperage: <strong>{results.safeMaxAmps}A</strong>.
                                    Charging will take longer.
                                </>
                            )}
                        </span>
                    </div>
                </div>
            )}

            {/* Bottom Nav Dots */}
            {!hasCalculated && (
                <div className="bottom-nav">
                    <div className="bottom-nav-dot active"></div>
                    <div className="bottom-nav-dot"></div>
                    <div className="bottom-nav-dot"></div>
                </div>
            )}
        </div>
    );
}

export default ChargingCalculator;