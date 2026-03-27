(function () {
  window.GTOApp = window.GTOApp || {};
  const { config, utils } = window.GTOApp;
  const warningFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4CCCC' } };

  /* Copy cell style (font, border, alignment, numFmt) from a source row to a target row */
  function copyRowStyle(sourceRow, targetRow, colCount) {
    targetRow.height = sourceRow.height;
    for (let col = 1; col <= colCount; col += 1) {
      const src = sourceRow.getCell(col);
      const tgt = targetRow.getCell(col);
      if (src.font) tgt.font = Object.assign({}, src.font);
      if (src.border) tgt.border = Object.assign({}, src.border);
      if (src.alignment) tgt.alignment = Object.assign({}, src.alignment);
      if (src.numFmt) tgt.numFmt = src.numFmt;
    }
  }

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

    /* Capture style from the first data row in the template for new rows */
    const styleSourceRow = sheet.getRow(startRow);

    /* Write participant data */
    rows.forEach((rowData, index) => {
      const row = sheet.getRow(startRow + index);
      /* Ensure styling is applied to all rows (not just template rows) */
      if (index > 0) copyRowStyle(styleSourceRow, row, colCount);

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

    /* Clear any leftover rows between the last data row and the original template's footer area */
    const templateSummaryRow = state.analysis.template.summaryRowIndex + 1;
    const templateDirectorRow = state.analysis.template.directorRowIndex + 1;
    const templateDateRow = state.analysis.template.dateRowIndex + 1;
    const dataEndRow = startRow + rows.length;

    for (let rowIndex = dataEndRow; rowIndex < templateSummaryRow; rowIndex += 1) {
      const row = sheet.getRow(rowIndex);
      for (let col = 1; col <= colCount; col += 1) {
        row.getCell(col).value = null;
        row.getCell(col).fill = {};
      }
    }

    /* Update summary row */
    if (templateSummaryRow > 0) {
      const summaryRow = sheet.getRow(templateSummaryRow);
      summaryRow.getCell(2).value = `Утверждено к допуску: ${rows.length} человек`;
    }

    /* Update director row */
    if (templateDirectorRow > 0) {
      const directorCell = sheet.getRow(templateDirectorRow).getCell(3);
      directorCell.value = state.meta.director || config.placeholders.missing;
      if (!state.meta.director) directorCell.fill = warningFill;
    }

    /* Update date row */
    if (templateDateRow > 0) {
      const dateCell = sheet.getRow(templateDateRow).getCell(2);
      dateCell.value = `Дата: ${utils.formatDate(state.meta.submissionDate) || config.placeholders.missing}`;
      if (!state.meta.submissionDate) dateCell.fill = warningFill;
    }

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
