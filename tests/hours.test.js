import assert from 'node:assert/strict';
import test from 'node:test';
import { MINUTE_PRESETS, addMinutePreset, getAvailability } from '../src/hours.js';

test('repeated presses keep adding the same block', () => {
  assert.deepEqual(MINUTE_PRESETS, [90, 120, 240, 480]);
  for (const preset of MINUTE_PRESETS) {
    let total = 0;
    for (let count = 1; count <= 3; count++) {
      total = addMinutePreset(total, preset);
      assert.equal(total, Math.min(480, preset * count));
    }
  }
});

test('mixed blocks add to existing saved or manually entered totals', () => {
  let total = 37;
  for (const preset of [90, 120, 90, 240, 480]) total = addMinutePreset(total, preset);
  assert.equal(total, 480);
  assert.equal(addMinutePreset(210, 90), 300);
});

test('one-day total stops at 480 without errors or wraparound', () => {
  assert.equal(addMinutePreset(450, 90), 480);
  assert.equal(addMinutePreset(480, 120), 480);
  assert.equal(addMinutePreset(1440, 90), 480);
  for (const invalid of [-1, 0.5, NaN, Infinity, '90', null, undefined]) {
    assert.throws(() => addMinutePreset(invalid, 90), RangeError);
  }
  for (const preset of [0, 30, 91, -90, '90', NaN, null, undefined]) {
    assert.throws(() => addMinutePreset(0, preset), RangeError);
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
