(function () {
  window.GTOApp = window.GTOApp || {};
  const { mapper, normalizer, calculations, utils } = window.GTOApp;

  function readWorkbookFromBytes(byteArray) {
    return XLSX.read(byteArray, { type: 'array', cellDates: true });
  }

  function sheetToMatrix(sheet) {
    return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: false });
  }

  function findSchoolHeaderRow(matrix) {
    for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 10); rowIndex += 1) {
      const joined = (matrix[rowIndex] || []).map((cell) => normalizer.normalizeHeader(cell)).join(' | ');
      if (joined.includes('фио') && joined.includes('уин')) return rowIndex;
    }
    return 0;
  }

  function parseSchoolWorkbook(serializedFile, manualSelection) {
    const workbook = readWorkbookFromBytes(utils.base64ToUint8Array(serializedFile.base64));
    const classes = [];
    const allStudents = [];
    const issues = [];

    workbook.SheetNames.forEach((sheetName) => {
      const matrix = sheetToMatrix(workbook.Sheets[sheetName]);
      if (!matrix.length) return;
      const headerRowIndex = findSchoolHeaderRow(matrix);
      const headers = matrix[headerRowIndex].map((cell) => utils.safeText(cell));
      const selection = manualSelection || mapper.mappingToSelectable(headers, mapper.matchSchoolHeaders(headers));
      const resolved = mapper.resolveSelection(selection, headers);
      const rows = matrix.slice(headerRowIndex + 1).filter((row) => row.some((cell) => utils.safeText(cell)));
      const students = rows.map((row, index) => {
        const fullName = utils.safeText(row[resolved.fullName.index], '');
        return {
          id: `${sheetName}-${index}-${normalizer.normalizeFio(fullName)}`,
          className: normalizer.normalizeClassName(sheetName),
          sourceSheet: sheetName,
          order: utils.safeText(row[resolved.order.index], String(index + 1)),
          fullName,
          uin: normalizer.cleanUin(row[resolved.uin.index]),
          source: 'school'
        };
      }).filter((student) => student.fullName);

      if (!students.length) {
        issues.push({ severity: 'warning', title: `Лист "${sheetName}" не распознан`, message: 'На листе не найдено строк с ФИО. Возможно, структура изменилась.' });
      }

      classes.push({ name: normalizer.normalizeClassName(sheetName), originalName: sheetName, students: utils.sortByText(students, (item) => item.fullName), headers, mapping: selection });
      allStudents.push(...students);
    });

    return { sheetNames: workbook.SheetNames, classes: utils.sortByText(classes, (item) => item.name), allStudents: utils.sortByText(allStudents, (item) => item.fullName), issues };
  }

  function buildCombinedAsuHeaders(matrix) {
    const first = matrix[8] || [];
    const second = matrix[9] || [];
    const width = Math.max(first.length, second.length);
    const headers = [];
    for (let index = 0; index < width; index += 1) {
      const top = utils.safeText(first[index]);
      const bottom = utils.safeText(second[index]);
      headers.push(top && bottom ? `${top} | ${bottom}` : top || bottom || `Колонка ${index + 1}`);
    }
    return headers;
  }

  function excelSerialToDate(value) {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? new Date(parsed.y, parsed.m - 1, parsed.d) : null;
  }

  function parseAsuWorkbook(serializedFile, manualSelection) {
    const workbook = readWorkbookFromBytes(utils.base64ToUint8Array(serializedFile.base64));
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = sheetToMatrix(sheet);
    const headers = buildCombinedAsuHeaders(matrix);
    const selection = manualSelection || mapper.mappingToSelectable(headers, mapper.matchAsuHeaders(headers));
    const resolved = mapper.resolveSelection(selection, headers);
    const rows = matrix.slice(10).filter((row) => row.some((cell) => utils.safeText(cell)));
    const records = rows.map((row, index) => {
      const birthRaw = row[resolved.birthDate.index];
      const birthDate = birthRaw && !Number.isNaN(Number(birthRaw)) ? excelSerialToDate(Number(birthRaw)) : utils.parseDateValue(birthRaw);
      return {
        id: `asu-${index}`,
        className: normalizer.normalizeClassName(row[resolved.className.index]),
        surname: utils.safeText(row[resolved.surname.index]),
        name: utils.safeText(row[resolved.name.index]),
        patronymic: utils.safeText(row[resolved.patronymic.index]),
        fullName: normalizer.joinFio([row[resolved.surname.index], row[resolved.name.index], row[resolved.patronymic.index]]),
        gender: normalizer.toGenderLabel(row[resolved.gender.index]),
        birthDate: birthDate ? birthDate.toISOString() : '',
        documentType: utils.safeText(row[resolved.documentType.index]),
        documentSeries: utils.safeText(row[resolved.documentSeries.index]),
        documentNumber: utils.safeText(row[resolved.documentNumber.index]),
        residenceLocality: utils.safeText(row[resolved.residenceLocality.index]),
        residenceStreetName: utils.safeText(row[resolved.residenceStreetName.index]),
        residenceStreetType: utils.safeText(row[resolved.residenceStreetType.index]),
        residenceHouse: utils.safeText(row[resolved.residenceHouse.index]),
        residenceBuilding: utils.safeText(row[resolved.residenceBuilding.index]),
        residenceApartment: utils.safeText(row[resolved.residenceApartment.index])
      };
    }).filter((record) => record.fullName);
    return { sheetNames: workbook.SheetNames, headers, mapping: selection, records, issues: [] };
  }

  function parseTemplateWorkbook(serializedFile) {
    const workbook = readWorkbookFromBytes(utils.base64ToUint8Array(serializedFile.base64));
    const applicationSheetName = workbook.SheetNames.find((name) => normalizer.normalizeHeader(name).includes('заяв'));
    const stageSheetName = workbook.SheetNames.find((name) => normalizer.normalizeHeader(name).includes('ступ'));
    const applicationMatrix = sheetToMatrix(workbook.Sheets[applicationSheetName]);
    const stageMatrix = sheetToMatrix(workbook.Sheets[stageSheetName]);

    let headerRowIndex = 5;
    applicationMatrix.forEach((row, index) => {
      const joined = row.map((cell) => normalizer.normalizeHeader(cell)).join(' | ');
      if (joined.includes('уин участника') || joined.includes('ф.и.о.')) headerRowIndex = index;
    });

    const stages = stageMatrix.slice(2).map((row) => {
      const stageName = utils.safeText(row[0]);
      const rangeText = utils.safeText(row[1]);
      const range = calculations.parseStageRange(rangeText);
      if (!stageName || !range) return null;
      return { stageName: stageName.trim(), rangeText, min: range.min, max: range.max, label: `${stageName.trim()} (${rangeText})` };
    }).filter(Boolean);

    const summaryRowIndex = applicationMatrix.findIndex((row) => row.some((cell) => utils.safeText(cell).includes('Утверждено к допуску')));
    const directorRowIndex = applicationMatrix.findIndex((row) => row.some((cell) => utils.safeText(cell).includes('Директор')));
    const dateRowIndex = applicationMatrix.findIndex((row) => row.some((cell) => utils.safeText(cell).startsWith('Дата:')));

    return {
      sheetNames: workbook.SheetNames,
      applicationSheetName,
      stageSheetName,
      headerRowIndex,
      dataStartRow: headerRowIndex + 1,
      summaryRowIndex,
      directorRowIndex,
      dateRowIndex,
      stages,
      issues: []
    };
  }

  window.GTOApp.excelReader = { parseSchoolWorkbook, parseAsuWorkbook, parseTemplateWorkbook };
})();
