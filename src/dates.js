const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  uk: ['січ.', 'лют.', 'бер.', 'квіт.', 'трав.', 'черв.', 'лип.', 'серп.', 'вер.', 'жовт.', 'лист.', 'груд.'],
};
let dateLocale = 'en';

export function setDateLocale(locale = 'en') {
  if (locale !== 'en' && locale !== 'uk') throw new RangeError('Unsupported date locale');
  dateLocale = locale;
}

const message = (en, uk) => dateLocale === 'uk' ? uk : en;

/** A local calendar key, independent of the current UTC offset. */
export function localDateKey(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new RangeError(message('Invalid date', 'Некоректна дата'));
  }
  const year = date.getFullYear();
  if (year < 1 || year > 9999) throw new RangeError(message('Year must be between 1 and 9999', 'Рік має бути від 1 до 9999'));
  return `${String(year).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Use local noon so calendar arithmetic does not drift over DST boundaries. */
export function parseDate(key) {
  const match = typeof key === 'string' && DATE_KEY.exec(key);
  if (!match) throw new RangeError(message('Expected a date in YYYY-MM-DD format', 'Вкажіть дату у форматі РРРР-ММ-ДД'));
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  // setFullYear also handles years 0001–0099 without Date's 1900 offset.
  date.setFullYear(year, month - 1, day);
  if (year < 1 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new RangeError(message('This date does not exist', 'Такої дати не існує'));
  }
  return date;
}

export function shiftDate(key, days) {
  if (!Number.isSafeInteger(days)) throw new RangeError(message('Offset must be a whole number of days', 'Зсув має бути цілим числом днів'));
  const date = parseDate(key);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

/** The inclusive rolling window: end date and the six preceding dates. */
export function rollingDates(endKey) {
  return Array.from({ length: 7 }, (_, index) => shiftDate(endKey, index - 6));
}

function requireMinutes(minutes) {
  if (!Number.isSafeInteger(minutes) || minutes < 0) {
    throw new RangeError(message('Duration must be a nonnegative whole number of minutes', 'Тривалість має бути цілим невід’ємним числом хвилин'));
  }
  return minutes;
}

export function sumMinutes(entries, dates) {
  return dates.reduce((total, key) => {
    const minutes = entries[key] == null ? 0 : requireMinutes(entries[key].minutes);
    return requireMinutes(total + minutes);
  }, 0);
}

export function formatDuration(minutes) {
  requireMinutes(minutes);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const hourUnit = dateLocale === 'uk' ? ' год' : 'h';
  const minuteUnit = dateLocale === 'uk' ? ' хв' : 'm';
  if (!remainder) return `${hours}${hourUnit}`;
  if (!hours) return `${remainder}${minuteUnit}`;
  return `${hours}${hourUnit} ${remainder}${minuteUnit}`;
}

export function formatRange(startKey, endKey) {
  const start = parseDate(startKey);
  const end = parseDate(endKey);
  if (startKey > endKey) throw new RangeError(message('The start date must not be after the end date', 'Початок періоду має бути не пізніше його кінця'));
  const monthNames = MONTHS[dateLocale];
  const label = date => dateLocale === 'en'
    ? `${monthNames[date.getMonth()]} ${date.getDate()}`
    : `${date.getDate()} ${monthNames[date.getMonth()]}`;
  const startLabel = label(start);
  const endLabel = label(end);
  if (start.getFullYear() !== end.getFullYear()) {
    const separator = dateLocale === 'en' ? ', ' : ' ';
    return `${startLabel}${separator}${start.getFullYear()} — ${endLabel}${separator}${end.getFullYear()}`;
  }
  if (startKey === endKey) return startLabel;
  if (start.getMonth() === end.getMonth()) {
    return dateLocale === 'en' ? `${startLabel}–${end.getDate()}` : `${start.getDate()}–${endLabel}`;
  }
  return `${startLabel} — ${endLabel}`;
}
