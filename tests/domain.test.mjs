import test from 'node:test';
import assert from 'node:assert/strict';
import { todayISO, addDays, escapeHTML, assertLendable } from '../domain.js';

test('dates use local calendar, including month/year/leap-day and DST boundaries', () => {
  assert.equal(todayISO(new Date(2026, 8, 21, 23, 50)), '2026-09-21');
  assert.equal(addDays('2024-02-20', 14), '2024-03-05');
  assert.equal(addDays('2026-12-24', 14), '2027-01-07');
  assert.equal(addDays('2026-03-01', 14), '2026-03-15');
  assert.equal(addDays('2026-10-25', 14), '2026-11-08');
});
test('inactive, inconsistent, duplicate, empty, and over-limit loans are rejected', () => {
  const student = { active: true, activeLoanIds: ['existing'] };
  assert.doesNotThrow(() => assertLendable(student, ['a', 'b']));
  assert.throws(() => assertLendable(student, ['a', 'b', 'c']));
  assert.throws(() => assertLendable(student, ['a', 'a']));
  assert.throws(() => assertLendable(student, []));
  assert.throws(() => assertLendable({ ...student, active: false }, ['a']));
  assert.throws(() => assertLendable({ active: true }, ['a']));
});
test('Firestore text is escaped for both HTML content and attributes', () => {
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">\'&'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;');
});
