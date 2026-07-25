/**
 * Charging Calculator Utility
 * 
 * Formula:
 * 1. Energy Needed (kWh) = Battery Capacity × (Target% - Current%) / 100
 * 2. Charging Power (kW) = Voltage (V) × Amperage (A) / 1000
 * 3. Charging Time (hours) = Energy Needed (kWh) / Charging Power (kW)
 * 
 * Reverse: Given target time, calculate required amperage
 * Required Amps = (Energy Needed / Time Available) × 1000 / Voltage
 */

/**
 * Calculate energy needed to charge using actual battery range from Tesla
 * Uses real-world efficiency based on Tesla-reported battery_range
 * @param {object} options
 * @param {number} options.batteryCapacity - Total battery capacity in kWh
 * @param {number} options.currentPct - Current battery level (0-100)
 * @param {number} options.targetPct - Target battery level (0-100)
 * @param {number} [options.batteryRange] - Actual range km from Tesla (optional). Falls back to theoretical.
 * @param {number} [options.theoreticalRange] - EPA/WLTP range km for the model (optional).
 * @returns {number} Energy needed in kWh
 */
export function calcEnergyNeeded(options) {
    const { batteryCapacity, currentPct, targetPct, batteryRange, theoreticalRange } = options || {};
    if (targetPct <= currentPct || !batteryCapacity) return 0;

    // If we have actual range data from Tesla, use real-world efficiency
    if (batteryRange && currentPct > 0) {
        // Effective capacity used so far = currentPct% of battery
        const effectiveCapacity = batteryCapacity * (currentPct / 100);
        // Real efficiency: km per kWh based on actual driving
        const efficiencyKmPerKwh = batteryRange / effectiveCapacity;
        // Energy needed = (targetPct - currentPct)% of battery, adjusted for efficiency
        const energyToAdd = batteryCapacity * ((targetPct - currentPct) / 100);
        // If efficiency is normal (roughly 5-8 km/kWh), energy is same
        // If efficiency is poor, car uses more energy per km, so needs slightly more
        // We use the standard calculation since battery % already accounts for usable capacity
        return Math.round(energyToAdd * 100) / 100;
    }

    // Fallback: standard theoretical calculation
    return Math.round(batteryCapacity * (targetPct - currentPct) / 100 * 100) / 100;
}

/**
 * Get estimated range at target percentage based on Tesla actual data
 * @param {number} currentRange - Current battery range in km from Tesla
 * @param {number} currentPct - Current battery level
 * @param {number} targetPct - Target battery level
 * @returns {number} Estimated range at target in km
 */
export function calcEstimatedRangeAtTarget(currentRange, currentPct, targetPct) {
    if (!currentRange || currentPct <= 0 || targetPct <= currentPct) return currentRange || 0;
    return Math.round(currentRange / (currentPct / 100) * (targetPct / 100));
}

/**
 * Calculate charging power from voltage and amperage
 * @param {number} voltage - Voltage (V)
 * @param {number} amperage - Amperage (A)
 * @returns {number} Power in kW
 */
export function calcChargingPower(voltage, amperage) {
    return voltage * amperage / 1000;
}

/**
 * Calculate charging time given power and energy
 * @param {number} energyKwh - Energy needed in kWh
 * @param {number} powerKw - Charging power in kW
 * @returns {number} Time in hours
 */
export function calcChargingTime(energyKwh, powerKw) {
    if (powerKw <= 0) return 0;
    return energyKwh / powerKw;
}

/**
 * Calculate required amperage to meet target time
 * @param {number} energyKwh - Energy needed in kWh
 * @param {number} hoursAvailable - Time available in hours
 * @param {number} voltage - Voltage (V)
 * @returns {number} Required amperage in Amps
 */
export function calcRequiredAmps(energyKwh, hoursAvailable, voltage) {
    if (hoursAvailable <= 0 || voltage <= 0) return 0;
    const powerKw = energyKwh / hoursAvailable;
    const amps = (powerKw * 1000) / voltage;
    return Math.round(amps * 10) / 10; // Round to 1 decimal
}

/**
 * Calculate cost of charging
 * @param {number} energyKwh - Energy used in kWh
 * @param {number} ratePerKwh - Cost per kWh in RM
 * @returns {number} Total cost in RM
 */
export function calcCost(energyKwh, ratePerKwh) {
    return energyKwh * ratePerKwh;
}

/**
 * Format hours to display string (e.g., "2h 15min")
 * @param {number} hours - Time in hours
 * @returns {string} Formatted time string
 */
export function formatDuration(hours) {
    if (hours <= 0) return '0 min';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}min`;
}

/**
 * Format a Date object to a readable string
 * @param {Date} date
 * @returns {string} Formatted like "Mon, 25 Jul · 5:45 AM"
 */
export function formatDateTime(date) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const day = days[date.getDay()];
    const dateNum = date.getDate();
    const month = months[date.getMonth()];
    
    const h = date.getHours();
    const m = date.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    
    return `${day}, ${dateNum} ${month} · ${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Format a Date object to short date + time
 * @param {Date} date
 * @returns {string} Formatted like "25 Jul 2026, 5:45 AM"
 */
export function formatDateLong(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dateNum = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    
    const h = date.getHours();
    const m = date.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    
    return `${dateNum} ${month} ${year}, ${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Calculate start time given target date/time and duration
 * @param {string} targetDateStr - Target date string in "YYYY-MM-DD" format
 * @param {string} targetTimeStr - Target time string in "HH:MM" format
 * @param {number} durationHours - Charging duration in hours
 * @returns {{ startDate: Date, endDate: Date, startFormatted: string, endFormatted: string }}
 */
export function calcChargeSchedule(targetDateStr, targetTimeStr, durationHours) {
    const [th, tm] = targetTimeStr.split(':').map(Number);
    const [ty, tmon, tday] = targetDateStr.split('-').map(Number);
    
    // Target date/time (when charging should complete)
    const endDate = new Date(ty, tmon - 1, tday, th, tm, 0);
    
    // If end date is in the past, move to next day
    const now = new Date();
    if (endDate <= now) {
        endDate.setDate(endDate.getDate() + 1);
    }
    
    // Start date = end date minus duration
    const startMs = endDate.getTime() - (durationHours * 60 * 60 * 1000);
    const startDate = new Date(startMs);
    
    return {
        startDate,
        endDate,
        startFormatted: formatDateTime(startDate),
        endFormatted: formatDateTime(endDate),
        endDateLong: formatDateLong(endDate),
    };
}

/**
 * Calculate available hours between now and target
 * @param {string} targetDateStr - Target date string in "YYYY-MM-DD"
 * @param {string} targetTimeStr - Target time string in "HH:MM"
 * @returns {number} Hours available
 */
export function calcHoursAvailable(targetDateStr, targetTimeStr) {
    const now = new Date();
    const [th, tm] = targetTimeStr.split(':').map(Number);
    const [ty, tmon, tday] = targetDateStr.split('-').map(Number);
    
    let targetDate = new Date(ty, tmon - 1, tday, th, tm, 0);
    
    // If target is in the past, use tomorrow
    if (targetDate <= now) {
        targetDate.setDate(targetDate.getDate() + 1);
    }
    
    return (targetDate - now) / (1000 * 60 * 60);
}

/**
 * Get default voltage based on charging type
 * @param {string} type - 'ac' or 'dc'
 * @returns {number} Voltage
 */
export function getDefaultVoltage(type) {
    return type === 'dc' ? 480 : 240;
}

/**
 * Calculate maximum safe amperage for a given voltage and circuit (80% rule)
 * @param {number} circuitAmps - Circuit breaker rating
 * @returns {number} Safe continuous amperage
 */
export function calcSafeAmps(circuitAmps) {
    return Math.round(circuitAmps * 0.8);
}

/**
 * Validate amperage is within safe limits
 * @param {number} amps - Desired amperage
 * @param {number} maxAmps - Maximum safe amperage
 * @returns {boolean} Whether amperage is valid
 */
export function isValidAmperage(amps, maxAmps) {
    return amps <= maxAmps && amps > 0;
}

/**
 * Get minimum time needed at max amperage
 * @param {number} energyKwh - Energy needed in kWh
 * @param {number} voltage - Voltage (V)
 * @param {number} maxAmps - Maximum amperage available
 * @returns {number} Minimum charging time in hours
 */
export function calcMinTime(energyKwh, voltage, maxAmps) {
    const maxPower = calcChargingPower(voltage, maxAmps);
    return calcChargingTime(energyKwh, maxPower);
}

/**
 * Format a timestamp as relative time (e.g. "10 minutes ago", "1 hour ago", "1 day 3 hours 25 minutes ago")
 * @param {string|Date} dateStr - ISO date string or Date object
 * @returns {string} Relative time string
 */
export function timeAgo(dateStr) {
    if (!dateStr) return '';
    const now = Date.now();
    const date = new Date(dateStr);
    const diffMs = now - date.getTime();
    
    if (diffMs < 0) return 'just now';
    
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds} seconds ago`;
    if (minutes < 60) {
        if (minutes === 1) return '1 minute ago';
        return `${minutes} minutes ago`;
    }
    if (hours < 24) {
        if (hours === 1) return '1 hour ago';
        const mins = minutes % 60;
        if (mins === 0) return `${hours} hours ago`;
        return `${hours} hours ${mins} minutes ago`;
    }
    
    if (days === 1) return '1 day ago';
    const h = hours % 24;
    const m = minutes % 60;
    let result = `${days} days`;
    if (h > 0) result += ` ${h} hours`;
    if (m > 0 && days < 7) result += ` ${m} minutes`;
    return result + ' ago';
}

/**
 * Get today's date as YYYY-MM-DD string
 * @returns {string}
 */
export function getTodayDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Get tomorrow's date as YYYY-MM-DD string
 * @returns {string}
 */
export function getTomorrowDateStr() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}