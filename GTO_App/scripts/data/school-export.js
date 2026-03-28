/**
 * school-export.js — Export school roster to Excel in ГТО format.
 *
 * Format: one sheet per class, columns: [№ п/п, ФИО, УИН (подтвержденный на Госуслугах)]
 */
(function () {
  'use strict';

  var HEADERS = ['№ п/п', 'ФИО', 'УИН (подтвержденный на Госуслугах)'];

  function addClassSheet(workbook, className, students) {
    var ws = workbook.addWorksheet(className);

    /* Column widths to match template */
    ws.columns = [
      { width: 8 },   /* № п/п */
      { width: 42 },  /* ФИО */
      { width: 38 }   /* УИН */
    ];

    /* Header row */
    var headerRow = ws.addRow(HEADERS);
    headerRow.eachCell(function (cell) {
      cell.font = { bold: true, size: 11, name: 'Calibri' };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
      };
    });

    /* Data rows */
    students.forEach(function (student, index) {
      var row = ws.addRow([
        student.classNumber || (index + 1),
        student.fullName || '',
        student.uin || '-'
      ]);
      row.eachCell(function (cell) {
        cell.font = { size: 11, name: 'Calibri' };
        cell.alignment = { vertical: 'middle' };
        cell.border = {
          top: { style: 'thin' }, bottom: { style: 'thin' },
          left: { style: 'thin' }, right: { style: 'thin' }
        };
      });
    });
  }

  /**
   * Export all classes to a single workbook.
   * classes: [{ name, students: [{ classNumber, fullName, uin }] }]
   */
  async function exportAllClasses(classes) {
    var workbook = new ExcelJS.Workbook();
    classes.forEach(function (cls) {
      addClassSheet(workbook, cls.name, cls.students);
    });
    var buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /**
   * Export a single class.
   */
  async function exportSingleClass(className, students) {
    var workbook = new ExcelJS.Workbook();
    addClassSheet(workbook, className, students);
    var buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /**
   * Trigger download.
   */
  function download(blob, filename) {
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1500);
  }

  window.GTOSchoolExport = {
    exportAllClasses: exportAllClasses,
    exportSingleClass: exportSingleClass,
    download: download
  };
})();
