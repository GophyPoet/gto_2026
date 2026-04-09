/* eslint-disable no-console */
/**
 * tests/manual-field-sync.test.js — verify that fields the user edited
 * manually are not overwritten by АСУ РСО sync.
 *
 * The core merge logic lives in `buildAsuUpdatePatch` — a pure helper
 * extracted from `syncFromAsu` specifically so it can be exercised in a
 * Node environment without a real IndexedDB.  The IIFE is evaluated in a
 * sandbox with a stubbed `window`; only the helper is under test here.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'GTO_App', 'scripts', 'core', 'school-storage.js');

/* IndexedDB isn't touched by buildAsuUpdatePatch, but the IIFE captures
   `indexedDB` at load time — provide a harmless stub. */
const sandbox = {
  window: {},
  console,
  indexedDB: { open: function () { return { onerror: null, onsuccess: null }; } },
  setTimeout,
  clearTimeout,
  Date,
  Math,
  JSON,
  Object,
  Array,
  Set,
  Promise,
  Error
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: 'school-storage.js' });

const School = sandbox.window.GTOSchool;
if (!School || typeof School.buildAsuUpdatePatch !== 'function') {
  console.error('GTOSchool.buildAsuUpdatePatch is not exposed');
  process.exit(1);
}

let passed = 0;
let failed = 0;
function assertEq(actual, expected, label) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a === e) { passed += 1; console.log('  ok  ' + label); }
  else {
    failed += 1;
    console.log('  FAIL ' + label + '\n       expected: ' + e + '\n       actual:   ' + a);
  }
}
function assertTrue(v, label) { assertEq(!!v, true, label); }
function assertFalse(v, label) { assertEq(!!v, false, label); }

/* ====== Fixture: a typical student already in the local registry ====== */
function makeMatched(manualFields) {
  return {
    id: 'stu_1',
    classId: 'cls_A',
    fullName: 'Иванов Иван Иванович',
    normalizedName: 'ИВАНОВ ИВАН ИВАНОВИЧ',
    uin: '63-07-1234567',
    gender: 'Мужской',
    birthDate: '2010-04-23',
    formOfEducation: 'Очная',
    documentType: 'Свидетельство о рождении',
    documentSeries: 'II-ЕР',
    documentNumber: '567761',
    snils: '123-456-789 00',
    residenceLocality: 'Тольятти',
    residenceStreetName: 'Мира',
    residenceStreetType: 'ул',
    residenceHouse: '10',
    residenceBuilding: '',
    residenceApartment: '5',
    manualFields: manualFields || {}
  };
}

/* An incoming АСУ РСО record that tries to change EVERYTHING. */
function makeIncoming(overrides) {
  return Object.assign({
    fullName: 'Иванов Иван Иванович',
    className: '7А',
    gender: 'Женский',                      /* changed */
    birthDate: '2011-01-01',                /* changed */
    formOfEducation: 'Семейная',            /* changed */
    documentType: 'Паспорт',                /* changed */
    documentSeries: '36 20',                /* changed */
    documentNumber: '999999',               /* changed */
    snils: '000-000-000 00',                /* changed */
    residenceLocality: 'Самара',            /* changed */
    residenceStreetName: 'Ленина',          /* changed */
    residenceStreetType: 'пр',              /* changed */
    residenceHouse: '99',                   /* changed */
    residenceBuilding: '2',                 /* changed */
    residenceApartment: '77'                /* changed */
  }, overrides || {});
}

/* ====== 1. Baseline: no manual flags → every changed field updates ====== */
console.log('1. No manualFields → every changed АСУ field flows through');
{
  var matched = makeMatched();
  var inc = makeIncoming();
  var out = School.buildAsuUpdatePatch(matched, inc, null);
  var keys = Object.keys(out.patch).sort();
  assertEq(keys, [
    'birthDate', 'documentNumber', 'documentSeries', 'documentType',
    'formOfEducation', 'gender', 'residenceApartment', 'residenceBuilding',
    'residenceHouse', 'residenceLocality', 'residenceStreetName', 'residenceStreetType', 'snils'
  ], 'all 13 extended fields are in patch');
  assertEq(out.patch.documentType, 'Паспорт', 'documentType value carried over');
  assertEq(out.patch.residenceLocality, 'Самара', 'residenceLocality value carried over');
}

/* ====== 2. User-example: document fields manually edited ====== */
console.log('2. documentType/documentSeries/documentNumber locked by hand');
{
  var matched = makeMatched({
    documentType: true,
    documentSeries: true,
    documentNumber: true
  });
  var inc = makeIncoming();
  var out = School.buildAsuUpdatePatch(matched, inc, null);
  /* Locked fields must NOT be in the patch */
  assertEq(out.patch.documentType, undefined, 'documentType not overwritten');
  assertEq(out.patch.documentSeries, undefined, 'documentSeries not overwritten');
  assertEq(out.patch.documentNumber, undefined, 'documentNumber not overwritten');
  /* Non-locked fields MUST still update */
  assertEq(out.patch.gender, 'Женский', 'gender still updated (not locked)');
  assertEq(out.patch.birthDate, '2011-01-01', 'birthDate still updated (not locked)');
  assertEq(out.patch.residenceLocality, 'Самара', 'residence still updated (not locked)');
}

/* ====== 3. All residence fields locked ====== */
console.log('3. Residence lock preserved, documents still updated');
{
  var matched = makeMatched({
    residenceLocality: true,
    residenceStreetName: true,
    residenceStreetType: true,
    residenceHouse: true,
    residenceBuilding: true,
    residenceApartment: true
  });
  var inc = makeIncoming();
  var out = School.buildAsuUpdatePatch(matched, inc, null);
  assertEq(out.patch.residenceLocality, undefined, 'residenceLocality locked');
  assertEq(out.patch.residenceStreetName, undefined, 'residenceStreetName locked');
  assertEq(out.patch.residenceStreetType, undefined, 'residenceStreetType locked');
  assertEq(out.patch.residenceHouse, undefined, 'residenceHouse locked');
  assertEq(out.patch.residenceBuilding, undefined, 'residenceBuilding locked');
  assertEq(out.patch.residenceApartment, undefined, 'residenceApartment locked');
  /* Documents still flow through */
  assertEq(out.patch.documentType, 'Паспорт', 'document fields still update');
  assertEq(out.patch.documentSeries, '36 20', 'document series still updates');
}

/* ====== 4. Every possible lock: no extended fields in the patch ====== */
console.log('4. All extended fields locked → patch has no ext fields');
{
  var matched = makeMatched({
    gender: true, birthDate: true, formOfEducation: true,
    documentType: true, documentSeries: true, documentNumber: true, snils: true,
    residenceLocality: true, residenceStreetName: true, residenceStreetType: true,
    residenceHouse: true, residenceBuilding: true, residenceApartment: true
  });
  var inc = makeIncoming();
  var out = School.buildAsuUpdatePatch(matched, inc, null);
  assertEq(Object.keys(out.patch).length, 0, 'patch is empty');
}

/* ====== 5. Class change ALWAYS applies regardless of manualFields ====== */
console.log('5. Class change is never locked');
{
  var matched = makeMatched({
    /* Even if EVERY field is locked, class still flows through. */
    gender: true, birthDate: true, formOfEducation: true,
    documentType: true, documentSeries: true, documentNumber: true, snils: true,
    residenceLocality: true, residenceStreetName: true, residenceStreetType: true,
    residenceHouse: true, residenceBuilding: true, residenceApartment: true,
    fullName: true
  });
  var inc = makeIncoming();
  var classPatch = { classId: 'cls_B', classNumber: null, changeLabel: 'класс: 6А → 7А' };
  var out = School.buildAsuUpdatePatch(matched, inc, classPatch);
  assertEq(out.patch.classId, 'cls_B', 'classId in patch');
  assertEq(out.patch.classNumber, null, 'classNumber reset to null');
  assertTrue(out.changes.indexOf('класс: 6А → 7А') >= 0, 'class-change label recorded');
  /* Locked fields still absent */
  assertEq(out.patch.gender, undefined, 'locked gender absent');
  assertEq(out.patch.residenceLocality, undefined, 'locked residence absent');
}

/* ====== 6. fullName lock ====== */
console.log('6. fullName lock');
{
  var matched = makeMatched({ fullName: true });
  var inc = makeIncoming({ fullName: 'Петров Пётр Петрович' });
  var out = School.buildAsuUpdatePatch(matched, inc, null);
  assertEq(out.patch.fullName, undefined, 'fullName not overwritten');
  /* Other fields still flow through */
  assertEq(out.patch.gender, 'Женский', 'gender still updates');
}

/* ====== 7. Incoming blanks never clear existing values ====== */
console.log('7. Empty incoming value is ignored');
{
  var matched = makeMatched();
  var inc = makeIncoming({ documentType: '', snils: '' });
  var out = School.buildAsuUpdatePatch(matched, inc, null);
  assertEq(out.patch.documentType, undefined, 'empty documentType ignored');
  assertEq(out.patch.snils, undefined, 'empty snils ignored');
}

/* ====== 8. No changes at all → empty patch ====== */
console.log('8. Identical incoming record → empty patch');
{
  var matched = makeMatched();
  /* Identical record (except className/uin which are outside this helper) */
  var inc = {
    fullName: matched.fullName,
    className: '7А',
    gender: matched.gender,
    birthDate: matched.birthDate,
    formOfEducation: matched.formOfEducation,
    documentType: matched.documentType,
    documentSeries: matched.documentSeries,
    documentNumber: matched.documentNumber,
    snils: matched.snils,
    residenceLocality: matched.residenceLocality,
    residenceStreetName: matched.residenceStreetName,
    residenceStreetType: matched.residenceStreetType,
    residenceHouse: matched.residenceHouse,
    residenceBuilding: matched.residenceBuilding,
    residenceApartment: matched.residenceApartment
  };
  var out = School.buildAsuUpdatePatch(matched, inc, null);
  assertEq(Object.keys(out.patch).length, 0, 'patch is empty');
  assertEq(out.changes.length, 0, 'changes list is empty');
}

/* ====== 9. Legacy student without manualFields at all ====== */
console.log('9. Student missing manualFields behaves as fully-unlocked');
{
  var matched = makeMatched();
  delete matched.manualFields;
  var inc = makeIncoming();
  var out = School.buildAsuUpdatePatch(matched, inc, null);
  assertTrue(Object.keys(out.patch).length > 0, 'patch is non-empty');
  assertEq(out.patch.gender, 'Женский', 'gender updated');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
