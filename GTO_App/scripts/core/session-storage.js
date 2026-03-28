/**
 * session-storage.js — IndexedDB layer for multi-session GTO data.
 *
 * Object stores:
 *   "sessions" — metadata about each date session
 *     { id, eventDate, label, createdAt, updatedAt }
 *   "sessionData" — full workspace state blob per session
 *     { id (same as session id), state: { ...appState } }
 *
 * Public API attached to window.GTOSessions:
 *   init()                      — open/upgrade DB
 *   createSession(eventDate)    — create a new session, returns its id
 *   getAllSessions()             — list all session metadata, sorted by date desc
 *   getSession(id)              — get one session metadata
 *   getSessionData(id)          — get full state blob for a session
 *   saveSessionData(id, state)  — upsert state blob + update session.updatedAt
 *   deleteSession(id)           — delete session + its data
 *   updateSessionMeta(id, patch) — update metadata fields (label, eventDate)
 */
(function () {
  'use strict';

  const DB_NAME = 'gto-app-sessions';
  const DB_VERSION = 1;
  let db = null;

  function open() {
    return new Promise(function (resolve, reject) {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function (event) {
        const database = event.target.result;
        if (!database.objectStoreNames.contains('sessions')) {
          database.createObjectStore('sessions', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('sessionData')) {
          database.createObjectStore('sessionData', { keyPath: 'id' });
        }
      };
      request.onsuccess = function (event) {
        db = event.target.result;
        resolve(db);
      };
      request.onerror = function (event) {
        reject(event.target.error);
      };
    });
  }

  function tx(storeNames, mode) {
    var transaction = db.transaction(storeNames, mode);
    return transaction;
  }

  function reqToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function generateId() {
    return 'ses_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function formatDateLabel(dateStr) {
    if (!dateStr) return 'Без даты';
    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    var months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return parseInt(parts[2], 10) + ' ' + months[parseInt(parts[1], 10) - 1] + ' ' + parts[0] + ' г.';
  }

  /* ---- Public API ---- */

  async function init() {
    if (!db) await open();
  }

  async function createSession(eventDate) {
    await init();
    var id = generateId();
    var now = new Date().toISOString();
    var session = {
      id: id,
      eventDate: eventDate || '',
      label: 'ГТО — ' + formatDateLabel(eventDate),
      createdAt: now,
      updatedAt: now
    };
    var transaction = tx(['sessions', 'sessionData'], 'readwrite');
    transaction.objectStore('sessions').put(session);
    transaction.objectStore('sessionData').put({ id: id, state: null });
    await new Promise(function (resolve, reject) {
      transaction.oncomplete = resolve;
      transaction.onerror = function () { reject(transaction.error); };
    });
    return session;
  }

  async function getAllSessions() {
    await init();
    var store = tx(['sessions'], 'readonly').objectStore('sessions');
    var all = await reqToPromise(store.getAll());
    all.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
    return all;
  }

  async function getSession(id) {
    await init();
    var store = tx(['sessions'], 'readonly').objectStore('sessions');
    return reqToPromise(store.get(id));
  }

  async function getSessionData(id) {
    await init();
    var store = tx(['sessionData'], 'readonly').objectStore('sessionData');
    var record = await reqToPromise(store.get(id));
    return record ? record.state : null;
  }

  async function saveSessionData(id, state) {
    await init();
    var now = new Date().toISOString();
    var transaction = tx(['sessions', 'sessionData'], 'readwrite');
    /* Update the state blob */
    transaction.objectStore('sessionData').put({ id: id, state: state });
    /* Update session's updatedAt timestamp */
    var sessionStore = transaction.objectStore('sessions');
    var existing = await reqToPromise(sessionStore.get(id));
    if (existing) {
      existing.updatedAt = now;
      /* Also sync eventDate from workspace state if available */
      if (state && state.meta && state.meta.eventDate) {
        existing.eventDate = state.meta.eventDate;
        existing.label = 'ГТО — ' + formatDateLabel(state.meta.eventDate);
      }
      sessionStore.put(existing);
    }
    await new Promise(function (resolve, reject) {
      transaction.oncomplete = resolve;
      transaction.onerror = function () { reject(transaction.error); };
    });
  }

  async function updateSessionMeta(id, patch) {
    await init();
    var store = tx(['sessions'], 'readwrite').objectStore('sessions');
    var existing = await reqToPromise(store.get(id));
    if (!existing) throw new Error('Сессия не найдена: ' + id);
    Object.assign(existing, patch, { updatedAt: new Date().toISOString() });
    await reqToPromise(store.put(existing));
    return existing;
  }

  async function deleteSession(id) {
    await init();
    var transaction = tx(['sessions', 'sessionData'], 'readwrite');
    transaction.objectStore('sessions').delete(id);
    transaction.objectStore('sessionData').delete(id);
    await new Promise(function (resolve, reject) {
      transaction.oncomplete = resolve;
      transaction.onerror = function () { reject(transaction.error); };
    });
  }

  window.GTOSessions = {
    init: init,
    createSession: createSession,
    getAllSessions: getAllSessions,
    getSession: getSession,
    getSessionData: getSessionData,
    saveSessionData: saveSessionData,
    updateSessionMeta: updateSessionMeta,
    deleteSession: deleteSession,
    formatDateLabel: formatDateLabel
  };
})();
