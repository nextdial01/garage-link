const jstDateTimeParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function dateTimeParts(date: Date) {
  return Object.fromEntries(jstDateTimeParts.formatToParts(date).map(({ type, value }) => [type, value]));
}

export function formatJstAppointmentDateTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const parts = dateTimeParts(date);
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

export function parseJstAppointmentDateTime(value: string) {
  const input = value.trim();
  if (!input) return null;

  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(input)) {
    const date = new Date(input);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(input);
  if (!match) return null;

  const [, year, month, day, hour, minute, second = '0', millisecond = '0'] = match;
  const [yearNumber, monthNumber, dayNumber, hourNumber, minuteNumber, secondNumber] = [year, month, day, hour, minute, second].map(Number);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31 || hourNumber > 23 || minuteNumber > 59 || secondNumber > 59) return null;

  const localDate = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber, hourNumber - 9, minuteNumber, secondNumber, Number(millisecond.padEnd(3, '0'))));
  const parts = dateTimeParts(localDate);
  if (
    Number(parts.year) !== yearNumber || Number(parts.month) !== monthNumber || Number(parts.day) !== dayNumber ||
    Number(parts.hour) !== hourNumber || Number(parts.minute) !== minuteNumber
  ) return null;

  return localDate.toISOString();
}

export function appointmentSubMinute(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${String(date.getUTCSeconds()).padStart(2, '0')}.${String(date.getUTCMilliseconds()).padStart(3, '0')}`;
}

export function restoreAppointmentSubMinute(value: string, subMinute: string) {
  const match = /^(\d{2})\.(\d{3})$/.exec(subMinute);
  const date = new Date(value);
  if (!match || !Number.isFinite(date.getTime())) return value;
  date.setUTCSeconds(Number(match[1]), Number(match[2]));
  return date.toISOString();
}
