/**
 * Pure time helpers for time-series layers.
 *
 * All calculations are done in UTC. The map may display local times, but the
 * window boundaries sent to a SensorThings server must be unambiguous.
 */

/**
 * @typedef {'second'|'minute'|'hour'|'day'|'week'|'month'|'year'} DurationUnit
 * @typedef {{unit: DurationUnit, count: number}} Duration
 * @typedef {{start: Date, end: Date}} TimeWindow
 */

/** @type {Record<string, DurationUnit>} */
const WORD_ALIASES = {
    second: 'second',
    minute: 'minute',
    hour: 'hour',
    day: 'day',
    week: 'week',
    month: 'month',
    year: 'year'
};

/** @type {Record<string, DurationUnit>} */
const DATE_DESIGNATORS = {Y: 'year', M: 'month', W: 'week', D: 'day'};

/** @type {Record<string, DurationUnit>} */
const TIME_DESIGNATORS = {H: 'hour', M: 'minute', S: 'second'};

const ISO_PATTERN = /^P(?:(\d+)([YMWD])|T(\d+)([HMS]))$/;

/**
 * Parse a single-unit ISO 8601 duration or one of the word aliases.
 *
 * `PT1M` is a minute, `P1M` is a month - the `T` is what tells them apart.
 * Compound durations (`P1DT2H`) are not time series buckets and are rejected.
 *
 * @param {string} duration
 * @return {Duration}
 */
export function parseDuration(duration) {
    if (WORD_ALIASES[duration] !== undefined) {
        return {unit: WORD_ALIASES[duration], count: 1};
    }

    const match = ISO_PATTERN.exec(duration);
    if (match === null) {
        throw new Error(`Invalid time series granularity "${duration}". ` +
            'Expected a single-unit ISO 8601 duration such as PT10M, PT1H, P1D, P1W, P1M or P1Y.');
    }

    const [, dateCount, dateDesignator, timeCount, timeDesignator] = match;
    const count = parseInt(dateCount ?? timeCount, 10);
    if (count < 1) {
        throw new Error(`Invalid time series granularity "${duration}". The multiple must be at least 1.`);
    }
    const unit = dateDesignator !== undefined
        ? DATE_DESIGNATORS[dateDesignator]
        : TIME_DESIGNATORS[timeDesignator];

    return {unit, count};
}

/**
 * How many units of `unit` fit into its containing parent unit, or `undefined`
 * where the parent has no fixed size (days per month) or no parent at all.
 *
 * @param {DurationUnit} unit
 * @return {number|undefined}
 */
function parentSize(unit) {
    switch (unit) {
        case 'second': return 60;
        case 'minute': return 60;
        case 'hour': return 24;
        case 'month': return 12;
        default: return undefined;
    }
}

/**
 * Whether the multiple tiles its parent unit evenly. `PT10M` does (six buckets
 * per hour), `PT7M` does not - the last bucket of every hour is then short.
 * The layer still works; the config author just needs to know.
 *
 * @param {Duration} duration
 * @return {boolean}
 */
export function dividesEvenly({unit, count}) {
    if (count === 1) {
        return true;
    }
    const size = parentSize(unit);
    if (size !== undefined) {
        return size % count === 0;
    }
    // days and weeks have no fixed-size parent, years have no parent at all
    return unit === 'year';
}

/**
 * Milliseconds in a day, used for the fixed-length units only.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Monday 00:00 UTC of the ISO week containing `date`.
 *
 * @param {Date} date
 * @return {number} epoch milliseconds
 */
function isoWeekStart(date) {
    const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    // getUTCDay() is 0 for Sunday; ISO weeks start on Monday
    const weekday = (new Date(midnight).getUTCDay() + 6) % 7;
    return midnight - weekday * DAY_MS;
}

/**
 * Floor `instant` to the start of the bucket it falls into, then return that
 * bucket's half-open window.
 *
 * Buckets are anchored to the start of the containing parent unit and stepped
 * by the multiple: `PT10M` buckets at :00, :10, :20 within the hour, `PT6H` at
 * 00/06/12/18 within the day, `P<n>M` from January, `P1W` to the ISO week.
 *
 * @param {Date} instant
 * @param {Duration} duration
 * @return {TimeWindow}
 */
export function timeWindow(instant, {unit, count}) {
    const y = instant.getUTCFullYear();
    const mo = instant.getUTCMonth();
    const d = instant.getUTCDate();
    const h = instant.getUTCHours();
    const mi = instant.getUTCMinutes();
    const s = instant.getUTCSeconds();

    /** @type {number} */
    let start;
    /** @type {number} */
    let end;

    switch (unit) {
        case 'second':
            start = Date.UTC(y, mo, d, h, mi, s - (s % count));
            end = start + count * 1000;
            break;
        case 'minute':
            start = Date.UTC(y, mo, d, h, mi - (mi % count));
            end = start + count * 60 * 1000;
            break;
        case 'hour':
            start = Date.UTC(y, mo, d, h - (h % count));
            end = start + count * 60 * 60 * 1000;
            break;
        case 'day': {
            // day of month is 1-based, so shift to a 0-based index before flooring
            const dayIndex = d - 1;
            start = Date.UTC(y, mo, dayIndex - (dayIndex % count) + 1);
            end = start + count * DAY_MS;
            break;
        }
        case 'week': {
            const weekStart = isoWeekStart(instant);
            if (count === 1) {
                start = weekStart;
            } else {
                // step from the first ISO week that starts in the containing year
                const yearAnchor = isoWeekStart(new Date(Date.UTC(y, 0, 1)));
                const weekIndex = Math.round((weekStart - yearAnchor) / (7 * DAY_MS));
                start = yearAnchor + (weekIndex - (weekIndex % count)) * 7 * DAY_MS;
            }
            end = start + count * 7 * DAY_MS;
            break;
        }
        case 'month':
            start = Date.UTC(y, mo - (mo % count), 1);
            end = Date.UTC(y, mo - (mo % count) + count, 1);
            break;
        case 'year': {
            const flooredYear = y - (y % count);
            start = Date.UTC(flooredYear, 0, 1);
            end = Date.UTC(flooredYear + count, 0, 1);
            break;
        }
        default:
            throw new Error(`Unknown time series unit "${unit}".`);
    }

    return {start: new Date(start), end: new Date(end)};
}

/**
 * The finest field a granularity actually addresses. Drives which picker
 * controls the dialog shows.
 *
 * @param {DurationUnit} unit
 * @return {boolean}
 */
export function needsTimeOfDay(unit) {
    return unit === 'second' || unit === 'minute' || unit === 'hour';
}

/**
 * Parse a SensorThings temporal extent. A datastream reports its coverage as
 * an ISO 8601 interval `start/end`; one holding a single observation may
 * report a bare instant instead, and one that never reported omits it
 * altogether.
 *
 * @param {unknown} value
 * @return {TimeWindow|undefined}
 */
export function parseInterval(value) {
    if (typeof value !== 'string' || value === '') {
        return undefined;
    }
    const [startPart, endPart] = value.split('/');
    const start = new Date(startPart);
    if (isNaN(start.getTime())) {
        return undefined;
    }
    if (endPart === undefined) {
        return {start, end: start};
    }
    const end = new Date(endPart);
    return {start, end: isNaN(end.getTime()) ? start : end};
}

function pad(value, length = 2) {
    return String(value).padStart(length, '0');
}

/**
 * Format as ISO 8601 basic (no separators, no colons).
 *
 * Colons cannot survive the permalink object encoding - `parseObject()` in
 * `permalink/util.js` splits every entry on `:`, so `2026-08-20T00:00:00Z`
 * would be truncated to `2026-08-20T00`.
 *
 * @param {Date} date
 * @return {string} e.g. `20260820T0000Z`
 */
export function toCompactIso(date) {
    const base = `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
        `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;
    const seconds = date.getUTCSeconds();
    return seconds === 0 ? `${base}Z` : `${base}${pad(seconds)}Z`;
}

const COMPACT_ISO_PATTERN = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?Z$/;

/**
 * Inverse of {@link toCompactIso}.
 *
 * @param {string} value
 * @return {Date|undefined} `undefined` when `value` is not a compact ISO timestamp
 */
export function fromCompactIso(value) {
    const match = COMPACT_ISO_PATTERN.exec(value);
    if (match === null) {
        return undefined;
    }
    const [, year, month, day, hours, minutes, seconds] = match;
    return new Date(Date.UTC(
        Number(year), Number(month) - 1, Number(day),
        Number(hours), Number(minutes), Number(seconds ?? 0)
    ));
}

/**
 * Format a full ISO 8601 extended timestamp for the SensorThings `$filter`.
 *
 * @param {Date} date
 * @return {string} e.g. `2026-08-20T00:00:00Z`
 */
export function toStaTimestamp(date) {
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Resolve a configured `default` into an instant.
 *
 * Accepts `latest` (no time filter at all, signalled by `undefined`), `now`,
 * a full ISO timestamp, or a relative offset such as `-1h` / `-30m` / `-7d`.
 *
 * @param {string|undefined} value
 * @param {Date} [now]
 * @return {Date|undefined}
 */
export function resolveConfiguredTime(value, now = new Date()) {
    if (value === undefined || value === 'latest') {
        return undefined;
    }
    if (value === 'now') {
        return now;
    }

    const relative = /^([+-])(\d+)([smhdw])$/.exec(value);
    if (relative !== null) {
        const [, sign, amount, unit] = relative;
        const factor = {s: 1000, m: 60000, h: 3600000, d: DAY_MS, w: 7 * DAY_MS}[unit];
        const offset = Number(amount) * factor * (sign === '-' ? -1 : 1);
        return new Date(now.getTime() + offset);
    }

    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) {
        throw new Error(`Invalid time series time "${value}". ` +
            'Expected "latest", "now", an ISO timestamp, or a relative offset such as "-1h".');
    }
    return parsed;
}
