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
    parseDateValue(value) {
      if (!value) return null;
      if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    },
    formatDate(value) {
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
    toInputDate(value) {
      const date = utils.parseDateValue(value);
      return date ? date.toISOString().slice(0, 10) : '';
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
