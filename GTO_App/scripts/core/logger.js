(function () {
  window.GTOApp = window.GTOApp || {};
  window.GTOApp.logger = {
    info(...args) { console.info('[GTO]', ...args); },
    warn(...args) { console.warn('[GTO]', ...args); },
    error(...args) { console.error('[GTO]', ...args); }
  };
})();
