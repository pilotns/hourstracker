import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { localDateKey, parseDate, shiftDate, rollingDates, sumMinutes, formatDuration, formatRange, setDateLocale } from '../src/dates.js';

test('date keys parse at local noon and round-trip including years below 100', () => {
  for (const key of ['2026-10-11', '2024-02-29', '0099-01-02', '0001-01-01']) {
    const date = parseDate(key);
    assert.equal(localDateKey(date), key);
    assert.equal(date.getHours(), 12);
    assert.equal(date.getMinutes(), 0);
  }
  assert.equal(localDateKey(), localDateKey(new Date()));
});

test('impossible or ambiguous calendar dates fail rather than silently rolling over', () => {
  for (const invalid of ['2025-02-29', '2024-02-30', '2026-04-31', '2026-00-10', '2026-13-01', '2026-01-00', '2026-1-01', '2026-01-1', '0000-01-01', '2026-01-01T00:00:00Z', '', null, 20261011]) {
    assert.throws(() => parseDate(invalid), RangeError, String(invalid));
  }
  assert.throws(() => localDateKey(new Date(NaN)), RangeError);
  assert.throws(() => localDateKey('2026-10-11'), RangeError);
});

test('calendar shifts cross month, leap-day, and year boundaries', () => {
  assert.equal(shiftDate('2026-10-01', -1), '2026-09-30');
  assert.equal(shiftDate('2024-03-01', -1), '2024-02-29');
  assert.equal(shiftDate('2025-03-01', -1), '2025-02-28');
  assert.equal(shiftDate('2025-12-31', 1), '2026-01-01');
  assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDate('2026-10-11', 0), '2026-10-11');
  for (const invalid of [0.5, NaN, Infinity, '1', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => shiftDate('2026-10-11', invalid), RangeError);
  }
  assert.throws(() => shiftDate('0001-01-01', -1), RangeError);
});

test('rolling window has exactly seven chronological dates including both endpoints', () => {
  assert.deepEqual(rollingDates('2026-10-11'), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  assert.deepEqual(rollingDates('2026-01-03'), ['2025-12-28', '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03']);
  assert.deepEqual(rollingDates('2024-03-03'), ['2024-02-26', '2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01', '2024-03-02', '2024-03-03']);
});

test('only the current seven dates count, with exact integer minute totals', () => {
  const entries = {
    '2026-10-04': { minutes: 600 }, // Immediately before the window.
    '2026-10-05': { minutes: 181 },
    '2026-10-06': { minutes: 0 },
    '2026-10-07': { minutes: 182 },
    '2026-10-09': { minutes: 183 },
    '2026-10-11': { minutes: 184 },
    '2026-10-12': { minutes: 600 }, // Immediately after the window.
  };
  assert.equal(sumMinutes(entries, rollingDates('2026-10-11')), 730);
  assert.equal(sumMinutes(entries, rollingDates('2026-10-12')), 1149);
  assert.equal(sumMinutes({}, rollingDates('2026-10-11')), 0);
  assert.equal(sumMinutes(entries, []), 0);
  assert.equal(formatDuration(730), '12h 10m');
});

test('invalid minutes and overflow cannot corrupt totals or duration labels', () => {
  for (const invalid of [-1, 1.5, NaN, Infinity, '60', undefined, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => sumMinutes({ today: { minutes: invalid } }, ['today']), RangeError);
    assert.throws(() => formatDuration(invalid), RangeError);
  }
  assert.throws(() => sumMinutes({ a: { minutes: Number.MAX_SAFE_INTEGER }, b: { minutes: 1 } }, ['a', 'b']), RangeError);
});

test('English is the default for duration and range labels', () => {
  assert.equal(formatDuration(0), '0h');
  assert.equal(formatDuration(30), '30m');
  assert.equal(formatDuration(60), '1h');
  assert.equal(formatDuration(450), '7h 30m');
  assert.equal(formatRange('2026-10-05', '2026-10-11'), 'Oct 5–11');
  assert.equal(formatRange('2026-09-28', '2026-10-04'), 'Sep 28 — Oct 4');
  assert.equal(formatRange('2025-12-28', '2026-01-03'), 'Dec 28, 2025 — Jan 3, 2026');
  assert.equal(formatRange('2026-10-11', '2026-10-11'), 'Oct 11');
  assert.throws(() => formatRange('2026-10-11', '2026-10-05'), RangeError);
});

test('Ukrainian labels switch immediately and English can be restored', () => {
  setDateLocale('uk');
  try {
    assert.equal(formatDuration(0), '0 год');
    assert.equal(formatDuration(30), '30 хв');
    assert.equal(formatDuration(60), '1 год');
    assert.equal(formatDuration(210), '3 год 30 хв');
    assert.equal(formatRange('2026-10-05', '2026-10-11'), '5–11 жовт.');
    assert.equal(formatRange('2026-09-28', '2026-10-04'), '28 вер. — 4 жовт.');
    assert.equal(formatRange('2025-12-28', '2026-01-03'), '28 груд. 2025 — 3 січ. 2026');
    assert.equal(formatRange('2026-10-11', '2026-10-11'), '11 жовт.');
    assert.throws(() => setDateLocale('ru'), RangeError);
    assert.equal(formatDuration(210), '3 год 30 хв');
    assert.equal(shiftDate('2024-03-01', -1), '2024-02-29');
    assert.equal(sumMinutes({ '2026-10-11': { minutes: 210, status: 'reserved' } }, rollingDates('2026-10-11')), 210);
  } finally {
    setDateLocale();
  }
  assert.equal(formatDuration(210), '3h 30m');
  assert.equal(formatRange('2026-10-05', '2026-10-11'), 'Oct 5–11');
});

test('local date keys and rolling windows remain correct across UTC offsets and DST', () => {
  const moduleUrl = new URL('../src/dates.js', import.meta.url).href;
  const code = `
    import { localDateKey, parseDate, rollingDates, shiftDate } from ${JSON.stringify(moduleUrl)};
    const keys = ['2026-03-08', '2026-03-09', '2026-11-01', '2026-11-02'];
    console.log(JSON.stringify({
      local: localDateKey(new Date(2026, 9, 11, 0, 15)),
      late: localDateKey(new Date(2026, 9, 11, 23, 45)),
      windows: keys.map(key => rollingDates(key)),
      roundTrip: keys.map(key => localDateKey(parseDate(key))),
      shifts: [shiftDate('2026-03-07', 2), shiftDate('2026-10-31', 2)],
      noon: keys.map(key => parseDate(key).getHours()),
    }));
  `;
  for (const timezone of ['America/Los_Angeles', 'America/New_York', 'Pacific/Auckland', 'Asia/Tokyo', 'UTC']) {
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      encoding: 'utf8', env: { ...process.env, TZ: timezone },
    }));
    assert.equal(result.local, '2026-10-11', timezone);
    assert.equal(result.late, '2026-10-11', timezone);
    assert.deepEqual(result.roundTrip, ['2026-03-08', '2026-03-09', '2026-11-01', '2026-11-02'], timezone);
    assert.deepEqual(result.shifts, ['2026-03-09', '2026-11-02'], timezone);
    assert.deepEqual(result.noon, [12, 12, 12, 12], timezone);
    for (const dates of result.windows) {
      assert.equal(new Set(dates).size, 7, timezone);
      for (let index = 1; index < dates.length; index++) {
        assert.equal(shiftDate(dates[index - 1], 1), dates[index], timezone);
      }
    }
  }
});
