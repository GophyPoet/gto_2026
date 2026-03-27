(function () {
  window.GTOApp = window.GTOApp || {};
  const { mapper, normalizer, calculations, utils } = window.GTOApp;

  function readWorkbookFromBytes(byteArray) {
    return XLSX.read(byteArray, { type: 'array', cellDates: true });
  }

  function sheetToMatrix(sheet) {
    return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: false });
  }

  /* Preserve blank rows so row indices match the real spreadsheet */
  function sheetToRawMatrix(sheet) {
    return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: true });
  }

  function findSchoolHeaderRow(matrix) {
    for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 15); rowIndex += 1) {
      const joined = (matrix[rowIndex] || []).map((cell) => normalizer.normalizeHeader(cell)).join(' | ');
      if (joined.includes('фио') || joined.includes('ф.и.о')) {
        if (joined.includes('уин') || joined.includes('win') || joined.includes('uin')) return rowIndex;
      }
    }
    /* Fallback: look for a row with at least "фио" */
    for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 15); rowIndex += 1) {
      const joined = (matrix[rowIndex] || []).map((cell) => normalizer.normalizeHeader(cell)).join(' | ');
      if (joined.includes('фио') || joined.includes('ф.и.о')) return rowIndex;
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
      const selection = (manualSelection && Object.keys(manualSelection).length > 0)
        ? manualSelection
        : mapper.mappingToSelectable(headers, mapper.matchSchoolHeaders(headers));
      const resolved = mapper.resolveSelection(selection, headers);
      const rows = matrix.slice(headerRowIndex + 1).filter((row) => row.some((cell) => utils.safeText(cell)));
      const students = rows.map((row, index) => {
        const fullNameIdx = resolved.fullName ? resolved.fullName.index : null;
        const orderIdx = resolved.order ? resolved.order.index : null;
        const uinIdx = resolved.uin ? resolved.uin.index : null;
        const fullName = fullNameIdx !== null ? utils.safeText(row[fullNameIdx], '') : '';
        return {
          id: `${sheetName}-${index}-${normalizer.normalizeFio(fullName)}`,
          className: normalizer.normalizeClassName(sheetName),
          sourceSheet: sheetName,
          order: orderIdx !== null ? utils.safeText(row[orderIdx], String(index + 1)) : String(index + 1),
          fullName,
          uin: uinIdx !== null ? normalizer.cleanUin(row[uinIdx]) : '',
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

  /* Auto-detect ASU header rows by searching for known keywords (фамилия, имя, пол, класс) */
  function findAsuHeaderRows(matrix) {
    const keywords = ['фамилия', 'имя', 'пол', 'класс', 'дата рождения'];
    for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 20); rowIndex += 1) {
      const row = matrix[rowIndex] || [];
      const joined = row.map((cell) => normalizer.normalizeHeader(cell)).join(' | ');
      const matchCount = keywords.filter((keyword) => joined.includes(keyword)).length;
      if (matchCount >= 3) {
        /* Check if the NEXT row is a sub-header row (has content but fewer keyword matches) */
        const nextRow = rowIndex + 1 < matrix.length ? matrix[rowIndex + 1] || [] : [];
        const nextJoined = nextRow.map((cell) => normalizer.normalizeHeader(cell)).join(' | ');
        const nextMatchCount = keywords.filter((keyword) => nextJoined.includes(keyword)).length;
        const nextHasContent = nextRow.some((cell) => utils.safeText(cell));
        if (nextHasContent && nextMatchCount < matchCount) {
          /* Two-row header: main keywords row + sub-header row below */
          return { firstRow: rowIndex, lastRow: rowIndex + 1, dataStartRow: rowIndex + 2 };
        }
        /* Also check if the PREVIOUS row is a parent header */
        const prevRow = rowIndex > 0 ? matrix[rowIndex - 1] || [] : [];
        const prevHasContent = prevRow.some((cell) => utils.safeText(cell));
        return { firstRow: prevHasContent ? rowIndex - 1 : rowIndex, lastRow: rowIndex, dataStartRow: rowIndex + 1 };
      }
    }
    /* Fallback: try the old hardcoded positions */
    return { firstRow: 8, lastRow: 9, dataStartRow: 10 };
  }

  function buildCombinedAsuHeaders(matrix, firstRow, lastRow) {
    const first = matrix[firstRow] || [];
    const second = firstRow !== lastRow ? (matrix[lastRow] || []) : [];
    const width = Math.max(first.length, second.length);
    const headers = [];
    /* Track the last non-empty parent header so sub-columns inherit it */
    let lastParent = '';
    for (let index = 0; index < width; index += 1) {
      const top = utils.safeText(first[index]);
      const bottom = utils.safeText(second[index]);
      if (top) lastParent = top;
      if (top && bottom) {
        headers.push(`${top} | ${bottom}`);
      } else if (bottom && !top && lastParent) {
        /* Sub-header without its own parent — inherit the last parent */
        headers.push(`${lastParent} | ${bottom}`);
      } else {
        headers.push(top || bottom || `Колонка ${index + 1}`);
      }
    }
    return headers;
  }

  function excelSerialToDate(value) {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? new Date(parsed.y, parsed.m - 1, parsed.d) : null;
  }

  function safeResolvedIndex(resolved, field) {
    return resolved[field] && resolved[field].index !== null ? resolved[field].index : null;
  }

  function safeCell(row, index) {
    return index !== null ? row[index] : undefined;
  }

  function parseAsuWorkbook(serializedFile, manualSelection) {
    const workbook = readWorkbookFromBytes(utils.base64ToUint8Array(serializedFile.base64));
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    /* Use raw matrix (with blank rows preserved) so row indices match the real sheet */
    const matrix = sheetToRawMatrix(sheet);
    const headerInfo = findAsuHeaderRows(matrix);
    const headers = buildCombinedAsuHeaders(matrix, headerInfo.firstRow, headerInfo.lastRow);
    const selection = (manualSelection && Object.keys(manualSelection).length > 0)
      ? manualSelection
      : mapper.mappingToSelectable(headers, mapper.matchAsuHeaders(headers));
    const resolved = mapper.resolveSelection(selection, headers);
    const rows = matrix.slice(headerInfo.dataStartRow).filter((row) => row.some((cell) => utils.safeText(cell)));
    const records = rows.map((row, index) => {
      const birthIdx = safeResolvedIndex(resolved, 'birthDate');
      const birthRaw = safeCell(row, birthIdx);
      let birthDate = null;
      if (birthRaw) {
        if (!Number.isNaN(Number(birthRaw)) && Number(birthRaw) > 100) {
          birthDate = excelSerialToDate(Number(birthRaw));
        } else {
          birthDate = utils.parseDateValue(birthRaw);
        }
      }
      return {
        id: `asu-${index}`,
        className: normalizer.normalizeClassName(safeCell(row, safeResolvedIndex(resolved, 'className'))),
        surname: utils.safeText(safeCell(row, safeResolvedIndex(resolved, 'surname'))),
        name: utils.safeText(safeCell(row, safeResolvedIndex(resolved, 'name'))),
        patronymic: utils.safeText(safeCell(row, safeResolvedIndex(resolved, 'patronymic'))),
        fullName: normalizer.joinFio([
          safeCell(row, safeResolvedIndex(resolved, 'surname')),
          safeCell(row, safeResolvedIndex(resolved, 'name')),
          safeCell(row, safeResolvedIndex(resolved, 'patronymic'))
        ]),
        gender: normalizer.toGenderLabel(safeCell(row, safeResolvedIndex(resolved, 'gender'))),
        birthDate: birthDate ? birthDate.toISOString() : '',
        documentType: utils.safeText(safeCell(row, safeResolvedIndex(resolved, 'documentType'))),
        documentSeries: utils.safeText(safeCell(row, safeResolvedIndex(resolved, 'documentSeries'))),
        documentNumber: utils.safeText(safeCell(row, safeResolvedIndex(resolved, 'documentNumber'))),
        residenceLocality: utils.safeText(safeCell(row, safeResolvedIndex(resolved, 'residenceLocality'))),
        residenceStreetName: utils.safeText(safeCell(row, safeResolvedIndex(resolved, 'residenceStreetName'))),
        residenceStreetType: utils.safeText(safeCell(row, safeResolvedIndex(resolved, 'residenceStreetType'))),
        residenceHouse: utils.safeText(safeCell(row, safeResolvedIndex(resolved, 'residenceHouse'))),
        residenceBuilding: utils.safeText(safeCell(row, safeResolvedIndex(resolved, 'residenceBuilding'))),
        residenceApartment: utils.safeText(safeCell(row, safeResolvedIndex(resolved, 'residenceApartment')))
      };
    }).filter((record) => record.fullName);
    return { sheetNames: workbook.SheetNames, headers, mapping: selection, records, issues: [] };
  }

  function parseTemplateWorkbook(serializedFile) {
    const workbook = readWorkbookFromBytes(utils.base64ToUint8Array(serializedFile.base64));
    const applicationSheetName = workbook.SheetNames.find((name) => normalizer.normalizeHeader(name).includes('заяв'));
    const stageSheetName = workbook.SheetNames.find((name) => normalizer.normalizeHeader(name).includes('ступ'));
    /* Use raw matrix to preserve row indices — important for exporter cell references */
    const applicationMatrix = sheetToRawMatrix(workbook.Sheets[applicationSheetName]);
    const stageMatrix = sheetToRawMatrix(workbook.Sheets[stageSheetName]);

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
