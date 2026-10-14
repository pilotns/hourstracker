import './style.css';
import { localDateKey, parseDate, shiftDate, rollingDates, sumMinutes, formatDuration, setDateLocale } from './dates.js';
import { cloudConfigured, getSession, onAuthChange, signUp, signIn, signOut, requestPasswordReset, updatePassword, loadEntries, saveEntry, deleteEntry, loadGuestEntries, importGuestEntries, setStorageLocale } from './storage.js';
import { LOCALE_STORAGE_KEY, setLocale, getLocale, intlLocale, t } from './i18n.js';
import { MINUTE_PRESETS, createMinuteSelection, toggleMinuteSelection, getAvailability } from './hours.js';

const app = document.querySelector('#app');
const dialog = document.querySelector('#editor');
const state = { tab: 'overview', end: localDateKey(), entries: {}, user: null, loading: true, error: '', authMode: 'signup', authBusy: false, authMessage: '', authMessageKey: '', authError: false, month: '', recovery: false };
let loadId = 0;
let authGeneration = 0;
let editorGeneration = 0;
let toastTimer;
let editorBusy = false;
let lastToday = localDateKey();
const MIN_END = '1900-01-07';
const MAX_END = '2100-12-31';
const WEEKLY_LIMIT_MINUTES = 40 * 60;
const icons = {
  arrow: '<path d="m9 5 7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="4"/><path d="M8 3v4M16 3v4M4 10h16M8 14h2M14 14h2M8 17h2"/>',
  history: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  edit: '<path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15l-1 5Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 .5-10A6 6 0 0 1 19 10a4 4 0 0 1-1 8H7Z"/>',
  logout: '<path d="M10 4H5v16h5M10 12h11m-4-4 4 4-4 4"/>',
};
function icon(name, cls = '') { return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`; }
function escape(value = '') { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const prettyDate = (key, options) => new Intl.DateTimeFormat(intlLocale(), options).format(parseDate(key));
const entryStatus = entry => entry?.status === 'reserved' ? 'reserved' : 'completed';
function applyLanguage(value, persist = false) {
  const locale = setLocale(value);
  setDateLocale(locale); setStorageLocale(locale);
  document.documentElement.lang = locale;
  document.title = t('appTitle');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('appDescription'));
  if (persist) { try { localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch { /* Language still works for this session. */ } }
}
let savedLocale = 'en';
try { savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY) || 'en'; } catch { /* Start in English when browser storage is unavailable. */ }
applyLanguage(savedLocale);
function toast(message) {
  const el = document.querySelector('#toast');
  el.textContent = message; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
}
function availabilityGauge(minutes, usedMinutes, ready) {
  const fraction = usedMinutes / WEEKLY_LIMIT_MINUTES;
  const percent = new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: 2 }).format(fraction);
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  const accessibleState = ready
    ? `role="meter" aria-label="${t('usedHours')}" aria-valuemin="0" aria-valuemax="${WEEKLY_LIMIT_MINUTES}" aria-valuenow="${Math.min(usedMinutes, WEEKLY_LIMIT_MINUTES)}" aria-valuetext="${escape(t('usageValue', { used: formatDuration(usedMinutes), remaining: formatDuration(minutes), percent }))}"`
    : `role="status" aria-label="${t(state.error ? 'loadFailed' : 'loading')}"`;
  return `<div class="availability-gauge" ${accessibleState}>
    <svg class="availability-ring" viewBox="0 0 240 240" aria-hidden="true">
      <circle class="availability-ring-track" cx="120" cy="120" r="108" pathLength="100" />
      ${ready && usedMinutes > 0 ? `<circle class="availability-ring-fill" cx="120" cy="120" r="108" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="${100 - Math.min(1, fraction) * 100}" />` : ''}
    </svg>
    <div class="availability-center">
      <span class="availability-label">${t('remaining')}</span>
      <div class="availability-duration"><span class="availability-hours">${ready ? hours : '—'}</span>${ready ? `<span class="availability-unit">${t('hourShort')}</span>` : ''}</div>
      ${ready && rest ? `<span class="availability-minutes">${rest} ${t('minuteShort')}</span>` : ''}
      <span class="availability-percent">${ready ? t('percentUsed', { percent }) : '—'}</span>
    </div>
  </div>`;
}
function breakdown(dates) {
  const reserved = dates.reduce((sum, key) => sum + (entryStatus(state.entries[key]) === 'reserved' ? state.entries[key].minutes : 0), 0);
  const worked = sumMinutes(state.entries, dates) - reserved;
  return `<div class="summary-breakdown"><div class="summary-breakdown-item worked"><span>${t('worked')}</span><strong>${formatDuration(worked)}</strong></div><div class="summary-breakdown-item reserved"><span>${t('reserved')}</span><strong>${formatDuration(reserved)}</strong></div></div>`;
}
function header() {
  return `<header class="topbar"><a class="brand" href="#" aria-label="${t('brandLabel')}"><img src="${import.meta.env.BASE_URL}favicon.svg" alt="" width="36" height="36"/><span>hours<span class="brand-light">tracker</span><small>${t('brandTagline')}</small></span></a><div class="header-actions"><label class="language-picker"><span class="sr-only">${t('language')}</span><select class="language-select" id="language" aria-label="${t('language')}"><option value="en" lang="en" ${getLocale() === 'en' ? 'selected' : ''}>EN</option><option value="uk" lang="uk" ${getLocale() === 'uk' ? 'selected' : ''}>Українська</option></select></label><button class="avatar" data-tab="profile" aria-label="${t('profileOpen')}">${state.user ? escape(state.user.email?.[0]?.toUpperCase() || 'U') : icon('user')}</button></div></header>`;
}
function navigation() {
  return `<nav class="bottom-nav" aria-label="${t('mainMenu')}">${[['overview', 'calendar'], ['history', 'history'], ['profile', 'user']].map(([tab, symbol]) => `<button data-tab="${tab}" class="nav-item ${state.tab === tab ? 'active' : ''}" ${state.tab === tab ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${t(tab)}</span></button>`).join('')}</nav>`;
}
function status() {
  if (state.loading) return `<div class="status-line" role="status"><span class="status-dot loading"></span>${t('loading')}</div>`;
  if (state.error) return `<div class="error-banner" role="alert">${escape(state.error)} <button id="retry" class="text-button">${t('retry')}</button></div>`;
  return `<div class="status-line"><span class="status-dot ${state.user ? 'cloud' : ''}"></span>${t(state.user ? 'savedAccount' : 'savedDevice')}</div>`;
}
function dayRow(key) {
  const entry = state.entries[key], hasHours = entry?.minutes > 0, today = key === localDateKey(), reserved = entryStatus(entry) === 'reserved';
  const label = `${prettyDate(key, { dateStyle: 'full' })}, ${entry ? formatDuration(entry.minutes) : t('noHours')}${entry ? `, ${t(entryStatus(entry))}` : ''}. ${t('edit')}`;
  return `<button class="day-row ${hasHours ? 'worked' : ''} ${reserved ? 'reserved' : ''}" data-edit="${key}" aria-label="${escape(label)}" ${state.loading || state.error ? 'disabled' : ''}>
    <span class="day-tile"><span>${prettyDate(key, { weekday: 'short' })}</span><strong>${parseDate(key).getDate()}</strong></span>
    <span class="day-description"><span class="day-name">${today ? t('today') : prettyDate(key, { weekday: 'long' })}${today ? '<span class="today-dot"></span>' : ''}</span><small>${entry?.note ? escape(entry.note) : hasHours ? prettyDate(key, { day: 'numeric', month: 'long' }) : t('noEntries')}</small>${entry ? `<span class="entry-status ${entryStatus(entry)}">${t(entryStatus(entry))}</span>` : ''}</span>
    <span class="day-duration ${hasHours ? '' : 'muted'}">${entry ? formatDuration(entry.minutes) : '—'}</span>${icon('edit', 'row-edit')}
  </button>`;
}
function overview() {
  const dates = rollingDates(state.end), total = sumMinutes(state.entries, dates);
  const { availableMinutes, overLimitMinutes } = getAvailability(total, WEEKLY_LIMIT_MINUTES);
  const ready = !state.loading && !state.error;
  const today = localDateKey(), max = Math.max(240, ...dates.map(date => state.entries[date]?.minutes || 0));
  return `<section class="summary-card ${ready && overLimitMinutes ? 'over-limit' : ''}" aria-label="${t('availabilitySevenDays')}">
      <div class="availability-display">${availabilityGauge(availableMinutes, total, ready)}</div>
    </section>
    <section class="window-section" aria-labelledby="window-title"><div class="section-heading"><div><h2 id="window-title">${t('yourSevenDays')}</h2><p>${t('rollingPeriod')} · ${prettyDate(state.end, { year: 'numeric' })}</p></div><div class="window-controls"><button class="icon-button" data-shift="-1" aria-label="${t('previousDay')}" ${state.end <= MIN_END ? 'disabled' : ''}>${icon('arrow', 'rotate')}</button><button class="icon-button" data-shift="1" aria-label="${t('nextDay')}" ${state.end >= MAX_END ? 'disabled' : ''}>${icon('arrow')}</button></div></div>
      <div class="days-strip" id="days-strip" aria-label="${t('stripLabel')}">${dates.map(key => {
        const entry = state.entries[key], mins = entry?.minutes || 0, reserved = entryStatus(entry) === 'reserved';
        const label = `${prettyDate(key, { dateStyle: 'full' })}, ${formatDuration(mins)}${entry ? `, ${t(entryStatus(entry))}` : ''}. ${t('edit')}`;
        return `<button class="day-column ${key === today ? 'is-today' : ''} ${mins ? 'has-hours' : ''} ${reserved ? 'reserved' : ''}" data-edit="${key}" aria-label="${escape(label)}" ${state.loading || state.error ? 'disabled' : ''}><span class="column-weekday">${prettyDate(key, { weekday: 'short' })}</span><span class="column-date">${parseDate(key).getDate()}</span><span class="bar-track"><span class="bar-fill" style="height:${mins ? Math.max(8, mins / max * 100) : 5}%"></span></span><span class="column-hours">${mins ? `${Number((mins / 60).toFixed(2)).toLocaleString(intlLocale())} ${t('hourShort')}` : '—'}</span></button>`;
      }).join('')}</div>
      <label class="jump-date">${icon('calendar')}<span>${t('periodEnding')}</span><input aria-label="${t('endDateLabel')}" id="end-date" type="date" value="${state.end}" max="${MAX_END}" min="${MIN_END}" /></label>
    </section>
    ${!Object.keys(state.entries).length && !state.loading ? `<p class="empty-hint">${t('startFirstDay')}<br/>${t('startFirstDayHint')}</p>` : ''}
    ${status()}${!state.user ? `<button class="account-nudge" data-tab="profile"><span class="nudge-icon">${icon('cloud')}</span><span><strong>${t('historyEverywhere')}</strong><small>${t('accountAccess')}</small></span>${icon('arrow')}</button>` : ''}`;
}
function history() {
  const allKeys = Object.keys(state.entries).sort().reverse(), keys = allKeys.filter(key => !state.month || key.startsWith(state.month));
  return `<div class="page-heading"><div><p class="eyebrow">${t('historyEyebrow')}</p><h1>${t('history')}<span>.</span></h1></div><button id="export" class="icon-button" aria-label="${t('downloadCsv')}" ${!allKeys.length ? 'disabled' : ''}>${icon('download')}</button></div>
    <div class="history-toolbar"><label>${t('month')}<input id="history-month" type="month" value="${state.month}" aria-label="${t('historyMonth')}" /></label><button id="all-history" class="text-button">${t('allTime')}</button></div>
    <div class="history-summary"><span>${t(state.month ? 'selectedMonth' : 'totalAllTime')}<strong>${formatDuration(sumMinutes(state.entries, keys))}</strong></span><span class="history-count">${keys.length}<small>${t('entries')}</small></span></div>${breakdown(keys)}
    ${keys.length ? `<div class="history-list">${keys.map((key, i) => `${!i || key.slice(0, 7) !== keys[i - 1].slice(0, 7) ? `<h2 class="month-heading">${prettyDate(key, { month: 'long', year: 'numeric' })}</h2>` : ''}${dayRow(key)}`).join('')}</div>` : `<div class="empty-state">${icon('history')}<h2>${t(state.month ? 'emptyMonth' : 'emptyHistory')}</h2><p>${t('historyHint')}<br/>${t('historyHintSecond')}</p><button class="primary-button" data-tab="overview">${t('goToHours')}</button></div>`}${status()}`;
}
function profile() {
  if (state.user && !state.recovery) {
    let guestCount = 0; try { guestCount = Object.keys(loadGuestEntries()).length; } catch { /* Main storage reports errors. */ }
    return `<div class="page-heading"><div><p class="eyebrow">${t('profileEyebrow')}</p><h1>${t('profile')}<span>.</span></h1></div></div><section class="profile-card"><div class="profile-emblem">${icon('user')}</div><h2>${t('allSaved')}</h2><p class="account-email">${escape(state.user.email)}</p><p>${t('accountHint')}</p>${status()}<button id="refresh" class="secondary-button">${t('refreshHistory')}</button>${guestCount ? `<div class="import-box"><h3>${t('deviceEntries')}</h3><p>${t('importHint')}</p><button id="import" class="primary-button">${t('importEntries', { count: guestCount })}</button></div>` : ''}<button id="logout" class="logout-button">${icon('logout')}${t('signOut')}</button></section>`;
  }
  const reset = state.authMode === 'reset', signup = state.authMode === 'signup', recovery = state.recovery;
  return `<div class="page-heading"><div><p class="eyebrow">${t('profileEyebrow')}</p><h1>${t('profile')}<span>.</span></h1></div></div>
    <section class="profile-card"><div class="profile-emblem">${icon('cloud')}</div><h2>${t(recovery ? 'newPassword' : reset ? 'recoverAccess' : 'hoursEverywhere')}</h2><p>${t(recovery ? 'newPasswordHint' : reset ? 'resetHint' : 'signupHint')}</p>
      ${!reset && !recovery ? `<div class="auth-tabs" aria-label="${t('authMethod')}"><button class="${signup ? 'selected' : ''}" data-auth-mode="signup">${t('signup')}</button><button class="${!signup ? 'selected' : ''}" data-auth-mode="signin">${t('signin')}</button></div>` : ''}
      ${!cloudConfigured ? `<div class="config-notice">${t('cloudUnavailable')}</div>` : ''}
      <form id="auth-form" class="auth-form" novalidate>${!recovery ? `<label>${t('email')}<input name="email" type="email" autocomplete="email" placeholder="you@example.com" required maxlength="254" /></label>` : ''}${!reset || recovery ? `<label>${t(recovery ? 'newPassword' : 'password')}<input name="password" type="password" autocomplete="${signup || recovery ? 'new-password' : 'current-password'}" placeholder="${t(signup || recovery ? 'passwordMinimum' : 'passwordPlaceholder')}" minlength="${signup || recovery ? 8 : 1}" required maxlength="128" /></label>` : ''}<p class="form-message" id="auth-message" role="status" hidden></p><button class="primary-button" type="submit" ${!cloudConfigured || state.authBusy ? 'disabled' : ''}>${t(recovery ? 'savePassword' : reset ? 'sendLink' : signup ? 'createAccount' : 'signin')}</button></form>
      ${!recovery ? `<button class="text-button auth-link" data-auth-mode="${reset ? 'signin' : 'reset'}">${t(reset ? 'backToSignin' : 'forgotPassword')}</button>` : ''}
    </section><div class="local-note">${icon('check')}<p>${t('guestStart')}<br/>${t('guestHint')}</p></div>`;
}
function render() {
  const previousFill = app.querySelector('.availability-ring-fill');
  const previousOffset = previousFill ? Number.parseFloat(getComputedStyle(previousFill).strokeDashoffset) : 100;
  app.innerHTML = `<div class="app-shell ${state.tab === 'overview' ? 'overview-shell' : ''}">${header()}<main id="main">${state.tab === 'overview' ? overview() : state.tab === 'history' ? history() : profile()}</main><footer class="app-footer">${t('footer')}<span>${t('footerNote')}</span></footer>${navigation()}</div>`;
  const fill = app.querySelector('.availability-ring-fill');
  if (fill && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const nextOffset = Number(fill.getAttribute('stroke-dashoffset'));
    if (Number.isFinite(previousOffset) && previousOffset !== nextOffset) {
      fill.animate([{ strokeDashoffset: String(previousOffset) }, { strokeDashoffset: String(nextOffset) }], { duration: 700, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    }
  }
  bindEvents();
  updateAuthFeedback();
}
function changeTab(tab) { state.tab = tab; render(); window.scrollTo({ top: 0, behavior: 'instant' }); }
function shiftWindow(amount) {
  const next = shiftDate(state.end, amount);
  if (next > MAX_END || next < MIN_END) return;
  state.end = next; render();
}
async function refreshEntries() {
  const id = ++loadId, userId = state.user?.id || null;
  state.loading = true; state.error = ''; render();
  try {
    const entries = await loadEntries(userId);
    if (id !== loadId) return;
    state.entries = entries;
  } catch (error) { if (id === loadId) state.error = error.message || t('loadFailed'); }
  finally { if (id === loadId) { state.loading = false; render(); } }
}
function bindEvents() {
  app.querySelector('#language')?.addEventListener('change', event => {
    applyLanguage(event.target.value, true);
    state.authMessage = state.authMessageKey ? t(state.authMessageKey) : '';
    document.querySelector('#toast').hidden = true;
    if (state.error) refreshEntries(); else render();
  });
  app.querySelector('.brand')?.addEventListener('click', event => { event.preventDefault(); changeTab('overview'); });
  app.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => changeTab(button.dataset.tab)));
  app.querySelectorAll('[data-shift]').forEach(button => button.addEventListener('click', () => shiftWindow(Number(button.dataset.shift))));
  app.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => openEditor(button.dataset.edit)));
  app.querySelector('#end-date')?.addEventListener('change', event => { if (event.target.value && event.target.checkValidity()) { state.end = event.target.value; render(); } });
  app.querySelector('#history-month')?.addEventListener('change', event => { state.month = event.target.value; render(); });
  app.querySelector('#all-history')?.addEventListener('click', () => { state.month = ''; render(); });
  app.querySelector('#export')?.addEventListener('click', exportHistory);
  app.querySelector('#retry')?.addEventListener('click', refreshEntries);
  app.querySelector('#refresh')?.addEventListener('click', refreshEntries);
  app.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => { if (state.authBusy) return; state.authMode = button.dataset.authMode; state.authMessage = ''; state.authMessageKey = ''; state.authError = false; render(); }));
  app.querySelector('#auth-form')?.addEventListener('submit', submitAuth);
  app.querySelector('#logout')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try { await signOut(); toast(t('signedOut')); }
    catch (error) { toast(error.message); render(); }
  });
  app.querySelector('#import')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    const userId = state.user.id;
    try { const count = await importGuestEntries(userId); if (state.user?.id !== userId) return; toast(t('importedDays', { count })); await refreshEntries(); }
    catch (error) { toast(error.message); render(); }
  });
  const strip = app.querySelector('#days-strip');
  if (strip) {
    let start = null, suppressClick = false;
    strip.addEventListener('pointerdown', event => { start = { x: event.clientX, y: event.clientY }; suppressClick = false; });
    strip.addEventListener('pointerup', event => {
      if (!start) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y; start = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        suppressClick = true;
        // Defer rerender until the swipe's click has been suppressed.
        setTimeout(() => shiftWindow(dx < 0 ? 1 : -1), 0);
      }
    });
    strip.addEventListener('pointercancel', () => { start = null; });
    strip.addEventListener('click', event => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; } }, true);
  }
}
function openEditor(key) {
  if (state.loading || state.error) { toast(t('waitForHistory')); return; }
  editorGeneration++;
  const future = key > localDateKey();
  const entry = state.entries[key] || { minutes: 0, note: '', status: future ? 'reserved' : 'completed' };
  let selection = createMinuteSelection(entry.minutes);
  editorBusy = false;
  dialog.innerHTML = `<div class="sheet-handle"></div><div class="editor-header"><div><p class="eyebrow">${t('workday')}</p><h2 id="editor-title">${prettyDate(key, { day: 'numeric', month: 'long' })}</h2><p>${prettyDate(key, { weekday: 'long', year: 'numeric' })}</p></div><button class="icon-button" id="close-editor" aria-label="${t('close')}">${icon('close')}</button></div>
    <form id="entry-form" novalidate><label class="minutes-label" for="minutes">${t('totalMinutes')}</label><div class="minutes-input"><input id="minutes" name="minutes" type="number" inputmode="numeric" min="0" max="1440" step="1" value="${entry.minutes}" required aria-describedby="duration-preview preset-hint" /><span aria-hidden="true">${t('minuteShort')}</span></div><p class="duration-preview" id="duration-preview" aria-live="polite">${formatDuration(entry.minutes)}</p>
    <div class="minute-presets" role="group" aria-label="${t('quickDuration')}">${MINUTE_PRESETS.map(value => `<label class="minute-preset"><input type="checkbox" data-duration="${value}" aria-label="${value} ${t('minuteShort')}" ${selection.selected.includes(value) ? 'checked' : ''} /><span><span class="preset-marker">${icon('check')}</span>${value}<small>${t('minuteShort')}</small></span></label>`).join('')}</div><p class="preset-hint" id="preset-hint">${t('presetHint')}</p>
    <p id="entry-error" class="form-message" role="alert" hidden></p><button class="primary-button" type="submit">${icon('check')}${t('saveHours')}</button>${state.entries[key] ? `<button class="delete-button" id="delete-entry" type="button">${t('deleteDay')}</button>` : ''}</form>`;
  dialog.querySelector('#close-editor').addEventListener('click', () => { if (!editorBusy) dialog.close(); });
  const minutesInput = dialog.querySelector('#minutes');
  const syncSelection = () => {
    dialog.querySelectorAll('[data-duration]').forEach(input => { input.checked = selection.selected.includes(Number(input.dataset.duration)); });
    dialog.querySelector('#duration-preview').textContent = Number.isInteger(selection.minutes) && selection.minutes >= 0 && selection.minutes <= 1440 ? formatDuration(selection.minutes) : '—';
  };
  minutesInput.addEventListener('input', () => {
    selection = { minutes: minutesInput.value === '' ? 0 : Number(minutesInput.value), selected: [] };
    dialog.querySelector('#entry-error').hidden = true;
    syncSelection();
  });
  dialog.querySelectorAll('[data-duration]').forEach(input => input.addEventListener('change', () => {
    const errorEl = dialog.querySelector('#entry-error');
    try {
      selection = toggleMinuteSelection(selection, Number(input.dataset.duration));
      minutesInput.value = selection.minutes;
      errorEl.hidden = true;
    } catch {
      errorEl.textContent = t('durationInvalid'); errorEl.hidden = false;
    }
    syncSelection();
  }));
  dialog.querySelector('#entry-form').addEventListener('submit', event => { event.preventDefault(); commitEntry(key); });
  dialog.querySelector('#delete-entry')?.addEventListener('click', async event => {
    if (!event.currentTarget.dataset.confirm) { event.currentTarget.dataset.confirm = 'yes'; event.currentTarget.textContent = t('confirmDelete'); return; }
    await commitEntry(key, true);
  });
  dialog.showModal();
  dialog.querySelector('#close-editor').focus();
}
dialog.addEventListener('cancel', event => { if (editorBusy) event.preventDefault(); });
dialog.addEventListener('click', event => { if (event.target === dialog && !editorBusy) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
async function commitEntry(key, remove = false) {
  if (editorBusy) return;
  const form = dialog.querySelector('#entry-form'), errorEl = dialog.querySelector('#entry-error');
  errorEl.hidden = true;
  const minutes = Number(form.elements.minutes.value);
  const entry = { minutes, note: state.entries[key]?.note ?? '', status: key > localDateKey() ? 'reserved' : 'completed' };
  if (!remove && (!form.elements.minutes.value.trim() || !Number.isInteger(minutes) || minutes > 1440 || minutes < 0)) {
    errorEl.textContent = t('durationInvalid'); errorEl.hidden = false; return;
  }
  editorBusy = true;
  dialog.querySelectorAll('button, input, textarea, select').forEach(el => { el.disabled = true; });
  const userId = state.user?.id || null;
  const editId = editorGeneration, authId = authGeneration;
  const isCurrent = () => editId === editorGeneration && authId === authGeneration && dialog.querySelector('#entry-form') === form;
  try {
    if (remove) await deleteEntry(userId, key); else await saveEntry(userId, key, entry);
    if (!isCurrent()) return;
    if (remove) delete state.entries[key]; else state.entries[key] = entry;
    dialog.close(); render(); toast(remove ? t('entryDeleted') : t('entrySaved', { duration: formatDuration(entry.minutes) }));
  } catch (error) { if (isCurrent()) { errorEl.textContent = error.message || t('saveFailed'); errorEl.hidden = false; } }
  finally { if (isCurrent()) { editorBusy = false; dialog.querySelectorAll('button, input, textarea, select').forEach(el => { el.disabled = false; }); } }
}
function updateAuthFeedback() {
  const form = app.querySelector('#auth-form');
  if (!form) return;
  const message = form.querySelector('#auth-message');
  message.textContent = state.authMessage; message.hidden = !state.authMessage; message.classList.toggle('error', state.authError);
  form.querySelector('[type="submit"]').disabled = !cloudConfigured || state.authBusy;
}
async function submitAuth(event) {
  event.preventDefault(); if (state.authBusy || !cloudConfigured) return;
  const form = event.currentTarget, mode = state.authMode, recovery = state.recovery;
  state.authBusy = true; state.authMessage = ''; state.authMessageKey = ''; state.authError = false; updateAuthFeedback();
  const email = form.elements.email?.value.trim(), password = form.elements.password?.value;
  try {
    if (recovery) { await updatePassword(password); state.recovery = false; toast(t('passwordUpdated')); render(); }
    else if (mode === 'reset') { await requestPasswordReset(email); state.authMessageKey = 'resetSent'; state.authMessage = t(state.authMessageKey); }
    else if (mode === 'signup') {
      const result = await signUp(email, password);
      if (!result.session) { state.authMessageKey = 'signupSent'; state.authMessage = t(state.authMessageKey); }
    } else { await signIn(email, password); }
  } catch (error) { state.authMessage = error.message || t('signinFailed'); state.authError = true; }
  finally { state.authBusy = false; updateAuthFeedback(); }
}
function exportHistory() {
  const safeCell = value => `"${String(value).replace(/^[=+@\-\t\r]/, c => `'${c}`).replaceAll('"', '""')}"`;
  const rows = [[t('csvDate'), t('csvHours'), t('csvMinutes'), t('csvTotalMinutes'), t('csvStatus'), t('csvNote')], ...Object.keys(state.entries).sort().map(key => { const entry = state.entries[key]; return [key, Math.floor(entry.minutes / 60), entry.minutes % 60, entry.minutes, t(entryStatus(entry)), entry.note]; })];
  const blob = new Blob(['\uFEFF', rows.map(row => row.map(safeCell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `flex-hours-${localDateKey()}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function start() {
  render();
  onAuthChange((session, event) => {
    if (event === 'PASSWORD_RECOVERY') { state.recovery = true; state.tab = 'profile'; }
    const nextUser = session?.user || null;
    if (nextUser?.id !== state.user?.id) {
      loadId++; authGeneration++; state.user = nextUser; state.entries = {}; if (dialog.open) dialog.close();
      if (!nextUser) state.recovery = false;
      refreshEntries();
    } else if (event === 'PASSWORD_RECOVERY') render();
  });
  try { const session = await getSession(); state.user = session?.user || null; await refreshEntries(); }
  catch (error) { state.loading = false; state.error = error.message; render(); }
}
window.addEventListener('storage', event => {
  if (!state.user && event.key === 'flex-hours.guest.v1') refreshEntries();
  // Keep an open editor intact; its locale will refresh on the next page load.
  if (event.key === LOCALE_STORAGE_KEY && !dialog.open) {
    applyLanguage(event.newValue || 'en');
    state.authMessage = state.authMessageKey ? t(state.authMessageKey) : '';
    if (state.error) refreshEntries(); else render();
  }
});
function reconcileToday() {
  const today = localDateKey();
  if (today !== lastToday) { if (state.end === lastToday) state.end = today; lastToday = today; if (state.tab !== 'profile') render(); }
}
function scheduleMidnight() {
  const next = new Date(); next.setHours(24, 0, 0, 50);
  setTimeout(() => { reconcileToday(); scheduleMidnight(); }, next.getTime() - Date.now());
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  reconcileToday();
  if (state.user && !dialog.open && state.tab !== 'profile') refreshEntries();
});
scheduleMidnight();
start();
