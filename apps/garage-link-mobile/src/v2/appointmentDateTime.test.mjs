import assert from 'node:assert/strict';
import test from 'node:test';
import { appointmentSubMinute, formatJstAppointmentDateTime, parseJstAppointmentDateTime, restoreAppointmentSubMinute } from './appointmentDateTime.ts';

test('formats and parses the appointment using Japan local time without changing the instant', () => {
  const savedUtc = '2026-09-26T17:00:00+00:00';
  const input = formatJstAppointmentDateTime(savedUtc);

  assert.equal(input, '2026/09/27 02:00');
  assert.equal(parseJstAppointmentDateTime(input), '2026-09-26T17:00:00.000Z');
});

test('rejects invalid local dates instead of silently shifting them', () => {
  assert.equal(parseJstAppointmentDateTime('2026/02/30 10:00'), null);
  assert.equal(parseJstAppointmentDateTime('2026/09/27 25:00'), null);
});

test('keeps seconds and milliseconds hidden from the normal input and restores them on save', () => {
  const savedUtc = '2026-09-26T17:00:42.125Z';
  const input = formatJstAppointmentDateTime(savedUtc);
  const parsed = parseJstAppointmentDateTime(input);

  assert.equal(input, '2026/09/27 02:00');
  assert.equal(appointmentSubMinute(savedUtc), '42.125');
  assert.equal(restoreAppointmentSubMinute(parsed, appointmentSubMinute(savedUtc)), savedUtc);
});
