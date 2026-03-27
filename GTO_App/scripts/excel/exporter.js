(function () {
  window.GTOApp = window.GTOApp || {};
  const { config, utils } = window.GTOApp;
  const warningFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4CCCC' } };

  async function exportApplication(state, rows) {
    if (!state.files.template) throw new Error('Не загружен шаблон заявки.');

    const workbook = new ExcelJS.Workbook();
    const templateBytes = utils.base64ToUint8Array(state.files.template.base64);
    const templateBuffer = templateBytes.buffer.slice(templateBytes.byteOffset, templateBytes.byteOffset + templateBytes.byteLength);
    await workbook.xlsx.load(templateBuffer);

    const sheet = workbook.getWorksheet(state.analysis.template.applicationSheetName);
    const startRow = state.analysis.template.dataStartRow + 1;

    rows.forEach((rowData, index) => {
      const row = sheet.getRow(startRow + index);
      row.getCell(1).value = index + 1;
      row.getCell(2).value = rowData.fullName.value;
      row.getCell(3).value = rowData.uin.value;
      row.getCell(4).value = rowData.gender.value;
      row.getCell(5).value = rowData.schoolName.value;
      row.getCell(6).value = rowData.stage.value;
      const birthDate = utils.parseDateValue(rowData.birthDateRaw.value);
      row.getCell(7).value = birthDate || config.placeholders.missing;
      row.getCell(8).value = rowData.age.value;
      row.getCell(9).value = rowData.documentNumber.value;
      row.getCell(10).value = rowData.className.value;
      row.getCell(11).value = rowData.address.value;

      const map = { fullName: 2, uin: 3, gender: 4, schoolName: 5, stage: 6, birthDateRaw: 7, age: 8, documentNumber: 9, className: 10, address: 11 };
      Object.entries(map).forEach(([field, column]) => {
        if (rowData[field].problem) row.getCell(column).fill = warningFill;
      });
    });

    const summaryRowIndex = state.analysis.template.summaryRowIndex;
    for (let rowIndex = startRow + rows.length; rowIndex < summaryRowIndex; rowIndex += 1) {
      const row = sheet.getRow(rowIndex);
      for (let cellIndex = 1; cellIndex <= 11; cellIndex += 1) {
        row.getCell(cellIndex).value = null;
        row.getCell(cellIndex).fill = undefined;
      }
    }

    if (summaryRowIndex > -1) sheet.getRow(summaryRowIndex + 1).getCell(2).value = `Утверждено к допуску: ${rows.length} человек`;
    if (state.analysis.template.directorRowIndex > -1) {
      const directorCell = sheet.getRow(state.analysis.template.directorRowIndex + 1).getCell(3);
      directorCell.value = state.meta.director || config.placeholders.missing;
      if (!state.meta.director) directorCell.fill = warningFill;
    }
    if (state.analysis.template.dateRowIndex > -1) {
      const dateCell = sheet.getRow(state.analysis.template.dateRowIndex + 1).getCell(2);
      dateCell.value = `Дата: ${utils.formatDate(state.meta.submissionDate) || config.placeholders.missing}`;
      if (!state.meta.submissionDate) dateCell.fill = warningFill;
    }

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
