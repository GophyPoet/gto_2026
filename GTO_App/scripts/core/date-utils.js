/**
 * date-utils.js — Single source of truth for DATE-ONLY values (birth dates).
 *
 * KEY PRINCIPLE:
 *   Birth dates are calendar-only values. They must never be piped through
 *   `Date.prototype.toISOString()` because that converts LOCAL-time Dates to
 *   UTC and, in any positive-offset timezone (e.g. Russia MSK+3), shifts the
 *   day back by one. The bug was reproducible as:
 *     input 23.04.2010  →  stored/displayed 22.04.2010
 *
 * Usage:
 *   Always go through GTODateUtils.toISODate(value) to get a safe
 *   'YYYY-MM-DD' string and GTODateUtils.toDisplayDate(value) for
 *   'DD.MM.YYYY' display. Both accept Date objects, numbers (Excel
 *   serial), and strings in common formats.
 *
 * This module is loaded by BOTH index.html (dashboard / registry) and
 * workspace.html so the two pages never diverge in date handling.
 *
 * Public API: window.GTODateUtils
 */
(function () {
  'use strict';

  function pad2(n) {
    var s = String(n);
    return s.length < 2 ? '0' + s : s;
  }

  /**
   * Convert an Excel serial day number → 'YYYY-MM-DD'.
   * Excel serial 1 corresponds to 1900-01-01; the unix epoch offset is 25569.
   * We round to the nearest whole day and then read UTC components — never
   * local components — because the arithmetic is already in UTC.
   */
  function excelSerialToISO(num) {
    if (num === null || num === undefined || num === '') return '';
    var n = Number(num);
    if (!isFinite(n)) return '';
    /* Excel's leap-year bug: serials ≥ 61 need no correction, below 61 is
       rarely used for real dates and we don't need to handle it here. */
    var ms = Math.round((n - 25569) * 86400 * 1000);
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  /**
   * Normalize any supported input into a 'YYYY-MM-DD' string.
   * Returns '' on failure. Never throws.
   *
   * Accepted inputs:
   *   - Date object  → read LOCAL components (not UTC)
   *   - number       → Excel serial
   *   - 'YYYY-MM-DD' → kept as-is
   *   - 'YYYY-MM-DDTHH:MM:SS[.sssZ]' → take the date portion only (UTC date)
   *   - 'DD.MM.YYYY' / 'D.M.YY' → Russian format
   *   - 'M/D/YYYY' / 'M/D/YY'   → American/ASU fallback
   *   - Numeric string matching an Excel serial
   */
  function toISODate(value) {
    if (value === null || value === undefined || value === '') return '';

    if (value instanceof Date) {
      if (isNaN(value.getTime())) return '';
      /* CRITICAL: use LOCAL getters. When Excel reads a date cell with
         `cellDates: true`, xlsx constructs a local-time Date at midnight of
         that calendar day. Reading UTC here would shift it by the TZ offset. */
      return value.getFullYear() + '-' + pad2(value.getMonth() + 1) + '-' + pad2(value.getDate());
    }

    if (typeof value === 'number') {
      return excelSerialToISO(value);
    }

    var s = String(value).trim();
    if (!s) return '';

    /* Plain ISO date */
    var isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return isoMatch[1] + '-' + isoMatch[2] + '-' + isoMatch[3];

    /* Full ISO timestamp: 2010-04-23T00:00:00.000Z — take the calendar
       portion verbatim; this is the output of legacy `.toISOString()` paths
       and interpreting it as UTC is the only way to preserve the day. */
    var isoTs = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ]/);
    if (isoTs) return isoTs[1] + '-' + isoTs[2] + '-' + isoTs[3];

    /* DD.MM.YYYY or DD.MM.YY (Russian) */
    var ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (ru) {
      var yr = Number(ru[3]);
      if (yr < 100) yr += yr > 50 ? 1900 : 2000;
      return yr + '-' + pad2(ru[2]) + '-' + pad2(ru[1]);
    }

    /* M/D/YYYY or M/D/YY (American) */
    var us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (us) {
      var yu = Number(us[3]);
      if (yu < 100) yu += yu > 50 ? 1900 : 2000;
      return yu + '-' + pad2(us[1]) + '-' + pad2(us[2]);
    }

    /* Excel serial encoded as string */
    if (/^\d+(\.\d+)?$/.test(s)) {
      var n = Number(s);
      if (n > 100) return excelSerialToISO(n);
    }

    /* Last-resort: let Date parse it, then read LOCAL components. */
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    return '';
  }

  /**
   * Any supported input → 'DD.MM.YYYY' for display.
   */
  function toDisplayDate(value) {
    var iso = toISODate(value);
    if (!iso) return '';
    var parts = iso.split('-');
    return parts[2] + '.' + parts[1] + '.' + parts[0];
  }

  /**
   * 'YYYY-MM-DD' → local-time Date at 00:00.
   * Used only for age arithmetic where comparison is day-by-day.
   */
  function isoToLocalDate(iso) {
    var s = toISODate(iso);
    if (!s) return null;
    var parts = s.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  /**
   * Full years between two calendar dates (birth and event), DATE-ONLY safe.
   */
  function calcAge(birth, event) {
    var b = isoToLocalDate(birth);
    var e = isoToLocalDate(event);
    if (!b || !e) return null;
    var age = e.getFullYear() - b.getFullYear();
    var md = e.getMonth() - b.getMonth();
    var dd = e.getDate() - b.getDate();
    if (md < 0 || (md === 0 && dd < 0)) age -= 1;
    return age >= 0 ? age : null;
  }

  /**
   * Validate 'YYYY-MM-DD' strictly. Returns boolean.
   */
  function isValidISODate(iso) {
    if (typeof iso !== 'string') return false;
    var m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return false;
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
    var dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
  }

  window.GTODateUtils = {
    pad2: pad2,
    toISODate: toISODate,
    toDisplayDate: toDisplayDate,
    excelSerialToISO: excelSerialToISO,
    isoToLocalDate: isoToLocalDate,
    calcAge: calcAge,
    isValidISODate: isValidISODate
  };
})();
