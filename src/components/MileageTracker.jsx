import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    getDailySnapshots,
    getTodaySnapshot,
    triggerDailySnapshot,
    getMytTodayDateStr,
} from '../../supabase/client';

// ==========================================
// Chart helpers (lightweight SVG, no deps)
// ==========================================

function niceMax(v) {
    if (v <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const steps = [1, 2, 2.5, 5, 10];
    for (const s of steps) {
        if (s * pow >= v) return s * pow;
    }
    return 10 * pow;
}

function fmtDate(d) {
    // '2026-09-07' -> '7/9'
    const [, m, day] = d.split('-').map(Number);
    return `${day}/${m}`;
}

const CHART_H = 160;

function LineChart({ data, color = '#3b82f6', unit = '', formatY = v => Math.round(v) }) {
    const W = 360;
    const padL = 44, padR = 10, padT = 14, padB = 22;
    const iw = W - padL - padR, ih = CHART_H - padT - padB;

    if (!data || data.length < 2) {
        return <div className="chart-empty">Not enough data yet (min. 2 days).</div>;
    }

    const ys = data.map(d => d.y).filter(v => v != null && isFinite(v));
    const min = Math.min(...ys), max = Math.max(...ys);
    const lo = min === max ? min - 1 : min - (max - min) * 0.1;
    const hi = niceMax(max + (max - min) * 0.05);

    const px = i => padL + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
    const py = v => padT + ih - ((v - lo) / (hi - lo)) * ih;

    const pts = data.map((d, i) => `${px(i).toFixed(1)},${py(d.y).toFixed(1)}`).join(' ');
    const area = `${padL},${padT + ih} ${pts} ${padL + iw},${padT + ih}`;

    const gridVals = [0, 0.25, 0.5, 0.75, 1].map(f => lo + f * (hi - lo));
    const last = data[data.length - 1];
    const first = data[0];

    return (
        <svg viewBox={`0 0 ${W} ${CHART_H}`} className="mileage-chart" preserveAspectRatio="xMidYMid meet">
            <defs>
                <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            {gridVals.map((v, i) => (
                <g key={i}>
                    <line x1={padL} x2={padL + iw} y1={py(v)} y2={py(v)} className="chart-grid" />
                    <text x={padL - 6} y={py(v) + 3} className="chart-label" textAnchor="end">{formatY(v)}</text>
                </g>
            ))}
            <polygon points={area} fill={`url(#grad-${color.replace('#', '')})`} />
            <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {data.map((d, i) => (
                <circle key={i} cx={px(i)} cy={py(d.y)} r={i === data.length - 1 ? 3.5 : 2} fill={color}>
                    <title>{`${fmtDate(d.x)}: ${formatY(d.y)}${unit}`}</title>
                </circle>
            ))}
            <text x={padL} y={CHART_H - 6} className="chart-label">{fmtDate(first.x)}</text>
            <text x={padL + iw} y={CHART_H - 6} className="chart-label" textAnchor="end">{fmtDate(last.x)}</text>
        </svg>
    );
}

function BarChart({ data, color = '#22c55e', unit = ' km', formatY = v => Math.round(v) }) {
    const W = 360;
    const padL = 44, padR = 10, padT = 14, padB = 22;
    const iw = W - padL - padR, ih = CHART_H - padT - padB;

    if (!data || data.length < 1) {
        return <div className="chart-empty">Not enough data yet.</div>;
    }

    const max = niceMax(Math.max(...data.map(d => d.y || 0)));
    const step = iw / data.length;
    const bw = Math.min(step - 2, 18);

    const gridVals = [0, 0.25, 0.5, 0.75, 1].map(f => f * max);

    return (
        <svg viewBox={`0 0 ${W} ${CHART_H}`} className="mileage-chart" preserveAspectRatio="xMidYMid meet">
            {gridVals.map((v, i) => {
                const y = padT + ih - (v / max) * ih;
                return (
                    <g key={i}>
                        <line x1={padL} x2={padL + iw} y1={y} y2={y} className="chart-grid" />
                        <text x={padL - 6} y={y + 3} className="chart-label" textAnchor="end">{formatY(v)}</text>
                    </g>
                );
            })}
            {data.map((d, i) => {
                const h = ((d.y || 0) / max) * ih;
                const x = padL + i * step + (step - bw) / 2;
                return (
                    <rect key={i} x={x} y={padT + ih - h} width={Math.max(bw, 2)} height={Math.max(h, d.y > 0 ? 2 : 0)}
                        rx="2" fill={color} opacity="0.85">
                        <title>{`${fmtDate(d.x)}: ${formatY(d.y || 0)}${unit}`}</title>
                    </rect>
                );
            })}
            <text x={padL} y={CHART_H - 6} className="chart-label">{fmtDate(data[0].x)}</text>
            <text x={padL + iw} y={CHART_H - 6} className="chart-label" textAnchor="end">{fmtDate(data[data.length - 1].x)}</text>
        </svg>
    );
}

// Build cumulative odometer series for the selected window.
// daily: [{ x, y }] diffs within window; latest odometer is the last point.
function buildOdometerSeries(daily, latestOdometer) {
    if (!daily || daily.length === 0) return [];
    let before = Number(latestOdometer);
    for (let i = daily.length - 1; i >= 0; i--) before -= daily[i].y;
    const cum = [{ x: daily[0].x, y: Math.max(before, 0) }];
    let running = before;
    for (const d of daily) {
        running += d.y;
        cum.push({ x: d.x, y: running });
    }
    return cum;
}

// ==========================================
// Mileage Tracker page
// ==========================================

function MileageTracker() {
    const { user } = useAuth();
    const [snapshots, setSnapshots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [seeding, setSeeding] = useState(false);
    const [rangeDays, setRangeDays] = useState(30);
    const [notice, setNotice] = useState(null);

    const loadSnapshots = useCallback(async () => {
        const rows = await getDailySnapshots(user.id);
        setSnapshots(rows || []);
    }, [user]);

    useEffect(() => {
        if (!user) return;
        (async () => {
            setLoading(true);
            try {
                await loadSnapshots();
                // Fallback seed: if today's snapshot missing, pull it now
                const today = await getTodaySnapshot(user.id);
                if (!today) {
                    setSeeding(true);
                    try {
                        await triggerDailySnapshot(user.id);
                        await loadSnapshots();
                    } catch (e) {
                        setNotice(e.message);
                    } finally {
                        setSeeding(false);
                    }
                }
            } catch (e) {
                setNotice(e.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [user, loadSnapshots]);

    // Derived data
    const stats = useMemo(() => {
        const valid = snapshots.filter(s => s.odometer != null);
        if (valid.length === 0) return null;

        const latest = valid[valid.length - 1];
        const first = valid[0];

        // Daily km: odometer diff between consecutive snapshots
        const daily = [];
        for (let i = 1; i < valid.length; i++) {
            const diff = Number(valid[i].odometer) - Number(valid[i - 1].odometer);
            if (diff >= 0) daily.push({ x: valid[i].snapshot_date, y: diff });
        }

        // Full-charge range estimate: battery_range / battery_level * 100
        const fullRange = snapshots
            .filter(s => s.battery_level > 5 && s.battery_range > 0) // avoid inflated values at low SoC
            .map(s => ({ x: s.snapshot_date, y: (Number(s.battery_range) / Number(s.battery_level)) * 100 }));

        // Averages
        const cutoff = (days) => {
            const d = new Date();
            d.setDate(d.getDate() - days);
            return d.toISOString().slice(0, 10);
        };
        const inWin = (arr, days) => arr.filter(d => d.x > cutoff(days));
        const km7 = inWin(daily, 7);
        const km30 = inWin(daily, 30);
        const avg7 = km7.length > 0 ? km7.reduce((a, b) => a + b.y, 0) / 7 : null;
        const avg30 = km30.length > 0 ? km30.reduce((a, b) => a + b.y, 0) / 30 : null;

        // Degradation: vs earliest full-range estimate
        const baseRange = fullRange.length > 0 ? fullRange[0].y : null;
        const curRange = fullRange.length > 0 ? fullRange[fullRange.length - 1].y : null;
        const degr = baseRange && curRange ? ((baseRange - curRange) / baseRange) * 100 : null;

        // Total km & days tracked
        const totalKm = Number(latest.odometer) - Number(first.odometer);
        const daysTracked = Math.max(1, Math.round(
            (new Date(latest.snapshot_date) - new Date(first.snapshot_date)) / 86400000
        ));

        return { latest, daily, fullRange, avg7, avg30, curRange, degr, totalKm, daysTracked };
    }, [snapshots]);

    const rangeFiltered = useMemo(() => {
        if (!stats) return null;
        if (rangeDays === 0) return stats; // All
        const cutoff = (d => { d.setDate(d.getDate() - rangeDays); return d.toISOString().slice(0, 10); })(new Date());
        return {
            ...stats,
            daily: stats.daily.filter(d => d.x >= cutoff),
            fullRange: stats.fullRange.filter(d => d.x >= cutoff),
        };
    }, [stats, rangeDays]);

    const todayStr = getMytTodayDateStr();
    const hasToday = snapshots.some(s => s.snapshot_date === todayStr);

    if (loading) {
        return (
            <div className="app-container">
                <div className="app-loading">
                    <div className="loading-spinner">
                        <span className="material-symbols-outlined">bolt</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="app-container">
            {/* Notice */}
            {notice && (
                <div className="tesla-toast tesla-toast-error">
                    <span className="material-symbols-outlined">error</span>
                    {notice}
                    <button className="toast-close" onClick={() => setNotice(null)}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
            )}

            {/* Header */}
            <div className="app-header">
                <div className="app-header-icon">
                    <span className="material-symbols-outlined header-icon-symbol">speed</span>
                </div>
                <div className="header-title-row">
                    <h1>Mileage</h1>
                </div>
                <p>Range &amp; Battery Health Tracker</p>
            </div>

            {/* Snapshot status */}
            <div className="snapshot-status">
                <span className="material-symbols-outlined snapshot-status-icon">
                    {seeding ? 'radar' : hasToday ? 'check_circle' : 'schedule'}
                </span>
                {seeding
                    ? 'Pulling today\'s data...'
                    : hasToday
                        ? `Today's snapshot recorded (${todayStr})`
                        : 'Auto-pull daily — set time in Settings'}
            </div>

            {!stats && !seeding && (
                <div className="card-custom">
                    <div className="card-custom-title">
                        <span className="material-symbols-outlined card-title-icon">database</span>
                        No Data
                    </div>
                    <p className="mileage-empty-text">
                        A snapshot is pulled automatically every day (set the time in Settings).
                        Connect Tesla in Settings and data will start appearing here.
                    </p>
                </div>
            )}

            {stats && rangeFiltered && (
                <>
                    {/* Stats Cards */}
                    <div className="mileage-stats-grid">
                        <div className="stat-card">
                            <span className="material-symbols-outlined stat-icon">odometer</span>
                            <div className="stat-value">{Math.round(stats.latest.odometer).toLocaleString()}</div>
                            <div className="stat-label">Odometer (km)</div>
                        </div>
                        <div className="stat-card">
                            <span className="material-symbols-outlined stat-icon">route</span>
                            <div className="stat-value">{Math.round(stats.totalKm).toLocaleString()}</div>
                            <div className="stat-label">Total km tracked · {stats.daysTracked}d</div>
                        </div>
                        <div className="stat-card">
                            <span className="material-symbols-outlined stat-icon">avg_pace</span>
                            <div className="stat-value">{stats.avg7 != null ? stats.avg7.toFixed(1) : '—'}</div>
                            <div className="stat-label">Avg km/day (7d){stats.avg30 != null ? ` · ${stats.avg30.toFixed(1)} (30d)` : ''}</div>
                        </div>
                        <div className={`stat-card ${stats.degr > 0 ? 'stat-card-warn' : ''}`}>
                            <span className="material-symbols-outlined stat-icon">battery_saver</span>
                            <div className="stat-value">{stats.curRange != null ? Math.round(stats.curRange) : '—'}</div>
                            <div className="stat-label">
                                Max range @100% (km){stats.degr != null ? ` · ${stats.degr >= 0 ? '-' : '+'}${Math.abs(stats.degr).toFixed(1)}%` : ''}
                            </div>
                        </div>
                    </div>

                    {/* Range selector */}
                    <div className="mileage-range-toggle">
                        {[7, 30, 90, 0].map(d => (
                            <button
                                key={d}
                                className={`toggle-btn small ${rangeDays === d ? 'active' : ''}`}
                                onClick={() => setRangeDays(d)}
                            >
                                {d === 0 ? 'All' : `${d}d`}
                            </button>
                        ))}
                    </div>
                </>
            )}

            {stats && rangeFiltered && (
                <>
                    {/* Daily km bar chart */}
                    <div className="card-custom">
                        <div className="card-custom-title">
                            <span className="material-symbols-outlined card-title-icon">directions_car</span>
                            Daily Distance
                        </div>
                        <BarChart data={rangeFiltered.daily} />
                    </div>

                    {/* Odometer line chart */}
                    <div className="card-custom">
                        <div className="card-custom-title">
                            <span className="material-symbols-outlined card-title-icon">timeline</span>
                            Odometer Trend
                        </div>
                        <LineChart
                            data={buildOdometerSeries(rangeFiltered.daily, stats.latest.odometer)}
                            color="#3b82f6"
                            unit=" km"
                            formatY={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)}
                        />
                    </div>

                    {/* Battery degradation chart */}
                    <div className="card-custom">
                        <div className="card-custom-title">
                            <span className="material-symbols-outlined card-title-icon">battery_full</span>
                            Max Range (Battery Degradation)
                        </div>
                        <LineChart data={rangeFiltered.fullRange} color="#f59e0b" unit=" km" />
                        <p className="chart-footnote">
                            Max range = rated range Tesla hantar &divide; battery level &times; 100 —
                            jarak penuh (100%) kereta anda. Kalau nilai ini menurun dari masa ke masa, itu degradasi bateri.
                        </p>
                    </div>
                </>
            )}


        </div>
    );
}

export default MileageTracker;


