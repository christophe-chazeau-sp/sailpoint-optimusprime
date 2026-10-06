/**
 * Date helpers for the dateFormat, dateCompare and dateMath transforms.
 * Java SimpleDateFormat patterns are supported for the common letters; all times are UTC.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const WIN32_EPOCH_OFFSET_MS = 11644473600000;

const NAMED_FORMATS: Record<string, string> = {
  LDAP: "yyyyMMddHHmmss'Z'",
  PEOPLE_SOFT: 'MM/dd/yyyy',
};

export class DateError extends Error {}

export function parseDate(text: string, format = 'ISO8601'): Date {
  const value = text.trim();
  switch (format) {
    case 'ISO8601':
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
        throw new DateError(`"${text}" is not in the ISO8601 form yyyy-MM-ddTHH:mm:ss.SSSZ.`);
      }
      return parseIso(value);
    case 'EPOCH_TIME_JAVA':
      return fromNumber(value, (n) => n);
    case 'EPOCH_TIME_WIN32':
      return fromNumber(value, (n) => n / 10000 - WIN32_EPOCH_OFFSET_MS);
    case 'LDAP':
      return parseLdap(value);
    default:
      return parsePattern(value, NAMED_FORMATS[format] ?? format);
  }
}

export function formatDate(date: Date, format = 'ISO8601'): string {
  switch (format) {
    case 'ISO8601':
      return formatPattern(date, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
    case 'EPOCH_TIME_JAVA':
      return String(date.getTime());
    case 'EPOCH_TIME_WIN32':
      return String((date.getTime() + WIN32_EPOCH_OFFSET_MS) * 10000);
    default:
      return formatPattern(date, NAMED_FORMATS[format] ?? format);
  }
}

/** Java's ZonedDateTime.toString in UTC: seconds and milliseconds appear only when they are not zero. */
export function javaIsoString(date: Date): string {
  const seconds = date.getUTCSeconds();
  const millis = date.getUTCMilliseconds();
  let text = formatPattern(date, "yyyy-MM-dd'T'HH:mm");
  if (seconds || millis) text += `:${pad(seconds, 2)}`;
  if (millis) text += `.${pad(millis, 3)}`;
  return `${text}Z`;
}

/** Accepts ISO 8601 strings, with or without time and zone, and the keyword "now". */
export function parseIso(text: string, now = new Date()): Date {
  if (text.toLowerCase() === 'now') {
    return now;
  }
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const noZone = /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text);
  const normalised = dateOnly ? `${text}T00:00:00Z` : noZone ? `${text}Z` : text;
  const time = Date.parse(normalised);
  if (Number.isNaN(time)) {
    throw new DateError(`"${text}" is not an ISO 8601 date.`);
  }
  return new Date(time);
}

function parseLdap(text: string): Date {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z?$/.exec(text);
  if (!match) {
    throw new DateError(`"${text}" is not an LDAP generalized time.`);
  }
  const [, y, mo, d, h, mi, s] = match.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
}

function fromNumber(text: string, toMillis: (value: number) => number): Date {
  const value = Number(text);
  if (!Number.isFinite(value)) {
    throw new DateError(`"${text}" is not a number.`);
  }
  return new Date(toMillis(value));
}

interface Token {
  letter: string;
  count: number;
  literal?: string;
}

function tokenize(pattern: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < pattern.length) {
    const char = pattern[index];
    if (char === "'") {
      const close = pattern.indexOf("'", index + 1);
      const end = close === -1 ? pattern.length : close;
      const text = pattern.slice(index + 1, end);
      tokens.push({ letter: '', count: 0, literal: text === '' ? "'" : text });
      index = end + 1;
    } else if (/[A-Za-z]/.test(char)) {
      let count = 1;
      while (pattern[index + count] === char) {
        count++;
      }
      tokens.push({ letter: char, count });
      index += count;
    } else {
      tokens.push({ letter: '', count: 0, literal: char });
      index++;
    }
  }
  return tokens;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function formatPattern(date: Date, pattern: string): string {
  return tokenize(pattern)
    .map((token) => {
      if (token.literal !== undefined) {
        return token.literal;
      }
      const { letter, count } = token;
      const hours = date.getUTCHours();
      switch (letter) {
        case 'y':
          return count === 2 ? pad(date.getUTCFullYear() % 100, 2) : pad(date.getUTCFullYear(), count);
        case 'M':
          if (count >= 4) return MONTHS[date.getUTCMonth()];
          if (count === 3) return MONTHS[date.getUTCMonth()].slice(0, 3);
          return pad(date.getUTCMonth() + 1, count);
        case 'd':
          return pad(date.getUTCDate(), count);
        case 'H':
          return pad(hours, count);
        case 'h':
          return pad(hours % 12 || 12, count);
        case 'm':
          return pad(date.getUTCMinutes(), count);
        case 's':
          return pad(date.getUTCSeconds(), count);
        case 'S':
          return pad(date.getUTCMilliseconds(), 3).slice(0, Math.max(count, 1)).padEnd(count, '0');
        case 'a':
          return hours < 12 ? 'AM' : 'PM';
        case 'E':
          return count >= 4 ? DAYS[date.getUTCDay()] : DAYS[date.getUTCDay()].slice(0, 3);
        case 'Z':
          return '+0000';
        case 'X':
          return 'Z';
        case 'z':
          return 'GMT';
        default:
          throw new DateError(`The date pattern letter "${letter}" is not supported.`);
      }
    })
    .join('');
}

export function parsePattern(text: string, pattern: string): Date {
  const fields: ((value: string, parts: DateParts) => void)[] = [];
  const source = tokenize(pattern)
    .map((token) => {
      if (token.literal !== undefined) {
        return token.literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      const { letter, count } = token;
      const numeric = (apply: (parts: DateParts, value: number) => void, width?: number) => {
        fields.push((value, parts) => apply(parts, Number(value)));
        return width ? `(\\d{${width}})` : count > 1 ? `(\\d{${count},})` : '(\\d+)';
      };
      switch (letter) {
        case 'y':
          return numeric((parts, value) => {
            parts.year = count === 2 ? 2000 + value - (value > 50 ? 100 : 0) : value;
          }, count === 2 ? 2 : undefined);
        case 'M':
          if (count >= 3) {
            fields.push((value, parts) => {
              const index = MONTHS.findIndex((month) =>
                month.toLowerCase().startsWith(value.toLowerCase()),
              );
              parts.month = index;
            });
            return '([A-Za-z]+)';
          }
          return numeric((parts, value) => (parts.month = value - 1), count === 2 ? 2 : undefined);
        case 'd':
          return numeric((parts, value) => (parts.day = value), count === 2 ? 2 : undefined);
        case 'H':
        case 'h':
          return numeric((parts, value) => (parts.hour = value), count === 2 ? 2 : undefined);
        case 'm':
          return numeric((parts, value) => (parts.minute = value), count === 2 ? 2 : undefined);
        case 's':
          return numeric((parts, value) => (parts.second = value), count === 2 ? 2 : undefined);
        case 'S':
          return numeric((parts, value) => (parts.millis = value));
        case 'a':
          fields.push((value, parts) => (parts.pm = value.toUpperCase() === 'PM'));
          return '(AM|PM|am|pm)';
        case 'E':
          fields.push(() => undefined);
          return '([A-Za-z]+)';
        case 'Z':
        case 'X':
        case 'z':
          fields.push(() => undefined);
          return '(Z|UTC|GMT|[+-]\\d{2}:?\\d{2})?';
        default:
          throw new DateError(`The date pattern letter "${letter}" is not supported.`);
      }
    })
    .join('');

  const match = new RegExp(`^${source}$`).exec(text);
  if (!match) {
    throw new DateError(`"${text}" does not match the date format "${pattern}".`);
  }
  const parts: DateParts = { year: 1970, month: 0, day: 1, hour: 0, minute: 0, second: 0, millis: 0 };
  fields.forEach((apply, index) => apply(match[index + 1] ?? '', parts));
  if (parts.pm !== undefined) {
    parts.hour = (parts.hour % 12) + (parts.pm ? 12 : 0);
  }
  return new Date(
    Date.UTC(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second, parts.millis),
  );
}

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millis: number;
  pm?: boolean;
}

/**
 * Applies a dateMath expression such as "now+1w", "+3M/d" or "-5d/h".
 * Rounding ("/unit") goes down to the start of the unit, or up to the start of the next one when roundUp is true.
 */
export function applyDateMath(base: Date | null, expression: string, roundUp: boolean, now: Date): Date {
  let rest = expression.trim();
  let date: Date;
  if (rest.startsWith('now')) {
    date = new Date(now);
    rest = rest.slice(3);
  } else if (base) {
    date = new Date(base);
  } else {
    throw new DateError('dateMath needs an input date unless the expression starts with "now".');
  }

  const pattern = /^([+-]\d+[yMwdhms])|^\/([yMwdhms])/;
  while (rest.length > 0) {
    const match = pattern.exec(rest);
    if (!match) {
      throw new DateError(`"${expression}" is not a valid dateMath expression.`);
    }
    if (match[1]) {
      const sign = match[1][0] === '-' ? -1 : 1;
      const amount = Number(match[1].slice(1, -1)) * sign;
      date = shift(date, match[1].slice(-1), amount);
    } else {
      date = round(date, match[2], roundUp);
    }
    rest = rest.slice(match[0].length);
  }
  return date;
}

function shift(date: Date, unit: string, amount: number): Date {
  const next = new Date(date);
  switch (unit) {
    case 'y':
      return addMonths(date, amount * 12);
    case 'M':
      return addMonths(date, amount);
    case 'w':
      next.setUTCDate(next.getUTCDate() + amount * 7);
      break;
    case 'd':
      next.setUTCDate(next.getUTCDate() + amount);
      break;
    case 'h':
      next.setUTCHours(next.getUTCHours() + amount);
      break;
    case 'm':
      next.setUTCMinutes(next.getUTCMinutes() + amount);
      break;
    case 's':
      next.setUTCSeconds(next.getUTCSeconds() + amount);
      break;
  }
  return next;
}

/** Like Java's plusMonths: Jan 31 + 1 month is the last day of February, not early March. */
function addMonths(date: Date, amount: number): Date {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + amount);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

function round(date: Date, unit: string, up: boolean): Date {
  const y = date.getUTCFullYear();
  const mo = date.getUTCMonth();
  const d = date.getUTCDate();
  const h = date.getUTCHours();
  const mi = date.getUTCMinutes();
  const s = date.getUTCSeconds();
  let start: Date;
  let next: Date;
  switch (unit) {
    case 'y':
      start = new Date(Date.UTC(y, 0, 1));
      next = new Date(Date.UTC(y + 1, 0, 1));
      break;
    case 'M':
      start = new Date(Date.UTC(y, mo, 1));
      next = new Date(Date.UTC(y, mo + 1, 1));
      break;
    case 'w': {
      const monday = d - ((date.getUTCDay() + 6) % 7);
      start = new Date(Date.UTC(y, mo, monday));
      next = new Date(Date.UTC(y, mo, monday + 7));
      break;
    }
    case 'd':
      start = new Date(Date.UTC(y, mo, d));
      next = new Date(Date.UTC(y, mo, d + 1));
      break;
    case 'h':
      start = new Date(Date.UTC(y, mo, d, h));
      next = new Date(Date.UTC(y, mo, d, h + 1));
      break;
    case 'm':
      start = new Date(Date.UTC(y, mo, d, h, mi));
      next = new Date(Date.UTC(y, mo, d, h, mi + 1));
      break;
    default:
      start = new Date(Date.UTC(y, mo, d, h, mi, s));
      next = new Date(Date.UTC(y, mo, d, h, mi, s + 1));
  }
  return up ? next : start;
}
