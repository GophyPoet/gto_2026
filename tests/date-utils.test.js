/* eslint-disable no-console */
/**
 * tests/date-utils.test.js — Node-runnable sanity checks for the shared
 * date-only utility (GTO_App/scripts/core/date-utils.js).
 *
 * The module is written as a browser IIFE that attaches to `window`.
 * We shim a minimal window object, evaluate the source, and then drive
 * the exported functions through a set of assertions that cover the bugs
 * the module was introduced to fix (-1 day shift under positive-offset
 * timezones, Excel serial handling, DD.MM.YYYY and M/D/YYYY input parsing,
 * age arithmetic, and the round-trip ISO ↔ display flow).
 *
 * Run:
 *   node tests/date-utils.test.js
 *
 * Exits with non-zero status when any assertion fails.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'GTO_App', 'scripts', 'core', 'date-utils.js');

/* Force a positive-offset "local time" via the TZ env var.  Russia/Moscow
   is UTC+3 year-round and deterministically reproduces the original bug. */
if (!process.env.TZ || process.env.TZ !== 'Europe/Moscow') {
  process.env.TZ = 'Europe/Moscow';
}

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: 'date-utils.js' });

const U = sandbox.window.GTODateUtils;
if (!U) {
  console.error('GTODateUtils was not attached to window');
  process.exit(1);
}

let passed = 0;
let failed = 0;
function assertEq(actual, expected, label) {
  if (actual === expected) {
    passed += 1;
    console.log('  ok  ' + label);
  } else {
    failed += 1;
    console.log('  FAIL ' + label + '\n       expected: ' + JSON.stringify(expected) + '\n       actual:   ' + JSON.stringify(actual));
  }
}
function assertTrue(v, label) { assertEq(!!v, true, label); }

/* ====== 1. The core regression: 23.04.2010 must not become 22.04.2010 ====== */
console.log('1. DATE-ONLY preservation under positive-offset TZ (' + process.env.TZ + ')');
{
  /* Russian-style DD.MM.YYYY */
  assertEq(U.toISODate('23.04.2010'), '2010-04-23', 'DD.MM.YYYY → ISO');
  assertEq(U.toDisplayDate('23.04.2010'), '23.04.2010', 'DD.MM.YYYY → display round-trip');

  /* ISO plain */
  assertEq(U.toISODate('2010-04-23'), '2010-04-23', 'ISO plain date kept as-is');
  assertEq(U.toDisplayDate('2010-04-23'), '23.04.2010', 'ISO → display');

  /* Full ISO timestamp (legacy .toISOString() output) */
  assertEq(U.toISODate('2010-04-23T00:00:00.000Z'), '2010-04-23', 'ISO timestamp → ISO date (no shift)');
  assertEq(U.toDisplayDate('2010-04-23T00:00:00.000Z'), '23.04.2010', 'ISO timestamp → display (no shift)');

  /* Date object at local midnight — the shape xlsx produces with cellDates:true */
  const localMidnight = new Date(2010, 3, 23, 0, 0, 0, 0);
  assertEq(U.toISODate(localMidnight), '2010-04-23', 'local midnight Date → ISO (LOCAL components)');
  assertEq(U.toDisplayDate(localMidnight), '23.04.2010', 'local midnight Date → display');
}

/* ====== 2. Excel serial numbers ====== */
console.log('2. Excel serials');
{
  /* 40291 = 23.04.2010 in Excel */
  assertEq(U.excelSerialToISO(40291), '2010-04-23', 'serial 40291 → 2010-04-23');
  assertEq(U.toISODate(40291), '2010-04-23', 'toISODate(serial number)');
  assertEq(U.toISODate('40291'), '2010-04-23', 'toISODate(numeric string)');
  /* 1 Jan 2000 = 36526 */
  assertEq(U.excelSerialToISO(36526), '2000-01-01', 'serial 36526 → 2000-01-01');
}

/* ====== 3. American M/D/YYYY fallback ====== */
console.log('3. American M/D/YYYY fallback');
{
  assertEq(U.toISODate('4/23/2010'), '2010-04-23', 'M/D/YYYY → ISO');
  assertEq(U.toISODate('04/23/10'), '2010-04-23', 'MM/DD/YY → ISO (two-digit year < 50 → 2000+)');
  assertEq(U.toISODate('4/23/99'), '1999-04-23', 'M/D/YY (two-digit year > 50 → 1900+)');
}

/* ====== 4. Display round-trip ====== */
console.log('4. Display round-trip');
{
  assertEq(U.toDisplayDate(U.toISODate('01.01.2000')), '01.01.2000', 'DD.MM.YYYY → ISO → display');
  assertEq(U.toDisplayDate(U.toISODate('31.12.1999')), '31.12.1999', 'edge-of-year round-trip');
  assertEq(U.toDisplayDate(''), '', 'empty string stays empty');
  assertEq(U.toDisplayDate(null), '', 'null stays empty');
  assertEq(U.toDisplayDate(undefined), '', 'undefined stays empty');
}

/* ====== 5. isoToLocalDate & calcAge ====== */
console.log('5. Age arithmetic');
{
  assertEq(U.calcAge('2010-04-23', '2026-04-08'), 15, '15y between birthday not yet passed');
  assertEq(U.calcAge('2010-04-23', '2026-04-23'), 16, 'exact birthday → next age');
  assertEq(U.calcAge('2010-04-23', '2026-04-24'), 16, 'day after birthday → next age');
  assertEq(U.calcAge('2010-12-31', '2026-01-01'), 15, 'year boundary');
  assertEq(U.calcAge('', '2026-04-08'), null, 'empty birth → null');
  assertEq(U.calcAge('2010-04-23', ''), null, 'empty event → null');
}

/* ====== 6. isValidISODate ====== */
console.log('6. isValidISODate');
{
  assertTrue(U.isValidISODate('2010-04-23'), 'valid date');
  assertEq(U.isValidISODate('2010-13-01'), false, 'month 13 rejected');
  assertEq(U.isValidISODate('2010-02-30'), false, '30 Feb rejected');
  assertEq(U.isValidISODate('23.04.2010'), false, 'wrong format rejected');
  assertEq(U.isValidISODate(''), false, 'empty string rejected');
  assertEq(U.isValidISODate(null), false, 'null rejected');
}

/* ====== 7. Garbage input → empty, never throws ====== */
console.log('7. Garbage input handling');
{
  assertEq(U.toISODate('not a date'), '', 'garbage → empty');
  assertEq(U.toISODate({}), '', 'object → empty');
  assertEq(U.toISODate([]), '', 'array → empty');
  assertEq(U.toISODate(NaN), '', 'NaN → empty');
  assertEq(U.toDisplayDate('not a date'), '', 'garbage → empty display');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
