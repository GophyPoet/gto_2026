(function () {
  window.GTOApp = window.GTOApp || {};
  const { config, utils } = window.GTOApp;
  const warningFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4CCCC' } };

  /* Deep-clone a plain object (fonts, borders, alignments) */
  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

  /* Copy cell style (font, border, alignment, numFmt) from a source row to a target row */
  function copyRowStyle(sourceRow, targetRow, colCount) {
    targetRow.height = sourceRow.height;
    for (let col = 1; col <= colCount; col += 1) {
      const src = sourceRow.getCell(col);
      const tgt = targetRow.getCell(col);
      if (src.font) tgt.font = deepClone(src.font);
      if (src.border) tgt.border = deepClone(src.border);
      if (src.alignment) tgt.alignment = deepClone(src.alignment);
      if (src.numFmt) tgt.numFmt = src.numFmt;
    }
  }

  /* Clear cell completely: reset value and all styling */
  function clearCell(cell) {
    cell.value = null;
    cell.style = {};
  }

  /* Style for footer text (matches template: Calibri 11, black, left-aligned) */
  const footerFont = { size: 11, color: { argb: 'FF000000' }, name: 'Calibri', family: 2, charset: 1 };

  async function exportApplication(state, rows) {
    if (!state.files.template) throw new Error('Во встроенном шаблоне заявки нет данных.');

    const workbook = new ExcelJS.Workbook();
    const templateBytes = utils.base64ToUint8Array(state.files.template.base64);
    const templateBuffer = templateBytes.buffer.slice(templateBytes.byteOffset, templateBytes.byteOffset + templateBytes.byteLength);
    await workbook.xlsx.load(templateBuffer);

    const sheet = workbook.getWorksheet(state.analysis.template.applicationSheetName);
    /* dataStartRow is 0-based matrix index; +1 for ExcelJS 1-based row */
    const startRow = state.analysis.template.dataStartRow + 1;
    const colCount = 11;

    /* Snapshot style from the first data row BEFORE any modifications */
    const templateRow = sheet.getRow(startRow);
    const cellStyles = [];
    for (let col = 1; col <= colCount; col += 1) {
      const src = templateRow.getCell(col);
      cellStyles.push({
        font: src.font ? deepClone(src.font) : null,
        border: src.border ? deepClone(src.border) : null,
        alignment: src.alignment ? deepClone(src.alignment) : null,
        numFmt: src.numFmt || null
      });
    }
    const templateRowHeight = templateRow.height;

    /* Apply snapshotted style to a row */
    function applyStyle(targetRow) {
      targetRow.height = templateRowHeight;
      for (let col = 1; col <= colCount; col += 1) {
        const tgt = targetRow.getCell(col);
        const style = cellStyles[col - 1];
        if (style.font) tgt.font = deepClone(style.font);
        if (style.border) tgt.border = deepClone(style.border);
        if (style.alignment) tgt.alignment = deepClone(style.alignment);
        if (style.numFmt) tgt.numFmt = style.numFmt;
      }
    }

    /* --- Clear ALL old template data rows + footer BEFORE writing new data --- */
    /* This avoids ExcelJS shared-style mutation issues (clearing after writing can destroy borders) */
    const templateSummaryRow = state.analysis.template.summaryRowIndex + 1;
    const templateDateRow = state.analysis.template.dateRowIndex + 1;
    const lastOldRow = Math.max(templateDateRow, templateSummaryRow) + 2;
    const dataEndRow = startRow + rows.length; /* first empty row after data */

    for (let rowIndex = startRow; rowIndex <= lastOldRow; rowIndex += 1) {
      const row = sheet.getRow(rowIndex);
      for (let col = 1; col <= colCount; col += 1) {
        clearCell(row.getCell(col));
      }
    }

    /* Write participant data with fresh styles applied AFTER clearing */
    rows.forEach((rowData, index) => {
      const row = sheet.getRow(startRow + index);
      applyStyle(row);

      row.getCell(1).value = index + 1;
      row.getCell(2).value = rowData.fullName.value;
      row.getCell(3).value = rowData.uin.value;
      row.getCell(4).value = rowData.gender.value;
      row.getCell(5).value = rowData.schoolName.value;
      row.getCell(6).value = rowData.stage.value;
      row.getCell(7).value = rowData.birthDateDisplay || config.placeholders.missing;
      row.getCell(8).value = rowData.age.value;
      row.getCell(9).value = rowData.documentNumber.value;
      row.getCell(10).value = rowData.className.value;
      row.getCell(11).value = rowData.address.value;

      /* Highlight problematic fields */
      const fieldToCol = { fullName: 2, uin: 3, gender: 4, schoolName: 5, stage: 6, birthDateRaw: 7, age: 8, documentNumber: 9, className: 10, address: 11 };
      Object.entries(fieldToCol).forEach(([field, column]) => {
        if (rowData[field] && rowData[field].problem) row.getCell(column).fill = warningFill;
      });
    });

    /* --- Write footer right after the data --- */
    /* One empty row gap after data, then summary/director/date */
    const footerStart = dataEndRow + 1;

    /* "Утверждено к допуску: N человек" */
    const summaryCell = sheet.getRow(footerStart).getCell(2);
    summaryCell.value = `Утверждено к допуску: ${rows.length} человек`;
    summaryCell.font = footerFont;
    summaryCell.alignment = { horizontal: 'left' };

    /* "Директор" + ФИО */
    const directorLabelCell = sheet.getRow(footerStart + 1).getCell(2);
    directorLabelCell.value = 'Директор';
    directorLabelCell.font = footerFont;
    directorLabelCell.alignment = { horizontal: 'left' };

    const directorNameCell = sheet.getRow(footerStart + 1).getCell(3);
    directorNameCell.value = state.meta.director || config.placeholders.missing;
    directorNameCell.font = footerFont;
    directorNameCell.alignment = { horizontal: 'center' };
    if (!state.meta.director) directorNameCell.fill = warningFill;

    /* "Дата: dd.mm.yyyy" */
    const dateCell = sheet.getRow(footerStart + 2).getCell(2);
    dateCell.value = `Дата: ${utils.formatDate(state.meta.submissionDate) || config.placeholders.missing}`;
    dateCell.font = footerFont;
    dateCell.alignment = { horizontal: 'left' };
    if (!state.meta.submissionDate) dateCell.fill = warningFill;

    /* Update header area: school name and submission date */
    sheet.getCell('C3').value = state.meta.schoolName || config.placeholders.missing;
    sheet.getCell('B4').value = `Дата предоставления:   ${utils.formatLongDate(state.meta.submissionDate) || config.placeholders.missing}`;
    if (!state.meta.schoolName) sheet.getCell('C3').fill = warningFill;
    if (!state.meta.submissionDate) sheet.getCell('B4').fill = warningFill;

    const buffer = await workbook.xlsx.writeBuffer();
    utils.downloadBlob(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `Заявка_ГТО_${utils.slugify(state.meta.schoolName || 'школа')}.xlsx`
    );
  }

  window.GTOApp.exporter = { exportApplication };
})();
