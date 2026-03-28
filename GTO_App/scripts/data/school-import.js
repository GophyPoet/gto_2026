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
 *   - Single sheet, row 8 = headers, row 10+ = data
 *   - Col E(4)=class, G(6)=surname, H(7)=name, I(8)=patronymic, AD(29)=form
 *   - Only "очная" form students are included
 *   Returns: [{ className, fullName }]
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
   * Mode 2: Parse ASU student list
   */
  function parseAsuStudentList(arrayBuffer) {
    var workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    var sheet = workbook.Sheets[workbook.SheetNames[0]];
    var matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: true });

    /* Find header row by keywords */
    var headerRow = -1;
    var colClass = -1;
    var colSurname = -1;
    var colName = -1;
    var colPatronymic = -1;
    var colForm = -1;

    for (var r = 0; r < Math.min(matrix.length, 20); r++) {
      var row = matrix[r] || [];
      var joined = row.map(function (c) { return safeText(c).toLowerCase(); }).join('|');
      if (joined.includes('фамилия') && joined.includes('имя') && joined.includes('класс')) {
        headerRow = r;
        for (var ci = 0; ci < row.length; ci++) {
          var h = safeText(row[ci]).toLowerCase();
          if (h === 'класс') colClass = ci;
          if (h === 'фамилия') colSurname = ci;
          if (h === 'имя') colName = ci;
          if (h === 'отчество') colPatronymic = ci;
          if (h === 'форма обучения') colForm = ci;
        }
        break;
      }
    }

    if (headerRow < 0) {
      /* Fallback to known positions */
      headerRow = 8;
      colClass = 4;
      colSurname = 6;
      colName = 7;
      colPatronymic = 8;
      colForm = 29;
    }

    var result = [];
    var dataStart = headerRow + 2; /* Skip header + possible sub-header row */

    /* If row after header is empty or has sub-headers, skip it */
    var nextRow = matrix[headerRow + 1] || [];
    var nextHasData = nextRow.some(function (c) {
      var v = safeText(c);
      return v && v.toLowerCase() !== '' && v !== '№ п/п';
    });
    if (!nextHasData) dataStart = headerRow + 2;
    else dataStart = headerRow + 1;

    for (var ri = dataStart; ri < matrix.length; ri++) {
      var dataRow = matrix[ri] || [];
      var surname = safeText(dataRow[colSurname]);
      var name = safeText(dataRow[colName]);
      if (!surname && !name) continue;

      /* Check form of education */
      var form = safeText(dataRow[colForm]).toLowerCase().replace(/\s+/g, ' ');
      if (form && form !== 'очная') continue;

      var patronymic = safeText(dataRow[colPatronymic]);
      var className = safeText(dataRow[colClass]);
      var fullName = [surname, name, patronymic].filter(Boolean).join(' ');

      if (fullName && className) {
        result.push({ className: className, fullName: fullName });
      }
    }

    return result;
  }

  window.GTOSchoolImport = {
    parseSchoolFile: parseSchoolFile,
    parseAsuStudentList: parseAsuStudentList
  };
})();
