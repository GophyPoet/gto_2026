/**
 * med-exporter.js — Generates medical request Excel ("Медзаявка ГТО")
 * based on the embedded template from med-template.js.
 *
 * Template structure (from "Мед.заявка ГТО 20.05.2026.xlsx"):
 *   Row 1: "Заявка" (A1:G1 merged, 16pt Times New Roman bold, center)
 *   Row 2: " на прохождение тестирования..." (A2:G2 merged, 14pt TNR bold, center, wrap)
 *   Row 3: empty (A3:G3 merged)
 *   Row 4: empty
 *   Row 5: Header row (A-H: №, ФИО, пол, место учебы, класс, дата рождения, допуск врача, подпись врача)
 *          14pt Times New Roman bold, center/center, wrap, thin borders
 *   Rows 6+: Data rows (13pt TNR, h=30, thin borders all)
 *   After last data row: 1 empty row, then footer block (rows 203-212 pattern)
 */
(function () {
  window.GTOApp = window.GTOApp || {};
  var utils = window.GTOApp.utils;

  /* Template constants */
  var DATA_START_ROW = 6;
  var HEADER_ROW = 5;
  var COL_COUNT = 8; /* A through H */

  /* Deep-clone a plain object */
  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

  /* Clear a cell completely */
  function clearCell(cell) {
    cell.value = null;
    cell.style = {};
  }

  /**
   * Export medical request Excel file.
   * @param {Object} meta - { schoolName, director, responsiblePerson, responsiblePhone, submissionDate, eventDate }
   * @param {Array} participants - selectedParticipants array from state
   */
  async function exportMedicalRequest(meta, participants) {
    var templateBase64 = window.GTOApp.medTemplateBase64;
    if (!templateBase64) {
      throw new Error('Шаблон медзаявки не найден. Убедитесь, что файл med-template.js загружен.');
    }

    var workbook = new ExcelJS.Workbook();
    var templateBytes = utils.base64ToUint8Array(templateBase64);
    var templateBuffer = templateBytes.buffer.slice(
      templateBytes.byteOffset,
      templateBytes.byteOffset + templateBytes.byteLength
    );
    await workbook.xlsx.load(templateBuffer);

    var sheet = workbook.getWorksheet('Протокол') || workbook.worksheets[0];
    if (!sheet) {
      throw new Error('Лист "Протокол" не найден в шаблоне медзаявки.');
    }

    /* --- Snapshot styles from header row 5 and data row 6 --- */
    var headerStyles = [];
    var headerRow = sheet.getRow(HEADER_ROW);
    for (var c = 1; c <= COL_COUNT; c++) {
      var hc = headerRow.getCell(c);
      headerStyles.push({
        font: hc.font ? deepClone(hc.font) : null,
        border: hc.border ? deepClone(hc.border) : null,
        alignment: hc.alignment ? deepClone(hc.alignment) : null
      });
    }
    var headerHeight = headerRow.height;

    var dataStyles = [];
    var sampleDataRow = sheet.getRow(DATA_START_ROW);
    for (var c2 = 1; c2 <= COL_COUNT; c2++) {
      var dc = sampleDataRow.getCell(c2);
      dataStyles.push({
        font: dc.font ? deepClone(dc.font) : null,
        border: dc.border ? deepClone(dc.border) : null,
        alignment: dc.alignment ? deepClone(dc.alignment) : null
      });
    }
    var dataRowHeight = sampleDataRow.height || 30;

    /* --- Clear ALL old data rows (rows 6 through end of template) --- */
    var maxOldRow = sheet.rowCount;
    for (var r = DATA_START_ROW; r <= maxOldRow; r++) {
      var row = sheet.getRow(r);
      for (var cl = 1; cl <= COL_COUNT; cl++) {
        clearCell(row.getCell(cl));
      }
      row.height = undefined;
    }

    /* --- Update header --- */
    /* Row 2: school name in the subtitle */
    var schoolName = meta.schoolName || '';
    var subtitleText = ' на прохождение тестирования в рамках Всероссийского физкультурно-спортивного комплекса "Готов к труду и обороне" ' + schoolName;
    sheet.getCell('A2').value = subtitleText;

    /* --- Re-apply header row styles (row 5) --- */
    var hdrRow = sheet.getRow(HEADER_ROW);
    hdrRow.height = headerHeight;
    var headerValues = ['№\n п/п', 'Ф.И.О.', 'пол', 'место учебы (работы) \n(при наличии)               ', 'класс', 'Дата рождения', 'Допуск врача', 'Подпись врача'];
    for (var h = 1; h <= COL_COUNT; h++) {
      var hCell = hdrRow.getCell(h);
      hCell.value = headerValues[h - 1];
      if (headerStyles[h - 1].font) hCell.font = deepClone(headerStyles[h - 1].font);
      if (headerStyles[h - 1].border) hCell.border = deepClone(headerStyles[h - 1].border);
      if (headerStyles[h - 1].alignment) hCell.alignment = deepClone(headerStyles[h - 1].alignment);
    }

    /* --- Sort participants alphabetically --- */
    var sorted = participants.slice().sort(function (a, b) {
      return (a.fullName || '').localeCompare(b.fullName || '', 'ru');
    });

    /* --- Write participant data --- */
    function applyDataStyle(targetRow) {
      targetRow.height = dataRowHeight;
      for (var col = 1; col <= COL_COUNT; col++) {
        var tgt = targetRow.getCell(col);
        var style = dataStyles[col - 1];
        if (style.font) tgt.font = deepClone(style.font);
        if (style.border) tgt.border = deepClone(style.border);
        if (style.alignment) tgt.alignment = deepClone(style.alignment);
      }
    }

    for (var i = 0; i < sorted.length; i++) {
      var p = sorted[i];
      var dataRow = sheet.getRow(DATA_START_ROW + i);
      applyDataStyle(dataRow);

      /* Column A: sequence number */
      dataRow.getCell(1).value = i + 1;
      /* Column B: ФИО */
      dataRow.getCell(2).value = p.fullName || '';
      /* Column C: пол */
      var gender = (p.gender || '').trim();
      /* Normalize gender to capitalized form */
      if (gender) {
        var gl = gender.toLowerCase();
        if (gl === 'м' || gl === 'муж' || gl === 'мужской') gender = 'Мужской';
        else if (gl === 'ж' || gl === 'жен' || gl === 'женский') gender = 'Женский';
        else gender = gender.charAt(0).toUpperCase() + gender.slice(1);
      }
      dataRow.getCell(3).value = gender;
      /* Column D: место учебы */
      dataRow.getCell(4).value = p.schoolName || meta.schoolName || '';
      /* Column E: класс */
      dataRow.getCell(5).value = p.className || '';
      /* Column F: дата рождения (dd.mm.yyyy) */
      var birthDate = '';
      if (p.birthDate) {
        birthDate = utils.formatDate(p.birthDate);
      }
      dataRow.getCell(6).value = birthDate;
      /* Column G: допуск врача */
      dataRow.getCell(7).value = 'Допущен';
      /* Column H: подпись врача — leave empty for manual signing */
    }

    /* --- Footer block (after last participant + 1 empty row) --- */
    var lastDataRow = DATA_START_ROW + sorted.length - 1;
    var footerStart = lastDataRow + 2; /* one empty row gap */

    var footerFont14 = { name: 'Times New Roman', size: 14, bold: false };
    var leftAlign = { horizontal: 'left' };

    /* Row footerStart (analog of row 203): "Количество допущенных N человек" + "дата" */
    var fr203 = sheet.getRow(footerStart);
    fr203.height = 18;
    fr203.getCell(2).value = 'Количество допущенных  ' + sorted.length + ' человек               ';
    fr203.getCell(2).font = deepClone(footerFont14);
    fr203.getCell(2).alignment = deepClone(leftAlign);

    /* Date in column D */
    var dateStr = '';
    if (meta.eventDate) {
      dateStr = utils.formatDate(meta.eventDate);
    } else if (meta.submissionDate) {
      dateStr = utils.formatDate(meta.submissionDate);
    }
    fr203.getCell(4).value = '                      дата ' + dateStr;
    fr203.getCell(4).font = deepClone(footerFont14);

    /* Row footerStart+1 (analog of 204): empty */
    sheet.getRow(footerStart + 1).height = 18;

    /* Row footerStart+2 (analog of 205): "Врач" */
    var fr205 = sheet.getRow(footerStart + 2);
    fr205.height = 18;
    fr205.getCell(2).value = 'Врач                                         /                                                        ';
    fr205.getCell(2).font = deepClone(footerFont14);
    fr205.getCell(2).alignment = deepClone(leftAlign);

    /* Row footerStart+3 (analog of 206): (Ф.И.О.) (подпись) */
    var fr206 = sheet.getRow(footerStart + 3);
    fr206.height = 18;
    fr206.getCell(2).value = '                               (Ф.И.О.)        (подпись)                                                                                                           ';
    fr206.getCell(2).font = deepClone(footerFont14);
    fr206.getCell(2).alignment = deepClone(leftAlign);

    /* Row footerStart+4 (analog of 207): empty */
    sheet.getRow(footerStart + 4).height = 14.4;

    /* Row footerStart+5 (analog of 208): "Ответственный ФИО / подпись / т.телефон" */
    var responsibleName = meta.responsiblePerson || '';
    var responsiblePhone = meta.responsiblePhone || '';
    var phoneStr = responsiblePhone ? '/т.' + responsiblePhone : '';
    var fr208 = sheet.getRow(footerStart + 5);
    fr208.height = 14.4;
    fr208.getCell(2).value = 'Ответственный  ' + responsibleName + ' /                       ' + phoneStr + '    ';
    fr208.getCell(2).font = deepClone(footerFont14);
    fr208.getCell(2).alignment = deepClone(leftAlign);

    /* Row footerStart+6 (analog of 209): (Ф.И.О.) (подпись) */
    var fr209 = sheet.getRow(footerStart + 6);
    fr209.height = 18;
    fr209.getCell(2).value = '                               (Ф.И.О.)        (подпись)                                                                                                           ';
    fr209.getCell(2).font = deepClone(footerFont14);
    fr209.getCell(2).alignment = deepClone(leftAlign);

    /* Row footerStart+7 (analog of 210): empty */
    sheet.getRow(footerStart + 7).height = 14.4;

    /* Row footerStart+8 (analog of 211): "Директор ФИО / подпись" */
    var directorName = meta.director || '';
    var fr211 = sheet.getRow(footerStart + 8);
    fr211.height = 14.4;
    fr211.getCell(2).value = 'Директор ' + directorName + ' /                                  ';
    fr211.getCell(2).font = deepClone(footerFont14);
    fr211.getCell(2).alignment = deepClone(leftAlign);

    /* Row footerStart+9 (analog of 212): (Ф.И.О.) (подпись) */
    var fr212 = sheet.getRow(footerStart + 9);
    fr212.height = 18;
    fr212.getCell(2).value = '                     (Ф.И.О.)        (подпись)                                                                                                           ';
    fr212.getCell(2).font = deepClone(footerFont14);
    fr212.getCell(2).alignment = deepClone(leftAlign);

    /* --- Write output --- */
    var buffer = await workbook.xlsx.writeBuffer();
    utils.downloadBlob(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      'Медзаявка_ГТО_' + utils.slugify(meta.schoolName || 'школа') + '.xlsx'
    );
  }

  window.GTOApp.medExporter = { exportMedicalRequest: exportMedicalRequest };
})();
