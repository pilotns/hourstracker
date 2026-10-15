export const MINUTE_PRESETS = Object.freeze([90, 120, 240, 480]);

function requireMinutes(value, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`Minutes must be a whole number between 0 and ${maximum}`);
  }
  return value;
}

/** Each press adds a block to the current total, including repeated presses. */
export function addMinutePreset(totalMinutes, preset) {
  requireMinutes(totalMinutes, 1440);
  if (!MINUTE_PRESETS.includes(preset)) throw new RangeError('Unknown minute preset');
  return requireMinutes(totalMinutes + preset, 1440);
}

/** Compare all counted minutes in the selected period with a user-set limit. */
export function getAvailability(totalMinutes, limitMinutes) {
  requireMinutes(totalMinutes);
  requireMinutes(limitMinutes);
  return {
    availableMinutes: Math.max(0, limitMinutes - totalMinutes),
    overLimitMinutes: Math.max(0, totalMinutes - limitMinutes),
    usedMinutes: totalMinutes,
    limitMinutes,
  };
}
