(function () {
  window.GTOApp = window.GTOApp || {};

  const utils = {
    slugify(value) {
      return String(value || '').toLowerCase().replace(/\s+/g, '-').replace(/[^\wа-яё-]+/gi, '');
    },
    safeText(value, fallback = '') {
      return value === undefined || value === null || value === '' ? fallback : String(value).trim();
    },
    dedupe(items) {
      return Array.from(new Set(items.filter(Boolean)));
    },
    sortByText(items, selector) {
      return [...items].sort((left, right) => selector(left).localeCompare(selector(right), 'ru'));
    },
    /**
     * Parse any DATE-ONLY input → local Date at 00:00 (for day-by-day
     * comparisons like age calculation). Delegates to GTODateUtils so
     * the main app and workspace stay in lock-step on calendar logic
     * and there is no -1 day shift under any timezone.
     */
    parseDateValue(value) {
      if (!value) return null;
      if (window.GTODateUtils) {
        return window.GTODateUtils.isoToLocalDate(window.GTODateUtils.toISODate(value));
      }
      if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
      return null;
    },
    /**
     * DD.MM.YYYY display. DATE-ONLY safe via GTODateUtils.
     */
    formatDate(value) {
      if (window.GTODateUtils) return window.GTODateUtils.toDisplayDate(value);
      const date = utils.parseDateValue(value);
      if (!date) return '';
      const parts = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(date);
      const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return `${map.day}.${map.month}.${map.year}`;
    },
    formatLongDate(value) {
      const date = utils.parseDateValue(value);
      if (!date) return '';
      return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    },
    /**
     * Convert any DATE-ONLY input → 'YYYY-MM-DD' string suitable for
     * an <input type="date"> element. This used to call
     * `date.toISOString().slice(0, 10)` which shifted the day in any
     * positive-offset timezone. Fixed by going through GTODateUtils.
     */
    toInputDate(value) {
      if (window.GTODateUtils) return window.GTODateUtils.toISODate(value);
      const date = utils.parseDateValue(value);
      if (!date) return '';
      return date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0');
    },
    downloadBlob(blob, filename) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1500);
    },
    async serializeFile(file) {
      const buffer = await file.arrayBuffer();
      return {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        base64: utils.arrayBufferToBase64(buffer)
      };
    },
    arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
      return btoa(binary);
    },
    base64ToUint8Array(base64) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes;
    },
    clone(value) {
      return JSON.parse(JSON.stringify(value));
    }
  };

  window.GTOApp.utils = utils;
})();
