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
 * Calculate energy needed to charge
 * @param {number} batteryCapacity - Total battery capacity in kWh
 * @param {number} currentPct - Current battery level (0-100)
 * @param {number} targetPct - Target battery level (0-100)
 * @returns {number} Energy needed in kWh
 */
export function calcEnergyNeeded(batteryCapacity, currentPct, targetPct) {
    if (targetPct <= currentPct) return 0;
    return batteryCapacity * (targetPct - currentPct) / 100;
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
 * Calculate start time given target time and duration
 * @param {string} targetTime - Time string in "HH:MM" format
 * @param {number} durationHours - Charging duration in hours
 * @returns {string} Start time in "HH:MM AM/PM" format
 */
export function calcStartTime(targetTime, durationHours) {
    const [hours, minutes] = targetTime.split(':').map(Number);
    const targetDate = new Date();
    targetDate.setHours(hours, minutes, 0, 0);

    const startMs = targetDate.getTime() - (durationHours * 60 * 60 * 1000);
    const startDate = new Date(startMs);

    const h = startDate.getHours();
    const m = startDate.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;

    return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
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