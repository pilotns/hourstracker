import { createClient } from '@supabase/supabase-js';

export const GUEST_STORAGE_KEY = 'flex-hours.guest.v1';
const PAGE_SIZE = 500;
const IMPORT_BATCH_SIZE = 250;
const messages = {
  en: {
    dateFormat: "Enter a date in YYYY-MM-DD format.",
    dateInvalid: "This date does not exist.",
    minutesInvalid: "Time must be between 0 and 24 hours in whole minutes.",
    noteInvalid: "The note must be text with no more than 500 characters.",
    emailInvalid: "Enter a valid email address.",
    passwordLength: "The password must contain 8 to 128 characters.",
    passwordRequired: "Enter your password.",
    invalidCredentials: "Incorrect email or password.",
    emailNotConfirmed: "Confirm your email using the link in the message before signing in.",
    userExists: "This email is already registered. Sign in to your account.",
    weakPassword: "Choose a stronger password with letters, numbers, and symbols.",
    samePassword: "Your new password must differ from the previous one.",
    rateLimited: "Too many attempts. Wait a moment and try again.",
    linkExpired: "This link has expired. Request a new email.",
    signupDisabled: "Registration is temporarily disabled.",
    sessionExpired: "Your session has expired. Sign in again.",
    networkError: "Cannot reach the server. Check your connection and try again.",
    accessDenied: "You do not have access to this entry. Sign in again.",
    schemaMissing: "Cloud storage is not set up yet. Contact the app owner.",
    cloudNotConfigured: "Registration and sync are not connected yet. You can track hours on this device.",
    redirectMissing: "Could not determine the app address for the email link.",
    storageAccessDenied: "Your browser blocked access to device history. Allow data storage.",
    storageCorrupt: "Could not read device history. Your saved data has not been changed.",
    storageWriteFailed: "Could not save hours on this device. Check available space and browser settings.",
    sessionCheckFailed: "Could not check your sign-in status.",
    accountInvalid: "Invalid account. Sign in again.",
    sessionChanged: "Your session has changed. Sign in to the correct account again.",
    signupFailed: "Could not create your account. Please try again.",
    signinFailed: "Could not sign in. Please try again.",
    signoutFailed: "Could not sign out. Please try again.",
    emailFailed: "Could not send the email. Please try again.",
    passwordUpdateFailed: "Could not update your password. Request a new link.",
    historyLoadFailed: "Could not load your history. Please try again.",
    historyInvalid: "The server returned invalid history. Please try again.",
    historyIncomplete: "Could not load your full history. Please try again.",
    entrySaveFailed: "Could not save your hours. Please try again.",
    entryDeleteFailed: "Could not delete the entry. Please try again.",
    importFailed: "Could not finish importing. Try again: existing days will not be overwritten.",
    statusInvalid: "Choose a valid status: completed or reserved.",
  },
  uk: {
    dateFormat: "Вкажіть дату у форматі РРРР-ММ-ДД.",
    dateInvalid: "Такої дати не існує.",
    minutesInvalid: "Тривалість має бути від 0 до 24 годин із точністю до хвилини.",
    noteInvalid: "Нотатка має бути текстом довжиною не більше 500 символів.",
    emailInvalid: "Введіть коректну електронну адресу.",
    passwordLength: "Пароль має містити від 8 до 128 символів.",
    passwordRequired: "Введіть пароль.",
    invalidCredentials: "Неправильна електронна адреса або пароль.",
    emailNotConfirmed: "Перш ніж увійти, підтвердьте електронну адресу за посиланням у листі.",
    userExists: "Цю електронну адресу вже зареєстровано. Увійдіть в обліковий запис.",
    weakPassword: "Оберіть надійніший пароль із літерами, цифрами та символами.",
    samePassword: "Новий пароль має відрізнятися від попереднього.",
    rateLimited: "Забагато спроб. Трохи зачекайте та спробуйте знову.",
    linkExpired: "Термін дії посилання минув. Запросіть новий лист.",
    signupDisabled: "Реєстрацію тимчасово вимкнено.",
    sessionExpired: "Термін дії сеансу минув. Увійдіть знову.",
    networkError: "Немає зв’язку із сервером. Перевірте інтернет і спробуйте знову.",
    accessDenied: "Немає доступу до цього запису. Увійдіть знову.",
    schemaMissing: "Хмарне сховище ще не налаштовано. Зверніться до власника застосунку.",
    cloudNotConfigured: "Реєстрацію та синхронізацію ще не підключено. Можна вести облік на цьому пристрої.",
    redirectMissing: "Не вдалося визначити адресу застосунку для посилання в листі.",
    storageAccessDenied: "Браузер заблокував доступ до історії на пристрої. Дозвольте збереження даних.",
    storageCorrupt: "Не вдалося прочитати історію на пристрої. Збережені дані не змінено.",
    storageWriteFailed: "Не вдалося зберегти години на пристрої. Перевірте вільне місце та налаштування браузера.",
    sessionCheckFailed: "Не вдалося перевірити вхід в обліковий запис.",
    accountInvalid: "Некоректний обліковий запис. Увійдіть знову.",
    sessionChanged: "Сеанс змінився. Увійдіть у потрібний обліковий запис знову.",
    signupFailed: "Не вдалося створити обліковий запис. Спробуйте знову.",
    signinFailed: "Не вдалося увійти. Спробуйте знову.",
    signoutFailed: "Не вдалося вийти з облікового запису. Спробуйте знову.",
    emailFailed: "Не вдалося надіслати лист. Спробуйте знову.",
    passwordUpdateFailed: "Не вдалося змінити пароль. Запросіть нове посилання.",
    historyLoadFailed: "Не вдалося завантажити історію. Спробуйте знову.",
    historyInvalid: "Сервер повернув некоректну історію. Спробуйте знову.",
    historyIncomplete: "Не вдалося завантажити всю історію. Спробуйте знову.",
    entrySaveFailed: "Не вдалося зберегти години. Спробуйте знову.",
    entryDeleteFailed: "Не вдалося видалити запис. Спробуйте знову.",
    importFailed: "Не вдалося завершити перенесення. Спробуйте знову: наявні дні не буде перезаписано.",
    statusInvalid: "Оберіть коректний статус: завершено або зарезервовано.",
  },
};
let storageLocale = 'en';

export function setStorageLocale(locale) {
  storageLocale = locale === 'uk' ? 'uk' : 'en';
}

function message(key) { return messages[storageLocale][key] ?? messages.en[key]; }

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(message('dateFormat'));
  }
  const parsed = new Date(`${date}T12:00:00Z`);
  if (date.startsWith('0000') || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(message('dateInvalid'));
  }
}

function validateEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
      !Number.isInteger(entry.minutes) || entry.minutes < 0 || entry.minutes > 1440) {
    throw new Error(message('minutesInvalid'));
  }
  const note = entry.note ?? '';
  if (typeof note !== 'string' || note.length > 500) {
    throw new Error(message('noteInvalid'));
  }
  const status = entry.status === undefined ? 'completed' : entry.status;
  if (status !== 'completed' && status !== 'reserved') throw new Error(message('statusInvalid'));
  return { minutes: entry.minutes, note, status };
}

function validateEmail(email) {
  const normalized = typeof email === 'string' ? email.trim() : '';
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error(message('emailInvalid'));
  }
  return normalized;
}

function validatePassword(password, isNew = false) {
  if (typeof password !== 'string' || password.length < (isNew ? 8 : 1) || password.length > 128) {
    throw new Error(isNew ? message('passwordLength') : message('passwordRequired'));
  }
  return password;
}

function cloudError(error, fallback) {
  const code = error?.code;
  const rawMessage = String(error?.message ?? '');
  let readable = message(fallback);
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(rawMessage)) {
    readable = message('invalidCredentials');
  } else if (code === 'email_not_confirmed') {
    readable = message('emailNotConfirmed');
  } else if (code === 'user_already_exists' || /already registered/i.test(rawMessage)) {
    readable = message('userExists');
  } else if (code === 'weak_password') {
    readable = message('weakPassword');
  } else if (code === 'same_password') {
    readable = message('samePassword');
  } else if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || error?.status === 429) {
    readable = message('rateLimited');
  } else if (code === 'otp_expired') {
    readable = message('linkExpired');
  } else if (code === 'signup_disabled') {
    readable = message('signupDisabled');
  } else if (code === 'session_not_found' || error?.status === 401 || code === 'PGRST301') {
    readable = message('sessionExpired');
  } else if (/fetch|network|load failed/i.test(rawMessage)) {
    readable = message('networkError');
  } else if (code === '42501') {
    readable = message('accessDenied');
  } else if (code === '42P01' || code === 'PGRST205') {
    readable = message('schemaMissing');
  }
  return new Error(readable, { cause: error });
}

/** Dependencies are injectable so storage and real auth flows can be tested without a server. */
export function createStorage({ client = null, storage = () => globalThis.localStorage, location = () => globalThis.location } = {}) {
  const resolve = (value) => typeof value === 'function' ? value() : value;

  function requireClient() {
    if (!client) throw new Error(message('cloudNotConfigured'));
    return client;
  }

  async function request(operation, fallback) {
    let result;
    try {
      result = await operation();
    } catch (error) {
      throw cloudError(error, fallback);
    }
    if (result.error) throw cloudError(result.error, fallback);
    return result;
  }

  function redirectUrl() {
    const current = resolve(location);
    if (!current?.origin || !current?.pathname) throw new Error(message('redirectMissing'));
    // Preserve the repository prefix on GitHub Pages; omit query strings and auth fragments.
    return `${current.origin}${current.pathname}`;
  }

  function loadGuestEntries() {
    let serialized;
    try {
      serialized = resolve(storage).getItem(GUEST_STORAGE_KEY);
    } catch (error) {
      throw new Error(message('storageAccessDenied'), { cause: error });
    }
    if (serialized === null) return {};
    try {
      const saved = JSON.parse(serialized);
      if (saved?.version !== 1 || !saved.entries || typeof saved.entries !== 'object' || Array.isArray(saved.entries)) {
        throw new Error('Invalid storage format');
      }
      const entries = {};
      for (const [date, entry] of Object.entries(saved.entries)) {
        validateDate(date);
        entries[date] = validateEntry(entry);
      }
      return entries;
    } catch (error) {
      // Keep the original value intact. A failed read must never erase existing history.
      throw new Error(message('storageCorrupt'), { cause: error });
    }
  }

  function writeGuestEntries(entries) {
    try {
      resolve(storage).setItem(GUEST_STORAGE_KEY, JSON.stringify({ version: 1, entries }));
    } catch (error) {
      throw new Error(message('storageWriteFailed'), { cause: error });
    }
  }

  async function getSession() {
    if (!client) return null;
    const { data } = await request(() => client.auth.getSession(), 'sessionCheckFailed');
    return data.session;
  }

  async function requireUser(userId) {
    requireClient();
    if (typeof userId !== 'string' || !USER_ID.test(userId)) throw new Error(message('accountInvalid'));
    const session = await getSession();
    if (!session?.user || session.user.id !== userId) throw new Error(message('sessionChanged'));
  }

  function onAuthChange(callback) {
    if (!client) return () => {};
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      // Supabase holds an auth lock while notifying subscribers. Do not await more auth calls here.
      setTimeout(() => { if (active) callback(session, event); }, 0);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }

  async function signUp(email, password) {
    const auth = requireClient().auth;
    const credentials = { email: validateEmail(email), password: validatePassword(password, true), options: { emailRedirectTo: redirectUrl() } };
    const { data } = await request(() => auth.signUp(credentials), 'signupFailed');
    return data;
  }

  async function signIn(email, password) {
    const auth = requireClient().auth;
    const credentials = { email: validateEmail(email), password: validatePassword(password) };
    const { data } = await request(() => auth.signInWithPassword(credentials), 'signinFailed');
    return data;
  }

  async function signOut() {
    const auth = requireClient().auth;
    await request(() => auth.signOut({ scope: 'local' }), 'signoutFailed');
  }

  async function requestPasswordReset(email) {
    const auth = requireClient().auth;
    const normalized = validateEmail(email);
    const redirectTo = redirectUrl();
    const { data } = await request(() => auth.resetPasswordForEmail(normalized, { redirectTo }), 'emailFailed');
    return data;
  }

  async function updatePassword(password) {
    const auth = requireClient().auth;
    const nextPassword = validatePassword(password, true);
    const { data } = await request(() => auth.updateUser({ password: nextPassword }), 'passwordUpdateFailed');
    return data;
  }

  async function loadEntries(userId = null) {
    if (userId === null) return loadGuestEntries();
    await requireUser(userId);
    const entries = {};
    let lastDate = null;
    for (;;) {
      let query = client.from('work_entries').select('date,minutes,note,status').eq('user_id', userId).order('date', { ascending: true }).limit(PAGE_SIZE);
      if (lastDate !== null) query = query.gt('date', lastDate);
      const { data } = await request(() => query, 'historyLoadFailed');
      if (!Array.isArray(data)) throw new Error(message('historyInvalid'));
      if (data.length === 0) return entries;
      for (const row of data) {
        validateDate(row.date);
        if (lastDate !== null && row.date <= lastDate) throw new Error(message('historyIncomplete'));
        entries[row.date] = validateEntry(row);
        lastDate = row.date;
      }
      // Continue until an empty page, even if the server's configured row cap is below PAGE_SIZE.
    }
  }

  async function saveEntry(userId, date, entry) {
    validateDate(date);
    const normalized = validateEntry(entry);
    if (userId === null) {
      const entries = loadGuestEntries();
      entries[date] = normalized;
      writeGuestEntries(entries);
      return normalized;
    }
    await requireUser(userId);
    await request(() => client.from('work_entries').upsert({ user_id: userId, date, ...normalized }, { onConflict: 'user_id,date' }).select('date,status').single(), 'entrySaveFailed');
    return normalized;
  }

  async function deleteEntry(userId, date) {
    validateDate(date);
    if (userId === null) {
      const entries = loadGuestEntries();
      delete entries[date];
      writeGuestEntries(entries);
      return;
    }
    await requireUser(userId);
    await request(() => client.from('work_entries').delete().eq('user_id', userId).eq('date', date), 'entryDeleteFailed');
  }

  async function importGuestEntries(userId) {
    await requireUser(userId);
    const rows = Object.entries(loadGuestEntries()).map(([date, entry]) => ({ user_id: userId, date, ...entry }));
    let imported = 0;
    for (let start = 0; start < rows.length; start += IMPORT_BATCH_SIZE) {
      const batch = rows.slice(start, start + IMPORT_BATCH_SIZE);
      // Database-level DO NOTHING keeps existing cloud dates safe, including concurrent writes.
      const { data, count } = await request(() => client.from('work_entries').upsert(batch, { onConflict: 'user_id,date', ignoreDuplicates: true, count: 'exact' }).select('date,status'), 'importFailed');
      imported += count ?? data?.length ?? 0;
    }
    // Keep the device history as a backup; importing is explicit and never runs during sign-in.
    return imported;
  }

  return { getSession, onAuthChange, signUp, signIn, signOut, requestPasswordReset, updatePassword, loadEntries, saveEntry, deleteEntry, importGuestEntries, loadGuestEntries };
}

const env = import.meta.env ?? {};
const url = env.VITE_SUPABASE_URL?.trim();
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
let client = null;
if (url && key) {
  try {
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  } catch {
    // Invalid deployment configuration still permits explicitly selected device-only storage.
  }
}
export const cloudConfigured = Boolean(client);
export const { getSession, onAuthChange, signUp, signIn, signOut, requestPasswordReset, updatePassword, loadEntries, saveEntry, deleteEntry, importGuestEntries, loadGuestEntries } = createStorage({ client });
