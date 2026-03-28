/**
 * storage.js — Persistence adapter.
 *
 * INTEGRATION POINT: When opened via workspace.html?session=<id>,
 * load/save operate on IndexedDB via GTOSessions (per-session isolation).
 * Falls back to localStorage if no session context (backwards compatibility).
 *
 * The rest of the app calls storage.load() / storage.save() as before —
 * this adapter transparently routes to the correct backend.
 */
(function () {
  window.GTOApp = window.GTOApp || {};
  var config = window.GTOApp.config;
  var utils = window.GTOApp.utils;

  /* Detect session context from URL */
  var params = new URLSearchParams(window.location.search);
  var sessionId = params.get('session');

  /* In-memory cache of session state (loaded async at init) */
  var cachedState = null;
  var sessionReady = false;
  var pendingSave = null;

  /* ---- Sync localStorage fallback (original behavior) ---- */
  function loadFromLocalStorage() {
    var raw = localStorage.getItem(config.storageKey);
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch (e) { return null; }
  }

  function saveToLocalStorage(state) {
    localStorage.setItem(config.storageKey, JSON.stringify(state));
  }

  /* ---- Session-aware API ---- */

  var storage = {
    /**
     * Returns the current session ID (if workspace is in session context).
     */
    getSessionId: function () {
      return sessionId;
    },

    /**
     * Initialize session storage. Must be called before first load/save in session mode.
     * Returns a Promise that resolves when cached state is ready.
     */
    initSession: async function () {
      if (!sessionId) { sessionReady = true; return; }
      if (sessionReady) return;
      var sessions = window.GTOSessions;
      if (!sessions) { sessionReady = true; return; }
      await sessions.init();
      cachedState = await sessions.getSessionData(sessionId);
      sessionReady = true;
    },

    /**
     * Synchronous load — returns cached state or localStorage fallback.
     */
    load: function () {
      if (sessionId && sessionReady) return cachedState;
      if (sessionId && !sessionReady) return null; /* Not yet initialized */
      return loadFromLocalStorage();
    },

    /**
     * Save state. In session mode, writes to IndexedDB asynchronously
     * but updates cache synchronously for immediate reads.
     */
    save: function (state) {
      if (sessionId) {
        cachedState = state;
        /* Debounced async write to IndexedDB */
        if (pendingSave) clearTimeout(pendingSave);
        pendingSave = setTimeout(function () {
          pendingSave = null;
          var sessions = window.GTOSessions;
          if (sessions) {
            sessions.saveSessionData(sessionId, state).catch(function (err) {
              console.error('Failed to save session data:', err);
            });
          }
        }, 300);
      } else {
        saveToLocalStorage(state);
      }
    },

    /**
     * Force immediate flush to IndexedDB (e.g., before navigation).
     */
    flush: async function () {
      if (sessionId && cachedState) {
        if (pendingSave) { clearTimeout(pendingSave); pendingSave = null; }
        var sessions = window.GTOSessions;
        if (sessions) await sessions.saveSessionData(sessionId, cachedState);
      }
    },

    async exportToFile(state) {
      var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      utils.downloadBlob(blob, config.projectFileName);
    },

    async importFromFile(file) {
      return JSON.parse(await file.text());
    },

    async chooseDirectory() {
      if (!window.showDirectoryPicker) throw new Error('Браузер не поддерживает выбор рабочей папки.');
      return window.showDirectoryPicker();
    },

    async saveToDirectory(directoryHandle, state) {
      var fileHandle = await directoryHandle.getFileHandle(config.projectFileName, { create: true });
      var writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(state, null, 2));
      await writable.close();
    }
  };

  window.GTOApp.storage = storage;
})();
