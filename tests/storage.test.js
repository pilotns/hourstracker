import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, GUEST_STORAGE_KEY, setStorageLocale } from '../src/storage.js';

const USER = '0a134236-1824-4829-8359-48b3566beaa1';
const OTHER_USER = '0a134236-1824-4829-8359-48b3566beaa2';
const entry = (minutes = 210, note = '', status = 'completed') => ({ minutes, note, status });

function memoryStorage(initial) {
  const values = new Map(initial === undefined ? [] : [[GUEST_STORAGE_KEY, initial]]);
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

function fakeCloud(initialRows = [], options = {}) {
  let rows = initialRows.map((row) => ({ ...row }));
  const calls = [];
  let session = { user: { id: USER } };
  let authListener;
  let unsubscribed = false;
  const auth = {
    getSession: async () => ({ data: { session }, error: null }),
    signUp: async (args) => { calls.push(['signUp', args]); return { data: { session: null, user: { id: USER } }, error: null }; },
    signInWithPassword: async (args) => { calls.push(['signIn', args]); return { data: { session }, error: options.authError ?? null }; },
    resetPasswordForEmail: async (...args) => { calls.push(['reset', ...args]); return { data: {}, error: null }; },
    updateUser: async (args) => { calls.push(['update', args]); return { data: { user: session.user }, error: null }; },
    signOut: async (args) => { calls.push(['signOut', args]); session = null; return { error: null }; },
    onAuthStateChange: (callback) => {
      authListener = callback;
      return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } };
    },
  };
  const client = {
    auth,
    from(table) {
      assert.equal(table, 'work_entries');
      const query = { mode: 'select', filters: [], cursor: null, cap: 1000, values: null, options: null, single: false };
      const builder = {
        select() { return builder; },
        eq(column, value) { query.filters.push([column, value]); return builder; },
        gt(column, value) { assert.equal(column, 'date'); query.cursor = value; return builder; },
        order(column, value) { assert.equal(column, 'date'); assert.equal(value.ascending, true); return builder; },
        limit(value) { query.cap = value; return builder; },
        upsert(values, upsertOptions) { query.mode = 'upsert'; query.values = values; query.options = upsertOptions; return builder; },
        delete() { query.mode = 'delete'; return builder; },
        single() { query.single = true; return builder; },
        then(resolve, reject) {
          calls.push(['query', structuredClone(query)]);
          return Promise.resolve().then(() => {
            if (options.queryError) return { data: null, error: options.queryError };
            if (options.queryThrows) throw options.queryThrows;
            if (query.mode === 'select') {
              const matching = rows.filter((row) => query.filters.every(([key, value]) => row[key] === value) && (!query.cursor || row.date > query.cursor));
              return { data: matching.sort((a, b) => a.date.localeCompare(b.date)).slice(0, Math.min(options.rowCap ?? 1000, query.cap)), error: null };
            }
            if (query.mode === 'delete') {
              rows = rows.filter((row) => !query.filters.every(([key, value]) => row[key] === value));
              return { data: null, error: null };
            }
            const values = Array.isArray(query.values) ? query.values : [query.values];
            const inserted = [];
            for (const next of values) {
              const index = rows.findIndex((row) => row.user_id === next.user_id && row.date === next.date);
              if (index >= 0 && query.options.ignoreDuplicates) continue;
              if (index >= 0) rows[index] = { ...next };
              else rows.push({ ...next });
              inserted.push({ date: next.date });
            }
            return { data: query.single ? inserted[0] : inserted, count: inserted.length, error: null };
          }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return { client, calls, getRows: () => rows, setSession: (next) => { session = next; }, emitAuth: (event, next) => authListener(event, next), wasUnsubscribed: () => unsubscribed };
}

function fixture(options = {}) {
  const storage = options.storage ?? memoryStorage();
  return { storage, api: createStorage({ storage, ...options }) };
}

test('guest history persists integer minutes, notes and explicitly recorded zero', async () => {
  const { api, storage } = fixture();
  await api.saveEntry(null, '2026-10-11', entry(210, 'Two blocks'));
  await api.saveEntry(null, '2026-10-12', entry(0));
  const reopened = createStorage({ storage });
  assert.deepEqual(await reopened.loadEntries(), { '2026-10-11': entry(210, 'Two blocks'), '2026-10-12': entry(0) });
  await reopened.saveEntry(null, '2026-10-11', entry(240));
  await reopened.deleteEntry(null, '2026-10-12');
  assert.deepEqual(reopened.loadGuestEntries(), { '2026-10-11': entry(240) });
  assert.equal(JSON.parse(storage.getItem(GUEST_STORAGE_KEY)).version, 1);
});

test('invalid dates, fractional/overflow minutes and oversized notes never mutate history', async () => {
  const { api, storage } = fixture();
  for (const date of ['2026-02-29', '2026-13-01', '2026-04-31', '0000-01-01', '26-10-11', '__proto__']) {
    await assert.rejects(api.saveEntry(null, date, entry()), /date/);
  }
  for (const minutes of [-1, 1441, 1.5, NaN, Infinity, '60']) {
    await assert.rejects(api.saveEntry(null, '2026-10-11', entry(minutes)), /Time/);
  }
  for (const note of ['x'.repeat(501), {}, 5]) {
    await assert.rejects(api.saveEntry(null, '2026-10-11', entry(30, note)), /note/);
  }
  assert.equal(storage.getItem(GUEST_STORAGE_KEY), null);
  await api.saveEntry(null, '2028-02-29', entry(1440, 'x'.repeat(500)));
  assert.equal(api.loadGuestEntries()['2028-02-29'].minutes, 1440);
});

test('corrupt or unknown-version guest data is preserved and reports a readable error', async () => {
  for (const value of ['{broken', '{"version":2,"entries":{}}', '{"version":1,"entries":{"2026-02-29":{"minutes":2}}}']) {
    const { api, storage } = fixture({ storage: memoryStorage(value) });
    assert.throws(() => api.loadGuestEntries(), /data has not been changed/);
    await assert.rejects(api.saveEntry(null, '2026-10-11', entry()), /data has not been changed/);
    assert.equal(storage.getItem(GUEST_STORAGE_KEY), value);
  }
});

test('browser storage access and quota failures are surfaced instead of pretending to save', async () => {
  const unavailable = fixture({ storage: () => { throw new Error('Access denied'); } });
  assert.throws(() => unavailable.api.loadGuestEntries(), /blocked access/);
  const quota = fixture({ storage: { getItem: () => null, setItem: () => { throw new Error('Quota exceeded'); } } });
  await assert.rejects(quota.api.saveEntry(null, '2026-10-11', entry()), /Could not save/);
});

test('unconfigured cloud never creates fake accounts or falls back to guest storage', async () => {
  const { api } = fixture();
  await api.saveEntry(null, '2026-10-11', entry());
  assert.equal(await api.getSession(), null);
  await assert.rejects(api.signUp('a@example.com', 'password1'), /not connected/);
  await assert.rejects(api.loadEntries(USER), /not connected/);
  await assert.rejects(api.saveEntry(USER, '2026-10-11', entry(500)), /not connected/);
  assert.deepEqual(api.loadGuestEntries(), { '2026-10-11': entry() });
});

test('cloud history is isolated by user and fetches all pages even below requested page size', async () => {
  const cloud = fakeCloud([
    { user_id: USER, date: '2026-10-11', ...entry(1) },
    { user_id: USER, date: '2026-10-12', ...entry(2) },
    { user_id: USER, date: '2026-10-13', ...entry(3) },
    { user_id: OTHER_USER, date: '2026-10-14', ...entry(99) },
  ], { rowCap: 1 });
  const { api, storage } = fixture({ client: cloud.client });
  assert.deepEqual(await api.loadEntries(USER), { '2026-10-11': entry(1), '2026-10-12': entry(2), '2026-10-13': entry(3) });
  assert.equal(cloud.calls.filter(([type]) => type === 'query').length, 4);
  assert.equal(storage.getItem(GUEST_STORAGE_KEY), null, 'cloud entries are never cached as guest history');
});

test('cloud edits and deletion target one account/date and leave guest history intact', async () => {
  const cloud = fakeCloud([{ user_id: OTHER_USER, date: '2026-10-11', ...entry(99) }]);
  const { api } = fixture({ client: cloud.client });
  await api.saveEntry(null, '2026-10-11', entry(12));
  await api.saveEntry(USER, '2026-10-11', entry(100));
  await api.saveEntry(USER, '2026-10-11', entry(0, 'Day off'));
  assert.deepEqual(await api.loadEntries(USER), { '2026-10-11': entry(0, 'Day off') });
  await api.deleteEntry(USER, '2026-10-11');
  assert.deepEqual(await api.loadEntries(USER), {});
  assert.equal(cloud.getRows()[0].user_id, OTHER_USER);
  assert.deepEqual(api.loadGuestEntries(), { '2026-10-11': entry(12) });
});

test('expired or changed sessions cannot access or write a different account', async () => {
  const cloud = fakeCloud();
  const { api } = fixture({ client: cloud.client });
  await assert.rejects(api.loadEntries(OTHER_USER), /session has changed/);
  cloud.setSession(null);
  await assert.rejects(api.saveEntry(USER, '2026-10-11', entry()), /session has changed/);
  await assert.rejects(api.deleteEntry(USER, '2026-10-11'), /session has changed/);
  assert.equal(cloud.calls.length, 0);
});

test('network failure does not read guest history or claim a successful cloud save', async () => {
  const cloud = fakeCloud([], { queryThrows: new TypeError('Failed to fetch') });
  const { api } = fixture({ client: cloud.client });
  await api.saveEntry(null, '2026-10-11', entry(12));
  await assert.rejects(api.loadEntries(USER), /Cannot reach the server/);
  await assert.rejects(api.saveEntry(USER, '2026-10-11', entry(50)), /Cannot reach the server/);
  assert.deepEqual(api.loadGuestEntries(), { '2026-10-11': entry(12) });
});

test('explicit import preserves cloud conflicts, returns inserted count and is repeatable', async () => {
  const cloud = fakeCloud([{ user_id: USER, date: '2026-10-11', ...entry(60) }]);
  const { api } = fixture({ client: cloud.client });
  await api.saveEntry(null, '2026-10-11', entry(999));
  await api.saveEntry(null, '2026-10-12', entry(0, 'Day off'));
  assert.equal(await api.importGuestEntries(USER), 1);
  assert.equal(await api.importGuestEntries(USER), 0);
  assert.deepEqual(await api.loadEntries(USER), { '2026-10-11': entry(60), '2026-10-12': entry(0, 'Day off') });
  assert.equal(Object.keys(api.loadGuestEntries()).length, 2, 'device history remains available as a backup');
});

test('email flows preserve GitHub Pages repository path and return real Supabase results', async () => {
  const cloud = fakeCloud();
  const { api } = fixture({ client: cloud.client, location: { origin: 'https://driver.github.io', pathname: '/flex-hours/', search: '?private=1', hash: '#token' } });
  const registered = await api.signUp(' driver@example.com ', 'password123');
  assert.equal(registered.session, null, 'email confirmation must not be mistaken for a signed-in session');
  assert.equal(cloud.calls[0][1].options.emailRedirectTo, 'https://driver.github.io/flex-hours/');
  assert.equal(cloud.calls[0][1].email, 'driver@example.com');
  await api.requestPasswordReset('driver@example.com');
  assert.equal(cloud.calls[1][2].redirectTo, 'https://driver.github.io/flex-hours/');
  await api.updatePassword('new-password123');
  assert.deepEqual(cloud.calls[2], ['update', { password: 'new-password123' }]);
  assert.equal((await api.signIn('driver@example.com', 'password123')).session.user.id, USER);
  await api.signOut();
  assert.equal(await api.getSession(), null);
  assert.deepEqual(cloud.calls.at(-1), ['signOut', { scope: 'local' }]);
});

test('credentials are validated before sending and auth errors are translated', async () => {
  const cloud = fakeCloud([], { authError: { code: 'invalid_credentials', message: 'Invalid login credentials' } });
  const { api } = fixture({ client: cloud.client, location: { origin: 'http://localhost:5173', pathname: '/' } });
  await assert.rejects(api.signUp('no-email', 'password123'), /valid email/);
  await assert.rejects(api.signUp('a@example.com', 'short'), /8 to 128/);
  await assert.rejects(api.updatePassword(''), /8 to 128/);
  assert.equal(cloud.calls.length, 0);
  await assert.rejects(api.signIn('a@example.com', 'bad'), /Incorrect email or password/);
});

test('auth subscribers run outside the auth callback and unsubscribe cancels queued events', async () => {
  const cloud = fakeCloud();
  const { api } = fixture({ client: cloud.client });
  const received = [];
  const unsubscribe = api.onAuthChange((session, event) => { received.push([session, event]); });
  const session = { user: { id: USER } };
  cloud.emitAuth('PASSWORD_RECOVERY', session);
  assert.equal(received.length, 0);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(received, [[session, 'PASSWORD_RECOVERY']]);
  cloud.emitAuth('SIGNED_OUT', null);
  unsubscribe();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(received.length, 1);
  assert.equal(cloud.wasUnsubscribed(), true);
});

test('legacy entries stay completed and future reservations survive reload and import', async () => {
  const legacy = JSON.stringify({ version: 1, entries: { '2026-10-11': { minutes: 90, note: 'Old entry' } } });
  const cloud = fakeCloud();
  const { api, storage } = fixture({ client: cloud.client, storage: memoryStorage(legacy) });
  assert.deepEqual(api.loadGuestEntries()['2026-10-11'], entry(90, 'Old entry'));
  await api.saveEntry(null, '2027-02-04', entry(270, 'Reserved morning block', 'reserved'));
  const reopened = createStorage({ storage, client: cloud.client });
  assert.equal(reopened.loadGuestEntries()['2027-02-04'].status, 'reserved');
  await reopened.importGuestEntries(USER);
  assert.deepEqual((await reopened.loadEntries(USER))['2027-02-04'], entry(270, 'Reserved morning block', 'reserved'));
  await reopened.saveEntry(USER, '2027-02-04', entry(265, 'Finished', 'completed'));
  assert.equal((await reopened.loadEntries(USER))['2027-02-04'].status, 'completed');
});

test('invalid reservation status never overwrites a valid record', async () => {
  const { api } = fixture();
  await api.saveEntry(null, '2027-01-01', entry(180, '', 'reserved'));
  for (const status of ['pending', null, 1, '']) {
    await assert.rejects(api.saveEntry(null, '2027-01-01', entry(90, '', status)), /valid status/);
  }
  assert.equal(api.loadGuestEntries()['2027-01-01'].status, 'reserved');
});

test('validation and cloud failures switch to Ukrainian and back to English', async () => {
  const cloud = fakeCloud([], { authError: { code: 'invalid_credentials' } });
  const { api } = fixture({ client: cloud.client });
  try {
    setStorageLocale('uk');
    await assert.rejects(api.saveEntry(null, '2026-10-11', entry(1500)), /Тривалість/);
    await assert.rejects(api.signIn('driver@example.com', 'wrong'), /Неправильна електронна адреса/);
  } finally { setStorageLocale('en'); }
  await assert.rejects(api.signIn('driver@example.com', 'wrong'), /Incorrect email/);
});
