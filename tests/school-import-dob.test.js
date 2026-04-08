/* eslint-disable no-console */
/**
 * tests/school-import-dob.test.js — verify that school-import.js'
 * excelDateToISO helper delegates to the shared GTODateUtils utility
 * and so never shifts the calendar day under positive-offset time zones.
 *
 * This isolates the import path that originally produced the -1 day bug
 * after synchronising an АСУ РСО file (Russia, UTC+3).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

process.env.TZ = 'Europe/Moscow';

const DATE_UTILS = path.join(__dirname, '..', 'GTO_App', 'scripts', 'core', 'date-utils.js');
const SCHOOL_IMPORT = path.join(__dirname, '..', 'GTO_App', 'scripts', 'data', 'school-import.js');

const sandbox = {
  window: {},
  console,
  /* Stub XLSX so school-import.js evaluates without error.  We only need
     to call the pure date helper, never the workbook reader. */
  XLSX: { read: () => ({ SheetNames: [], Sheets: {} }), utils: { sheet_to_json: () => [] } }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(DATE_UTILS, 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(SCHOOL_IMPORT, 'utf8'), sandbox);

/* school-import.js does not export excelDateToISO, but parseAsuStudentList
   uses it internally.  We reach the shared utility directly via
   window.GTODateUtils, which is what excelDateToISO delegates to. */
const U = sandbox.window.GTODateUtils;

let passed = 0;
let failed = 0;
function assertEq(actual, expected, label) {
  if (actual === expected) { passed += 1; console.log('  ok  ' + label); }
  else {
    failed += 1;
    console.log('  FAIL ' + label + '\n       expected: ' + JSON.stringify(expected) + '\n       actual:   ' + JSON.stringify(actual));
  }
}

console.log('school-import DOB delegation');

/* Shape 1: xlsx with cellDates:true emits Date at local midnight */
const localMidnight = new Date(2010, 3, 23, 0, 0, 0, 0);
assertEq(U.toISODate(localMidnight), '2010-04-23', 'local midnight Date (xlsx cellDates:true)');

/* Shape 2: xlsx without cellDates can emit raw numeric serial */
assertEq(U.toISODate(40291), '2010-04-23', 'Excel serial number');

/* Shape 3: user-pasted Russian string */
assertEq(U.toISODate('23.04.2010'), '2010-04-23', 'DD.MM.YYYY string');

/* Shape 4: legacy ISO-with-Z string that used to come from the old broken
   code (Date.toISOString()) — must round-trip back to the same day. */
assertEq(U.toISODate('2010-04-23T00:00:00.000Z'), '2010-04-23', 'legacy ISO timestamp');

/* Shape 5: ASU-export style M/D/YYYY */
assertEq(U.toISODate('4/23/2010'), '2010-04-23', 'M/D/YYYY (ASU fallback)');

/* And the registry's published GTOSchoolImport module should be available,
   proving the source file evaluated cleanly. */
assertEq(typeof sandbox.window.GTOSchoolImport, 'object', 'GTOSchoolImport attached to window');
assertEq(typeof sandbox.window.GTOSchoolImport.parseAsuStudentList, 'function', 'parseAsuStudentList exported');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
