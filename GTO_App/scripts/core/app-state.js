(function () {
  window.GTOApp = window.GTOApp || {};
  const { storage, utils, mapper, normalizer, calculations, config } = window.GTOApp;

  const emptyState = {
    currentStep: 'prepare',
    meta: { schoolName: '', director: '', responsiblePerson: '', responsiblePhone: '', submissionDate: '', eventDate: '', workingFolderSelected: false },
    files: { school: null, template: null, asu: null },
    analysis: { school: null, asu: null, template: null, issues: [], structureReport: null },
    mappings: { school: {}, asu: {} },
    selectedParticipants: [],
    manualParticipants: [],
    standardsSelections: {},
    generatedRows: []
  };

  let state = storage.load() || utils.clone(emptyState);

  function save() { storage.save(state); }
  function getState() { return state; }

  /**
   * INTEGRATION POINT: Re-load state from storage after async session init.
   * Called once by app.js after storage.initSession() resolves.
   */
  function reloadFromStorage() {
    state = storage.load() || utils.clone(emptyState);
  }
  function replaceState(nextState) { state = { ...utils.clone(emptyState), ...nextState }; save(); }
  function updateMeta(patch) { state.meta = { ...state.meta, ...patch }; save(); }
  function setCurrentStep(step) { state.currentStep = step; save(); }
  function setFiles(filesPatch) { state.files = { ...state.files, ...filesPatch }; save(); }
  function setAnalysis(analysisPatch) { state.analysis = { ...state.analysis, ...analysisPatch }; save(); }
  function setMappings(mappingsPatch) { state.mappings = { ...state.mappings, ...mappingsPatch }; save(); }
  function setManualParticipants(items) { state.manualParticipants = items; save(); }

  function addParticipant(participant) {
    const normalizedName = normalizer.normalizeFio(participant.fullName);
    const exists = state.selectedParticipants.some((item) => normalizer.normalizeFio(item.fullName) === normalizedName);
    if (!exists) {
      state.selectedParticipants.push(participant);
      state.selectedParticipants = utils.sortByText(state.selectedParticipants, (item) => item.fullName);
      save();
    }
  }

  function removeParticipant(id) {
    state.selectedParticipants = state.selectedParticipants.filter((item) => item.id !== id);
    if (state.standardsSelections && state.standardsSelections[id]) {
      delete state.standardsSelections[id];
    }
    save();
  }

  function setStandardsSelections(selections) {
    state.standardsSelections = selections;
    save();
  }

  function getStandardsSelections() {
    return state.standardsSelections || {};
  }

  function addManualParticipant(participant) {
    state.manualParticipants.push(participant);
    addParticipant(participant);
    save();
  }

  function buildStructureReport() {
    if (!state.analysis.school || !state.analysis.asu || !state.analysis.template) return null;
    const asuLookup = mapper.buildAsuLookup(state.analysis.asu.records);
    let matched = 0;
    let missingInAsu = 0;
    let missingUin = 0;

    state.analysis.school.allStudents.forEach((student) => {
      if (asuLookup.find(student.fullName)) matched += 1;
      else missingInAsu += 1;
      if (!student.uin || student.uin === '-') missingUin += 1;
    });

    state.analysis.structureReport = {
      classesCount: state.analysis.school.classes.length,
      schoolStudentsCount: state.analysis.school.allStudents.length,
      asuStudentsCount: state.analysis.asu.records.length,
      matchedByName: matched,
      missingInAsu,
      missingUin,
      templateSheets: state.analysis.template.sheetNames.length,
      stagesCount: state.analysis.template.stages.length
    };
    save();
    return state.analysis.structureReport;
  }

  function valueMeta(value, problem) {
    return { value, problem: Boolean(problem) };
  }

  function fieldToLabel(field) {
    const labels = {
      fullName: 'ФИО',
      uin: 'УИН',
      gender: 'пол',
      schoolName: 'место учебы',
      stage: 'ступень',
      birthDateRaw: 'дата рождения',
      age: 'возраст',
      documentNumber: 'номер документа',
      className: 'класс',
      address: 'адрес'
    };
    return labels[field] || field;
  }

  function buildGeneratedRows() {
    const asuLookup = mapper.buildAsuLookup(state.analysis.asu ? state.analysis.asu.records : []);
    const stages = state.analysis.template ? state.analysis.template.stages : [];
    const rows = utils.sortByText(state.selectedParticipants, (item) => item.fullName).map((participant, index) => {
      const asuRecord = asuLookup.find(participant.fullName) || {};
      const schoolName = participant.schoolName || state.meta.schoolName || config.placeholders.missing;
      const gender = participant.gender || asuRecord.gender || '';
      const birthDateRaw = participant.birthDate || asuRecord.birthDate || '';
      const ageValue = participant.age !== undefined && participant.age !== null ? participant.age : calculations.calculateAgeOnDate(birthDateRaw, state.meta.eventDate);
      const stageMeta = participant.stage ? { stageName: participant.stage, label: participant.stage } : calculations.resolveStage(ageValue, stages);
      const docSeries = participant.documentSeries || asuRecord.documentSeries || '';
      const docNumber = participant.documentNumber || asuRecord.documentNumber || '';
      const documentNumber = (docSeries && docNumber)
        ? `${docSeries} ${docNumber}`
        : docSeries || docNumber || '';
      const address = participant.address || normalizer.buildAddress(asuRecord);

      const row = {
        sequence: index + 1,
        sourceId: participant.id,
        fullName: valueMeta(participant.fullName, !participant.fullName),
        uin: valueMeta(participant.uin || config.placeholders.missing, !participant.uin || participant.uin === config.placeholders.missing),
        gender: valueMeta(gender || config.placeholders.missing, !gender),
        schoolName: valueMeta(schoolName, !state.meta.schoolName && !participant.schoolName),
        stage: valueMeta(stageMeta ? stageMeta.label : config.placeholders.missing, !stageMeta),
        birthDateRaw: valueMeta(birthDateRaw || config.placeholders.missing, !birthDateRaw),
        birthDateDisplay: utils.formatDate(birthDateRaw) || config.placeholders.missing,
        age: valueMeta(ageValue === null || ageValue === undefined ? config.placeholders.missing : String(ageValue), ageValue === null || ageValue === undefined),
        documentNumber: valueMeta(documentNumber || config.placeholders.missing, !documentNumber),
        className: valueMeta(participant.className || asuRecord.className || config.placeholders.missing, !participant.className && !asuRecord.className),
        address: valueMeta(address || config.placeholders.missing, !address),
        issues: []
      };

      Object.entries(row).forEach(([field, meta]) => {
        if (meta && meta.problem) row.issues.push(`${participant.fullName}: не заполнено поле "${fieldToLabel(field)}"`);
      });
      return row;
    });

    state.generatedRows = rows;
    state.analysis.issues = rows.flatMap((row) => row.issues.map((message) => ({ severity: 'warning', title: 'Нужно проверить поле', message })));
    save();
    return rows;
  }

  window.GTOApp.appState = {
    getState,
    replaceState,
    updateMeta,
    setCurrentStep,
    setFiles,
    setAnalysis,
    setMappings,
    addParticipant,
    removeParticipant,
    addManualParticipant,
    setManualParticipants,
    setStandardsSelections,
    getStandardsSelections,
    buildStructureReport,
    buildGeneratedRows,
    reloadFromStorage,
    save
  };
})();
