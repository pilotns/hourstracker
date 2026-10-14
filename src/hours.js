export const MINUTE_PRESETS = Object.freeze([90, 120, 240, 480]);

function requireMinutes(value, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`Minutes must be a whole number between 0 and ${maximum}`);
  }
  return value;
}

/** Reopen a saved day with an exact matching set of presets, if one exists. */
export function createMinuteSelection(totalMinutes) {
  requireMinutes(totalMinutes, 1440);
  for (let mask = 0; mask < 2 ** MINUTE_PRESETS.length; mask++) {
    const selected = MINUTE_PRESETS.filter((_, index) => mask & (1 << index));
    if (selected.reduce((sum, preset) => sum + preset, 0) === totalMinutes) {
      return { minutes: totalMinutes, selected };
    }
  }
  return { minutes: totalMinutes, selected: [] };
}

/** Toggle an additive preset while preserving any manually entered base. */
export function toggleMinuteSelection(selection, preset) {
  if (!selection || !Array.isArray(selection.selected)) throw new RangeError('Invalid minute selection');
  requireMinutes(selection.minutes, 1440);
  if (!MINUTE_PRESETS.includes(preset)) throw new RangeError('Unknown minute preset');
  const selected = new Set(selection.selected);
  if (selected.size !== selection.selected.length || selection.selected.some(value => !MINUTE_PRESETS.includes(value))) {
    throw new RangeError('Invalid selected presets');
  }
  const selectedTotal = selection.selected.reduce((sum, value) => sum + value, 0);
  requireMinutes(selection.minutes - selectedTotal, 1440);
  const minutes = requireMinutes(selection.minutes + (selected.has(preset) ? -preset : preset), 1440);
  if (selected.has(preset)) selected.delete(preset);
  else selected.add(preset);
  return { minutes, selected: MINUTE_PRESETS.filter(value => selected.has(value)) };
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
