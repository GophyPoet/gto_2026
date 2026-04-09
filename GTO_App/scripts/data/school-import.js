/**
 * school-import.js — Parse Excel files into class/student structures.
 *
 * Mode 1: parseSchoolFile(arrayBuffer)
 *   For files like "ГТО_2025_новое":
 *   - Each sheet = one class (sheet name = class name)
 *   - Row 0 = headers (№ п/п, ФИО, УИН)
 *   - Row 1+ = student data
 *   Returns: [{ className, students: [{ classNumber, fullName, uin }] }]
 *
 * Mode 2: parseAsuStudentList(arrayBuffer)
 *   For files like "список детей март 2026":
 *   - Single sheet, row 8 = headers, row 9 = sub-headers, row 10+ = data
 *   - Extracts ALL fields: class, FIO, gender, birthDate, document, address, SNILS
 *   - Only "очная" form students are included
 *   Returns: [{ className, fullName, gender, birthDate, documentType, ... }]
 */
(function () {
  'use strict';

  function safeText(v) {
    return v === undefined || v === null || v === '' ? '' : String(v).trim();
  }

  function normalizeClassName(s) {
    return String(s || '').replace(/\s+/g, '').toUpperCase().replace(/Ё/g, 'Е');
  }

  /**
   * Mode 1: Parse school file (ГТО format)
   */
  function parseSchoolFile(arrayBuffer) {
    var workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    var result = [];

    workbook.SheetNames.forEach(function (sheetName) {
      var sheet = workbook.Sheets[sheetName];
      var matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

      /* Find header row: look for row containing ФИО or Ф.И.О. */
      var headerRowIdx = -1;
      var colFio = -1;
      var colUin = -1;
      var colNum = -1;

      for (var r = 0; r < Math.min(matrix.length, 10); r++) {
        var row = matrix[r] || [];
        for (var c = 0; c < row.length; c++) {
          var h = safeText(row[c]).toLowerCase();
          if (h.includes('фио') || h.includes('ф.и.о')) { colFio = c; headerRowIdx = r; }
          if (h.includes('уин') || h.includes('win') || h.includes('uin')) { colUin = c; }
          if (h === '№ п/п' || h === '№' || h === 'номер') { colNum = c; }
        }
        if (headerRowIdx >= 0) break;
      }

      if (headerRowIdx < 0 || colFio < 0) return; /* Skip sheets without recognizable headers */

      var students = [];
      for (var ri = headerRowIdx + 1; ri < matrix.length; ri++) {
        var dataRow = matrix[ri] || [];
        var fullName = safeText(dataRow[colFio]);
        if (!fullName) continue; /* Skip empty rows */

        var classNumber = colNum >= 0 ? parseInt(safeText(dataRow[colNum]), 10) || null : null;
        var uin = colUin >= 0 ? safeText(dataRow[colUin]) : '';
        if (uin === '-') uin = '';

        students.push({ classNumber: classNumber, fullName: fullName, uin: uin });
      }

      if (students.length > 0) {
        result.push({ className: sheetName.trim(), students: students });
      }
    });

    return result;
  }

  /**
   * Parse any supported date input → 'YYYY-MM-DD'.
   *
   * IMPORTANT: historically this helper constructed local-time Date objects
   * and then called `.toISOString()` which shifted the day back by the
   * timezone offset (e.g. Russia MSK+3 turned 23.04.2010 into 22.04.2010).
   * We now delegate to the shared GTODateUtils which is date-only safe and
   * used by BOTH the main app and workspace.
   */
  function excelDateToISO(raw) {
    if (window.GTODateUtils) return window.GTODateUtils.toISODate(raw);
    /* Fallback (should never trigger — date-utils.js is always loaded). */
    return raw ? String(raw) : '';
  }

  /**
   * Normalize gender value to standard label.
   */
  function normalizeGender(v) {
    var s = safeText(v).toLowerCase();
    if (!s) return '';
    if (s === 'м' || s === 'муж' || s === 'мужской' || s === 'male') return 'Мужской';
    if (s === 'ж' || s === 'жен' || s === 'женский' || s === 'female') return 'Женский';
    return safeText(v);
  }

  /**
   * Mode 2: Parse ASU student list with ALL fields.
   */
  function parseAsuStudentList(arrayBuffer) {
    var workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    var sheet = workbook.Sheets[workbook.SheetNames[0]];
    var matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: true });

    /* Column mapping object — will be filled by auto-detect or fallback */
    var cols = {
      className: -1, surname: -1, name: -1, patronymic: -1,
      birthDate: -1, gender: -1, form: -1,
      documentType: -1, documentSeries: -1, documentNumber: -1,
      snils: -1,
      resLocality: -1, resStreetName: -1, resStreetType: -1,
      resHouse: -1, resBuilding: -1, resApartment: -1
    };

    /* Keyword mapping for header detection */
    var headerKeywords = {
      'класс': 'className',
      'фамилия': 'surname',
      'имя': 'name',
      'отчество': 'patronymic',
      'дата рождения': 'birthDate',
      'пол': 'gender',
      'форма обучения': 'form',
      'тип документа': 'documentType',
      'серия документа': 'documentSeries',
      'номер документа': 'documentNumber',
      'снилс': 'snils'
    };

    /* Sub-header keywords for address columns */
    var subHeaderKeywords = {
      'населенный пункт': 'resLocality',
      'название улицы': 'resStreetName',
      'тип улицы': 'resStreetType',
      'дом': 'resHouse',
      'корпус': 'resBuilding',
      'квартира': 'resApartment'
    };

    /* Find header row */
    var headerRow = -1;
    for (var r = 0; r < Math.min(matrix.length, 20); r++) {
      var row = matrix[r] || [];
      var joined = row.map(function (c) { return safeText(c).toLowerCase(); }).join('|');
      if (joined.includes('фамилия') && joined.includes('имя') && joined.includes('класс')) {
        headerRow = r;
        /* Match main headers */
        for (var ci = 0; ci < row.length; ci++) {
          var h = safeText(row[ci]).toLowerCase();
          Object.keys(headerKeywords).forEach(function (kw) {
            if (h === kw) cols[headerKeywords[kw]] = ci;
          });
        }
        break;
      }
    }

    /* Find address sub-columns from the residence address group (row after header) */
    var addrStart = -1;
    if (headerRow >= 0) {
      /* Look for "Адрес проживания" in header row to find the group start */
      var hRow = matrix[headerRow] || [];
      for (var ai = 0; ai < hRow.length; ai++) {
        if (safeText(hRow[ai]).toLowerCase().includes('адрес проживания')) {
          addrStart = ai;
          break;
        }
      }
      /* Parse sub-headers row */
      var subRow = matrix[headerRow + 1] || [];
      if (addrStart >= 0) {
        for (var si = addrStart; si < Math.min(subRow.length, addrStart + 10); si++) {
          var sh = safeText(subRow[si]).toLowerCase();
          Object.keys(subHeaderKeywords).forEach(function (kw) {
            if (sh === kw && cols[subHeaderKeywords[kw]] === -1) {
              cols[subHeaderKeywords[kw]] = si;
            }
          });
        }
      }
    }

    /* Fallback to known positions if auto-detect failed */
    if (headerRow < 0) {
      headerRow = 8;
      cols.className = 4; cols.surname = 6; cols.name = 7; cols.patronymic = 8;
      cols.birthDate = 9; cols.gender = 10;
      cols.documentType = 11; cols.documentSeries = 12; cols.documentNumber = 13;
      cols.snils = 16; cols.form = 29;
      cols.resLocality = 23; cols.resStreetName = 24; cols.resStreetType = 25;
      cols.resHouse = 26; cols.resBuilding = 27; cols.resApartment = 28;
    }

    /* Determine data start row (skip sub-header if present) */
    var nextRow = matrix[headerRow + 1] || [];
    var nextHasRealData = nextRow.some(function (c, idx) {
      if (idx === cols.surname || idx === cols.name) return safeText(c) !== '';
      return false;
    });
    var dataStart = nextHasRealData ? headerRow + 1 : headerRow + 2;

    var result = [];
    for (var ri = dataStart; ri < matrix.length; ri++) {
      var dataRow = matrix[ri] || [];
      var surname = safeText(dataRow[cols.surname]);
      var nameVal = safeText(dataRow[cols.name]);
      if (!surname && !nameVal) continue;

      /* Form of education (keep all forms, not just 'очная') */
      var form = cols.form >= 0 ? safeText(dataRow[cols.form]).replace(/\s+/g, ' ') : '';

      var patronymic = safeText(dataRow[cols.patronymic]);
      var className = safeText(dataRow[cols.className]);
      var fullName = [surname, nameVal, patronymic].filter(Boolean).join(' ');

      if (!fullName || !className) continue;

      /* Build address from components */
      var addrParts = [];
      var locality = cols.resLocality >= 0 ? safeText(dataRow[cols.resLocality]) : '';
      var streetType = cols.resStreetType >= 0 ? safeText(dataRow[cols.resStreetType]) : '';
      var streetName = cols.resStreetName >= 0 ? safeText(dataRow[cols.resStreetName]) : '';
      var house = cols.resHouse >= 0 ? safeText(dataRow[cols.resHouse]) : '';
      var building = cols.resBuilding >= 0 ? safeText(dataRow[cols.resBuilding]) : '';
      var apartment = cols.resApartment >= 0 ? safeText(dataRow[cols.resApartment]) : '';

      result.push({
        className: className,
        fullName: fullName,
        formOfEducation: form,
        gender: normalizeGender(cols.gender >= 0 ? dataRow[cols.gender] : ''),
        birthDate: excelDateToISO(cols.birthDate >= 0 ? dataRow[cols.birthDate] : ''),
        documentType: cols.documentType >= 0 ? safeText(dataRow[cols.documentType]) : '',
        documentSeries: cols.documentSeries >= 0 ? safeText(dataRow[cols.documentSeries]) : '',
        documentNumber: cols.documentNumber >= 0 ? safeText(dataRow[cols.documentNumber]) : '',
        snils: cols.snils >= 0 ? safeText(dataRow[cols.snils]) : '',
        residenceLocality: locality,
        residenceStreetName: streetName,
        residenceStreetType: streetType,
        residenceHouse: house,
        residenceBuilding: building,
        residenceApartment: apartment
      });
    }

    return result;
  }

  window.GTOSchoolImport = {
    parseSchoolFile: parseSchoolFile,
    parseAsuStudentList: parseAsuStudentList
  };
})();
