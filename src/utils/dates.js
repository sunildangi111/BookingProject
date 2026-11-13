const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const CLOCK_PATTERN = /^(\d{2}):(\d{2})$/;

function normalizeLocalDateTime(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(LOCAL_DATE_TIME_PATTERN);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, rawSecond] = match;
  const second = rawSecond || '00';
  const canonical = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const parsed = new Date(`${canonical}Z`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (parsed.toISOString().slice(0, 19) !== canonical) {
    return null;
  }

  return canonical;
}

function localDateTimeToMs(value) {
  const normalized = normalizeLocalDateTime(value);
  return normalized ? Date.parse(`${normalized}Z`) : Number.NaN;
}

function addMinutesLocal(value, minutes) {
  const timestamp = localDateTimeToMs(value);
  if (!Number.isFinite(timestamp) || !Number.isFinite(minutes)) {
    return null;
  }

  return new Date(timestamp + minutes * 60_000).toISOString().slice(0, 19);
}

function clockToMinutes(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(CLOCK_PATTERN);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function clockMinutesFromLocalDateTime(value) {
  const normalized = normalizeLocalDateTime(value);
  if (!normalized) {
    return null;
  }

  return Number(normalized.slice(11, 13)) * 60 + Number(normalized.slice(14, 16));
}

function isWithinServiceHours(localDateTime, serviceFrom, serviceUntil) {
  const current = clockMinutesFromLocalDateTime(localDateTime);
  const start = clockToMinutes(serviceFrom);
  const end = clockToMinutes(serviceUntil);

  if (current === null || start === null || end === null) {
    return false;
  }

  if (start <= end) {
    return current >= start && current <= end;
  }

  return current >= start || current <= end;
}

function intervalsOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  const firstStartMs = localDateTimeToMs(firstStart);
  const firstEndMs = localDateTimeToMs(firstEnd);
  const secondStartMs = localDateTimeToMs(secondStart);
  const secondEndMs = localDateTimeToMs(secondEnd);

  if (![firstStartMs, firstEndMs, secondStartMs, secondEndMs].every(Number.isFinite)) {
    return false;
  }

  return firstStartMs < secondEndMs && secondStartMs < firstEndMs;
}

function isAtOrAfter(value, boundary) {
  const valueMs = localDateTimeToMs(value);
  const boundaryMs = localDateTimeToMs(boundary);
  return Number.isFinite(valueMs) && Number.isFinite(boundaryMs) && valueMs >= boundaryMs;
}

module.exports = {
  normalizeLocalDateTime,
  localDateTimeToMs,
  addMinutesLocal,
  clockToMinutes,
  clockMinutesFromLocalDateTime,
  isWithinServiceHours,
  intervalsOverlap,
  isAtOrAfter
};
