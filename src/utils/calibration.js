import { CHARGING_EFFICIENCY } from './calculations.js';

/**
 * Charging calibration utility
 *
 * Efficiency (0-1) = berapa % tenaga dari dinding yang sampai ke bateri.
 * Disimpan di localStorage supaya tak perlu migration DB. Default 0.90
 * (dicap dari data sebenar Tesla app, Sep 2026).
 */

const LS_KEY = 'tesla_charging_efficiency';
const MIN = 0.7;
const MAX = 1.0;

export function getChargingEfficiency() {
    try {
        const raw = parseFloat(localStorage.getItem(LS_KEY));
        if (!isNaN(raw) && raw >= MIN && raw <= MAX) return raw;
    } catch (e) {
        console.warn('Failed to read calibration:', e.message);
    }
    return CHARGING_EFFICIENCY;
}

export function setChargingEfficiency(value) {
    const v = Math.min(MAX, Math.max(MIN, parseFloat(value)));
    if (isNaN(v)) return getChargingEfficiency();
    localStorage.setItem(LS_KEY, String(v));
    // Beritahu komponen lain (calculator) bahawa calibration berubah
    window.dispatchEvent(new CustomEvent('tesla-calibration-changed', { detail: { efficiency: v } }));
    return v;
}

export function resetChargingEfficiency() {
    localStorage.removeItem(LS_KEY);
    window.dispatchEvent(new CustomEvent('tesla-calibration-changed', { detail: { efficiency: CHARGING_EFFICIENCY } }));
    return CHARGING_EFFICIENCY;
}

/**
 * Auto-calibrate efficiency dari data yang dikey-in pengguna.
 *
 * Logik: efficiency = energi bateri yang diperlukan / (kuasa dinding × masa).
 * Contoh: 60 kWh, 31% -> 100% (41.4 kWh), 17A @ 240V (4.08 kW), Tesla app
 * cakap 11j 20m (11.333j) => 41.4 / (4.08 × 11.333) = 0.896 ≈ 0.9
 *
 * @param {object} options
 * @param {number} options.batteryCapacity - kapasiti bateri (kWh)
 * @param {number} [options.currentPct] - paras bateri semasa (%)
 * @param {number} [options.targetPct] - target (%)
 * @param {number} [options.currentKm] - range semasa (km, dari Tesla app)
 * @param {number} [options.targetKm] - target range (km)
 * @param {number} [options.theoreticalRange] - rated range penuh model (km), wajib untuk mode km
 * @param {number} options.amps - amperage yang ditetapkan di app (A)
 * @param {number} options.voltage - voltage (V), default 240
 * @param {number} options.durationHours - masa anggaran Tesla app (jam, boleh perpuluhan)
 * @returns {number} efficiency dicap (clamp 0.7-1.0), atau NaN kalau data tak sah
 */
export function calibrateEfficiencyFromData({
    batteryCapacity, currentPct, targetPct, currentKm, targetKm, theoreticalRange, amps, voltage = 240, durationHours,
}) {
    const cap = parseFloat(batteryCapacity);
    const a = parseFloat(amps);
    const v = parseFloat(voltage);
    const t = parseFloat(durationHours);

    if (!cap || !a || !v || !t || t <= 0 || a <= 0) return NaN;

    let energyNeeded;
    const useKm = (currentKm !== undefined && currentKm !== '') || (targetKm !== undefined && targetKm !== '');
    if (useKm) {
        // Mode km: kira kWh per km daripada data sebenar yang dipaparkan Tesla,
        // supaya konsisten dengan kiraan peratus:
        //   kWh per km = (kapasiti × % semasa) ÷ km semasa
        // Ini penting sebab display range Tesla (cth penuh ~448 km) bukan rated
        // penuh model (cth 490 km) — kalau guna rated, hasil tak selari dengan %.
        const cur = parseFloat(currentKm);
        const tgt = parseFloat(targetKm);
        const pct = parseFloat(currentPct);
        const full = parseFloat(theoreticalRange);
        if (isNaN(cur) || isNaN(tgt) || tgt <= cur || cur <= 0) return NaN;
        const kwhPerKm = (!isNaN(pct) && pct > 0)
            ? (cap * (pct / 100)) / cur
            : cap / full; // fallback ke rated kalau % tak diberi
        energyNeeded = (tgt - cur) * kwhPerKm;
    } else {
        // Mode peratus
        const cur = parseFloat(currentPct);
        const tgt = parseFloat(targetPct);
        if (isNaN(cur) || isNaN(tgt) || tgt <= cur) return NaN;
        energyNeeded = cap * ((tgt - cur) / 100);
    }

    const wallPowerKw = (v * a) / 1000;
    const efficiency = energyNeeded / (wallPowerKw * t);

    return Math.min(MAX, Math.max(MIN, Math.round(efficiency * 1000) / 1000));
}
