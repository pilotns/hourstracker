import assert from 'node:assert/strict';
import test from 'node:test';
import { MINUTE_PRESETS, createMinuteSelection, toggleMinuteSelection, getAvailability } from '../src/hours.js';

test('every exact preset combination is restored when a day is reopened', () => {
  assert.deepEqual(MINUTE_PRESETS, [90, 120, 240, 480]);
  for (let mask = 0; mask < 16; mask++) {
    const selected = MINUTE_PRESETS.filter((_, index) => mask & (1 << index));
    const minutes = selected.reduce((sum, preset) => sum + preset, 0);
    assert.deepEqual(createMinuteSelection(minutes), { minutes, selected });
  }
});

test('presets add together and each toggle is reversible without mutating inputs', () => {
  const original = Object.freeze({ minutes: 0, selected: Object.freeze([]) });
  let current = original;
  for (const preset of [480, 90, 240, 120]) current = toggleMinuteSelection(current, preset);
  assert.deepEqual(current, { minutes: 930, selected: [90, 120, 240, 480] });
  assert.deepEqual(original, { minutes: 0, selected: [] });
  for (const preset of MINUTE_PRESETS) {
    const without = toggleMinuteSelection(current, preset);
    assert.equal(without.minutes, 930 - preset);
    assert.deepEqual(toggleMinuteSelection(without, preset), current);
  }
  for (const preset of [120, 240, 90, 480]) current = toggleMinuteSelection(current, preset);
  assert.deepEqual(current, { minutes: 0, selected: [] });
});

test('custom totals preserve their manual base when adding and removing presets', () => {
  const custom = createMinuteSelection(37);
  assert.deepEqual(custom, { minutes: 37, selected: [] });
  const first = toggleMinuteSelection(custom, 90);
  const both = toggleMinuteSelection(first, 120);
  assert.deepEqual(both, { minutes: 247, selected: [90, 120] });
  const onlySecond = toggleMinuteSelection(both, 90);
  assert.deepEqual(onlySecond, { minutes: 157, selected: [120] });
  assert.deepEqual(toggleMinuteSelection(onlySecond, 120), custom);
  assert.deepEqual(custom, { minutes: 37, selected: [] });
});

test('manual edits clear prior selections and reopening uses only the saved total', () => {
  const manual = { minutes: 210, selected: [] };
  assert.deepEqual(toggleMinuteSelection(manual, 90), { minutes: 300, selected: [90] });
  assert.deepEqual(createMinuteSelection(manual.minutes), { minutes: 210, selected: [90, 120] });
  assert.deepEqual(createMinuteSelection(247), { minutes: 247, selected: [] });
  assert.deepEqual(createMinuteSelection(1440), { minutes: 1440, selected: [] });
});

test('one-day bounds prevent overflow and failed toggles leave state intact', () => {
  const selection = Object.freeze({ minutes: 1350, selected: Object.freeze([]) });
  assert.deepEqual(toggleMinuteSelection(selection, 90), { minutes: 1440, selected: [90] });
  assert.throws(() => toggleMinuteSelection(selection, 120), RangeError);
  assert.deepEqual(selection, { minutes: 1350, selected: [] });
  for (const invalid of [-1, 0.5, 1441, NaN, Infinity, '90', null, undefined]) {
    assert.throws(() => createMinuteSelection(invalid), RangeError);
    assert.throws(() => toggleMinuteSelection({ minutes: invalid, selected: [] }, 90), RangeError);
  }
});

test('malformed selected presets cannot create negative bases or duplicate additions', () => {
  for (const selection of [null, {}, { minutes: 0 }, { minutes: 90, selected: [90, 90] }, { minutes: 90, selected: [30] }, { minutes: 90, selected: ['90'] }, { minutes: 89, selected: [90] }, { minutes: 90, selected: new Set([90]) }]) {
    assert.throws(() => toggleMinuteSelection(selection, 90), RangeError);
  }
  for (const preset of [0, 30, 91, -90, '90', NaN, null, undefined]) {
    assert.throws(() => toggleMinuteSelection({ minutes: 0, selected: [] }, preset), RangeError);
  }
});

test('availability counts all used minutes and separately reports an exceeded limit', () => {
  assert.deepEqual(getAvailability(0, 2400), { availableMinutes: 2400, overLimitMinutes: 0, usedMinutes: 0, limitMinutes: 2400 });
  assert.deepEqual(getAvailability(1811, 2400), { availableMinutes: 589, overLimitMinutes: 0, usedMinutes: 1811, limitMinutes: 2400 });
  assert.deepEqual(getAvailability(2400, 2400), { availableMinutes: 0, overLimitMinutes: 0, usedMinutes: 2400, limitMinutes: 2400 });
  assert.deepEqual(getAvailability(2521, 2400), { availableMinutes: 0, overLimitMinutes: 121, usedMinutes: 2521, limitMinutes: 2400 });
  assert.deepEqual(getAvailability(2521, 3000), { availableMinutes: 479, overLimitMinutes: 0, usedMinutes: 2521, limitMinutes: 3000 });
  assert.deepEqual(getAvailability(1, 0), { availableMinutes: 0, overLimitMinutes: 1, usedMinutes: 1, limitMinutes: 0 });
});

test('availability rejects invalid totals and limits without rounding', () => {
  for (const invalid of [-1, 0.5, NaN, Infinity, '2400', null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => getAvailability(invalid, 2400), RangeError);
    assert.throws(() => getAvailability(0, invalid), RangeError);
  }
});
