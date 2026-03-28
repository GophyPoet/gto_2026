/**
 * standards-storage.js — IndexedDB persistence for GTO standards customizations.
 *
 * Uses the default standards from gto-standards.js as base.
 * Stores user overrides in IndexedDB so admins can add/edit/delete items
 * without touching code.
 *
 * Public API: window.GTOStandards
 *   .init()                          — open DB, load defaults if empty
 *   .getStageNumbers()               — list of all stage numbers
 *   .getStage(stageNumber)           — full stage object
 *   .getAllStages()                   — array of all stages
 *   .addDiscipline(stageNumber, itemNumber, name)
 *   .updateDiscipline(stageNumber, itemNumber, oldName, newName)
 *   .removeDiscipline(stageNumber, itemNumber, name)
 *   .addItem(stageNumber, item)
 *   .updateItem(stageNumber, itemNumber, patch)
 *   .removeItem(stageNumber, itemNumber)
 *   .resetToDefaults()               — restore original set
 */
(function () {
  'use strict';

  var DB_NAME = 'gto-standards';
  var DB_VERSION = 1;
  var STORE = 'stages';
  var db = null;

  function open() {
    return new Promise(function (resolve, reject) {
      if (db) return resolve(db);
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: 'stageNumber' });
        }
      };
      req.onsuccess = function (e) { db = e.target.result; resolve(db); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function tx(mode) {
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  function promisify(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  /* Seed default standards into DB */
  function seedDefaults() {
    var defaults = window.GTOApp.defaultStandards;
    if (!defaults || !defaults.length) return Promise.resolve();
    var store = tx('readwrite');
    var promises = defaults.map(function (stage) {
      var copy = JSON.parse(JSON.stringify(stage));
      return promisify(store.put(copy));
    });
    return Promise.all(promises);
  }

  /* Init: open DB, seed if empty */
  function init() {
    return open().then(function () {
      return promisify(tx('readonly').count());
    }).then(function (count) {
      if (count === 0) return seedDefaults();
    });
  }

  /* Read operations */
  function getAllStages() {
    return promisify(tx('readonly').getAll()).then(function (stages) {
      return stages.sort(function (a, b) { return a.stageNumber - b.stageNumber; });
    });
  }

  function getStage(stageNumber) {
    return promisify(tx('readonly').get(Number(stageNumber)));
  }

  function getStageNumbers() {
    return getAllStages().then(function (stages) {
      return stages.map(function (s) { return s.stageNumber; });
    });
  }

  /* Save a full stage object */
  function putStage(stage) {
    return promisify(tx('readwrite').put(stage));
  }

  /* Discipline CRUD within a stage */
  function addDiscipline(stageNumber, itemNumber, name) {
    return getStage(stageNumber).then(function (stage) {
      if (!stage) throw new Error('Ступень ' + stageNumber + ' не найдена');
      var item = stage.items.find(function (it) { return it.itemNumber === itemNumber; });
      if (!item) throw new Error('Пункт ' + itemNumber + ' не найден');
      if (item.disciplines.indexOf(name) >= 0) throw new Error('Дисциплина уже существует');
      item.disciplines.push(name);
      if (item.disciplines.length > 1) item.selectionType = 'multi';
      return putStage(stage);
    });
  }

  function updateDiscipline(stageNumber, itemNumber, oldName, newName) {
    return getStage(stageNumber).then(function (stage) {
      if (!stage) throw new Error('Ступень ' + stageNumber + ' не найдена');
      var item = stage.items.find(function (it) { return it.itemNumber === itemNumber; });
      if (!item) throw new Error('Пункт ' + itemNumber + ' не найден');
      var idx = item.disciplines.indexOf(oldName);
      if (idx < 0) throw new Error('Дисциплина не найдена');
      item.disciplines[idx] = newName;
      return putStage(stage);
    });
  }

  function removeDiscipline(stageNumber, itemNumber, name) {
    return getStage(stageNumber).then(function (stage) {
      if (!stage) throw new Error('Ступень ' + stageNumber + ' не найдена');
      var item = stage.items.find(function (it) { return it.itemNumber === itemNumber; });
      if (!item) throw new Error('Пункт ' + itemNumber + ' не найден');
      item.disciplines = item.disciplines.filter(function (d) { return d !== name; });
      if (item.disciplines.length <= 1) item.selectionType = 'single';
      return putStage(stage);
    });
  }

  /* Item CRUD within a stage */
  function addItem(stageNumber, newItem) {
    return getStage(stageNumber).then(function (stage) {
      if (!stage) throw new Error('Ступень ' + stageNumber + ' не найдена');
      /* Auto-assign itemNumber if not provided */
      if (!newItem.itemNumber) {
        var maxNum = stage.items.reduce(function (m, it) { return Math.max(m, it.itemNumber); }, 0);
        newItem.itemNumber = maxNum + 1;
      }
      if (!newItem.disciplines) newItem.disciplines = [];
      if (!newItem.selectionType) newItem.selectionType = newItem.disciplines.length <= 1 ? 'single' : 'multi';
      if (!newItem.hint) newItem.hint = '';
      stage.items.push(newItem);
      stage.items.sort(function (a, b) { return a.itemNumber - b.itemNumber; });
      return putStage(stage);
    });
  }

  function updateItem(stageNumber, itemNumber, patch) {
    return getStage(stageNumber).then(function (stage) {
      if (!stage) throw new Error('Ступень ' + stageNumber + ' не найдена');
      var item = stage.items.find(function (it) { return it.itemNumber === itemNumber; });
      if (!item) throw new Error('Пункт ' + itemNumber + ' не найден');
      Object.keys(patch).forEach(function (key) { item[key] = patch[key]; });
      return putStage(stage);
    });
  }

  function removeItem(stageNumber, itemNumber) {
    return getStage(stageNumber).then(function (stage) {
      if (!stage) throw new Error('Ступень ' + stageNumber + ' не найдена');
      stage.items = stage.items.filter(function (it) { return it.itemNumber !== itemNumber; });
      return putStage(stage);
    });
  }

  /* Reset to defaults */
  function resetToDefaults() {
    var store = tx('readwrite');
    return promisify(store.clear()).then(function () {
      return seedDefaults();
    });
  }

  window.GTOStandards = {
    init: init,
    getStageNumbers: getStageNumbers,
    getStage: getStage,
    getAllStages: getAllStages,
    addDiscipline: addDiscipline,
    updateDiscipline: updateDiscipline,
    removeDiscipline: removeDiscipline,
    addItem: addItem,
    updateItem: updateItem,
    removeItem: removeItem,
    resetToDefaults: resetToDefaults
  };
})();
