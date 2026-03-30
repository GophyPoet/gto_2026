(function () {
  const app = window.GTOApp;
  const { config, utils, logger, storage, excelReader, appState, normalizer, exporter } = app;

  const els = {
    stepNav: document.getElementById('stepNav'),
    screenTitle: document.getElementById('screenTitle'),
    screenDescription: document.getElementById('screenDescription'),
    prevStepBtn: document.getElementById('prevStepBtn'),
    nextStepBtn: document.getElementById('nextStepBtn'),
    projectSummary: document.getElementById('projectSummary'),
    submissionDateInput: document.getElementById('submissionDateInput'),
    eventDateInput: document.getElementById('eventDateInput'),
    schoolFileInput: document.getElementById('schoolFileInput'),
    asuFileInput: document.getElementById('asuFileInput'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    chooseFolderBtn: document.getElementById('chooseFolderBtn'),
    saveProjectBtn: document.getElementById('saveProjectBtn'),
    exportStateBtn: document.getElementById('exportStateBtn'),
    importStateInput: document.getElementById('importStateInput'),
    analysisSummary: document.getElementById('analysisSummary'),
    mappingEditor: document.getElementById('mappingEditor'),
    issuesList: document.getElementById('issuesList'),
    classTabs: document.getElementById('classTabs'),
    studentsTableWrap: document.getElementById('studentsTableWrap'),
    selectedList: document.getElementById('selectedList'),
    selectedCountBadge: document.getElementById('selectedCountBadge'),
    studentSearchInput: document.getElementById('studentSearchInput'),
    studentFilterSelect: document.getElementById('studentFilterSelect'),
    addManualBtn: document.getElementById('addManualBtn'),
    manualDialog: document.getElementById('manualDialog'),
    manualForm: document.getElementById('manualForm'),
    saveManualBtn: document.getElementById('saveManualBtn'),
    standardsWrap: document.getElementById('standardsWrap'),
    reviewStats: document.getElementById('reviewStats'),
    reviewIssues: document.getElementById('reviewIssues'),
    reviewTableWrap: document.getElementById('reviewTableWrap'),
    downloadExcelBtn: document.getElementById('downloadExcelBtn'),
    downloadCardsBtn: document.getElementById('downloadCardsBtn'),
    submissionDateExcelInput: document.getElementById('submissionDateExcelInput')
  };

  /* ---- Global school settings (shared with dashboard via localStorage) ---- */
  var GLOBAL_SETTINGS_KEY = 'gto-global-settings';
  function loadGlobalSettings() {
    try { return JSON.parse(localStorage.getItem(GLOBAL_SETTINGS_KEY)) || {}; }
    catch (e) { return {}; }
  }

  /* Standards selections: read/write through appState for persistence */
  function getStdSelections() {
    return appState.getStandardsSelections();
  }
  function setStdSelections(sel) {
    appState.setStandardsSelections(sel);
  }

  let directoryHandle = null;
  let currentClass = '';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function render() {
    const state = appState.getState();
    if (!currentClass && state.analysis.school && state.analysis.school.classes.length) {
      currentClass = state.analysis.school.classes[0].name;
    }
    renderNav();
    renderHeader();
    renderProjectSummary();
    renderPrepare();
    renderSelect();
    renderStandards();
    renderReview();
    updateButtons();
  }

  function renderNav() {
    const state = appState.getState();
    /* Hide the "prepare" step when data was loaded from school roster */
    const rosterLoaded = state.analysis && state.analysis.school &&
      state.analysis.school.allStudents && state.analysis.school.allStudents.length > 0 &&
      state.analysis.source === 'roster';
    const visibleSteps = rosterLoaded
      ? config.steps.filter((s) => s.id !== 'prepare')
      : config.steps;
    els.stepNav.innerHTML = visibleSteps.map((step, index) => `
      <button class="step-link ${step.id === state.currentStep ? 'is-active' : ''}" data-step="${step.id}" type="button">${index + 1}. ${step.title}</button>
    `).join('');
    els.stepNav.querySelectorAll('[data-step]').forEach((button) => {
      button.addEventListener('click', () => {
        if (canOpenStep(button.dataset.step)) {
          appState.setCurrentStep(button.dataset.step);
          render();
        }
      });
    });
  }

  function renderHeader() {
    const state = appState.getState();
    const step = config.steps.find((item) => item.id === state.currentStep);
    els.screenTitle.textContent = step.title;
    els.screenDescription.textContent = step.description;
    document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('is-active'));
    document.getElementById(`screen-${state.currentStep}`).classList.add('is-active');
  }

  function renderProjectSummary() {
    const state = appState.getState();
    const schoolCount = state.analysis.school ? state.analysis.school.allStudents.length : 0;
    const selectedCount = state.selectedParticipants.length;
    const issuesCount = state.analysis.issues.length;
    els.projectSummary.innerHTML = `
      <div class="summary-card"><strong>Школа</strong><div>${escapeHtml(state.meta.schoolName || 'Не указано')}</div></div>
      <div class="summary-card"><strong>Учеников в базе</strong><div>${schoolCount}</div></div>
      <div class="summary-card"><strong>Выбрано в заявку</strong><div>${selectedCount}</div></div>
      <div class="summary-card"><strong>Предупреждений</strong><div>${issuesCount}</div></div>
    `;
  }

  function collectIssues() {
    const state = appState.getState();
    const list = [];
    if (state.analysis.school) list.push(...state.analysis.school.issues);
    if (state.analysis.asu) list.push(...state.analysis.asu.issues);
    if (state.analysis.template) list.push(...state.analysis.template.issues);
    if (state.analysis.issues) list.push(...state.analysis.issues);
    return list;
  }

  function renderIssues(container, issues, emptyText) {
    if (!issues.length) {
      container.innerHTML = `<div class="empty-state">${emptyText}</div>`;
      return;
    }
    container.innerHTML = issues.map((issue) => `
      <article class="issue-card">
        <div class="status-badge ${issue.severity === 'warning' ? 'status-warn' : 'status-danger'}">${issue.severity === 'warning' ? 'Проверить' : 'Ошибка'}</div>
        <strong>${escapeHtml(issue.title)}</strong>
        <p>${escapeHtml(issue.message)}</p>
      </article>
    `).join('');
  }

  function renderPrepare() {
    const state = appState.getState();
    els.submissionDateInput.value = utils.toInputDate(state.meta.submissionDate);
    els.eventDateInput.value = utils.toInputDate(state.meta.eventDate);
    if (els.submissionDateExcelInput) {
      els.submissionDateExcelInput.value = utils.toInputDate(state.meta.submissionDate);
    }

    const report = state.analysis.structureReport;
    if (!report) {
      els.analysisSummary.innerHTML = '<div class="empty-state">После анализа здесь появятся найденные листы, классы и результаты распознавания.</div>';
    } else {
      els.analysisSummary.innerHTML = `
        <div class="status-item"><strong>Файлы распознаны</strong><small>Классов: ${report.classesCount}, учеников в базе: ${report.schoolStudentsCount}, записей АСУ: ${report.asuStudentsCount}</small></div>
        <div class="status-item"><strong>Сопоставление данных</strong><small>Совпадений по ФИО: ${report.matchedByName}, не найдено в АСУ: ${report.missingInAsu}, без УИН: ${report.missingUin}</small></div>
        <div class="status-item"><strong>Шаблон</strong><small>Листов: ${report.templateSheets}, ступеней: ${report.stagesCount}</small></div>
        <div class="status-item"><strong>Найденные классы</strong><small>${state.analysis.school.classes.map((item) => item.name).join(', ')}</small></div>
      `;
    }

    const blocks = [];
    if (state.analysis.asu) blocks.push(buildMappingCard('Файл АСУ РСО', state.analysis.asu.headers, state.mappings.asu, 'asu'));
    if (state.analysis.school && state.analysis.school.classes.length) {
      blocks.push(buildMappingCard(`Школьный файл: ${state.analysis.school.classes[0].originalName}`, state.analysis.school.classes[0].headers, state.mappings.school, 'school'));
    }
    els.mappingEditor.innerHTML = blocks.length ? blocks.join('') : '<div class="empty-state">Сначала выполните анализ файлов.</div>';
    els.mappingEditor.querySelectorAll('[data-prefix][data-field]').forEach((select) => {
      select.addEventListener('change', () => {
        const snapshot = appState.getState();
        appState.setMappings({
          [select.dataset.prefix]: {
            ...snapshot.mappings[select.dataset.prefix],
            [select.dataset.field]: select.value
          }
        });
        reanalyzeStoredFiles();
      });
    });

    renderIssues(els.issuesList, collectIssues(), 'Предупреждений пока нет.');
  }

  function buildMappingCard(title, headers, mapping, prefix) {
    return `
      <div class="status-item">
        <strong>${escapeHtml(title)}</strong>
        ${Object.entries(mapping || {}).map(([field, value]) => `
          <label>
            <span>${escapeHtml(config.fieldLabels[field] || field)}</span>
            <select data-prefix="${prefix}" data-field="${field}">
              <option value="">Не выбрано</option>
              ${headers.map((header, index) => `<option value="${index}" ${String(value) === String(index) ? 'selected' : ''}>${escapeHtml(header)}</option>`).join('')}
            </select>
          </label>
        `).join('')}
      </div>
    `;
  }

  /* Fixed extra tabs that show people from roster stores */
  const EXTRA_TABS = [
    { key: '__homeschool', label: 'Домашники', store: null },
    { key: '__staff', label: 'Работники школы', store: 'staff' },
    { key: '__parents', label: 'Родители', store: 'parents' },
    { key: '__extra', label: 'Дополнительно', store: 'extra' }
  ];

  async function renderSelect() {
    const state = appState.getState();
    if (!state.analysis.school) {
      els.studentsTableWrap.innerHTML = '<div class="empty-state">Сначала проанализируйте файлы на первом шаге.</div>';
      els.selectedList.innerHTML = '<div class="empty-state">Пока никто не выбран.</div>';
      return;
    }

    const classes = state.analysis.school.classes;
    const isExtraTab = currentClass && currentClass.startsWith('__');
    const classItem = isExtraTab ? null : (classes.find((item) => item.name === currentClass) || classes[0]);
    if (!isExtraTab) currentClass = classItem ? classItem.name : '';

    /* Build tabs: classes + separator + extra tabs */
    let tabsHtml = classes.map((item) => `
      <button class="class-tab ${item.name === currentClass ? 'is-active' : ''}" data-class="${item.name}" type="button">${item.name}</button>
    `).join('');

    tabsHtml += '<span class="class-tab-sep"></span>';

    EXTRA_TABS.forEach((tab) => {
      tabsHtml += `<button class="class-tab class-tab-fixed ${currentClass === tab.key ? 'is-active' : ''}" data-class="${tab.key}" type="button">${tab.label}</button>`;
    });

    els.classTabs.innerHTML = tabsHtml;
    els.classTabs.querySelectorAll('[data-class]').forEach((button) => {
      button.addEventListener('click', () => {
        currentClass = button.dataset.class;
        renderSelect();
      });
    });

    /* Render content based on active tab */
    const searchValue = els.studentSearchInput.value.trim();
    if (searchValue && !isExtraTab) {
      /* Cross-class search: show results from ALL classes when searching */
      renderStudentTableAllClasses(classes, state);
    } else if (isExtraTab) {
      await renderExtraTab(currentClass, state);
    } else {
      renderStudentTable(classItem, state);
    }

    renderSelectedList(state);
  }

  function renderStudentTable(classItem, state) {
    if (!classItem) {
      els.studentsTableWrap.innerHTML = '<div class="empty-state">Классы не найдены.</div>';
      return;
    }

    const searchValue = els.studentSearchInput.value.trim().toUpperCase();
    const filterValue = els.studentFilterSelect.value;
    const selectedIds = new Set(state.selectedParticipants.map((item) => item.id));
    const students = classItem.students.filter((student) => {
      const matchesSearch = !searchValue || student.fullName.toUpperCase().includes(searchValue);
      const selected = selectedIds.has(student.id);
      const missingUin = !student.uin || student.uin === '-';
      if (!matchesSearch) return false;
      if (filterValue === 'missingUin' && !missingUin) return false;
      if (filterValue === 'selected' && !selected) return false;
      if (filterValue === 'unselected' && selected) return false;
      return true;
    });

    /* Count how many in this class are not yet selected */
    const unselectedInClass = students.filter((s) => !selectedIds.has(s.id));

    els.studentsTableWrap.innerHTML = `
      ${unselectedInClass.length > 0 ? `<div class="standards-actions" style="margin-bottom:0.5rem"><button class="btn btn-secondary" id="addWholeClass" type="button">Добавить весь класс (${unselectedInClass.length})</button></div>` : ''}
      <table>
        <thead><tr><th>ФИО</th><th>Класс</th><th>УИН</th><th>Действие</th></tr></thead>
        <tbody>
          ${students.map((student) => `
            <tr>
              <td>${escapeHtml(student.fullName)}</td>
              <td>${escapeHtml(student.className)}</td>
              <td>${escapeHtml(student.uin || '-')}</td>
              <td>${selectedIds.has(student.id) ? `<span class="muted">Уже в заявке</span> <button class="btn btn-secondary btn-sm" data-remove-inline="${student.id}" type="button">Убрать</button>` : `<button class="btn btn-primary" data-add="${student.id}" type="button">Добавить</button>`}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    /* Bind add-whole-class */
    const addWholeClassBtn = document.getElementById('addWholeClass');
    if (addWholeClassBtn) {
      addWholeClassBtn.addEventListener('click', () => {
        unselectedInClass.forEach((student) => {
          appState.addParticipant(student);
        });
        render();
      });
    }

    els.studentsTableWrap.querySelectorAll('[data-add]').forEach((button) => {
      button.addEventListener('click', () => {
        const student = state.analysis.school.allStudents.find((item) => item.id === button.dataset.add);
        if (student) {
          appState.addParticipant(student);
          render();
        }
      });
    });

    els.studentsTableWrap.querySelectorAll('[data-remove-inline]').forEach((button) => {
      button.addEventListener('click', () => {
        appState.removeParticipant(button.dataset.removeInline);
        render();
      });
    });
  }

  function renderStudentTableAllClasses(classes, state) {
    const searchValue = els.studentSearchInput.value.trim().toUpperCase();
    const filterValue = els.studentFilterSelect.value;
    const selectedIds = new Set(state.selectedParticipants.map((item) => item.id));

    const allStudents = [];
    classes.forEach((cls) => {
      cls.students.forEach((student) => {
        const matchesSearch = !searchValue || student.fullName.toUpperCase().includes(searchValue);
        const selected = selectedIds.has(student.id);
        const missingUin = !student.uin || student.uin === '-';
        if (!matchesSearch) return;
        if (filterValue === 'missingUin' && !missingUin) return;
        if (filterValue === 'selected' && !selected) return;
        if (filterValue === 'unselected' && selected) return;
        allStudents.push(student);
      });
    });

    els.studentsTableWrap.innerHTML = `
      <div class="standards-hint" style="margin-bottom:0.5rem;font-size:0.85rem">Результаты поиска по всем классам (${allStudents.length})</div>
      <table>
        <thead><tr><th>ФИО</th><th>Класс</th><th>УИН</th><th>Действие</th></tr></thead>
        <tbody>
          ${allStudents.map((student) => `
            <tr>
              <td>${escapeHtml(student.fullName)}</td>
              <td>${escapeHtml(student.className)}</td>
              <td>${escapeHtml(student.uin || '-')}</td>
              <td>${selectedIds.has(student.id) ? `<span class="muted">Уже в заявке</span> <button class="btn btn-secondary btn-sm" data-remove-inline="${student.id}" type="button">Убрать</button>` : `<button class="btn btn-primary" data-add="${student.id}" type="button">Добавить</button>`}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    els.studentsTableWrap.querySelectorAll('[data-add]').forEach((button) => {
      button.addEventListener('click', () => {
        const student = state.analysis.school.allStudents.find((item) => item.id === button.dataset.add);
        if (student) {
          appState.addParticipant(student);
          render();
        }
      });
    });

    els.studentsTableWrap.querySelectorAll('[data-remove-inline]').forEach((button) => {
      button.addEventListener('click', () => {
        appState.removeParticipant(button.dataset.removeInline);
        render();
      });
    });
  }

  function renderHomeschoolTab(state) {
    var classes = state.analysis.school ? state.analysis.school.classes : [];
    var homeClass = classes.find(function (c) { return c.name === 'Домашники'; });
    var students = homeClass ? homeClass.students : [];
    var selectedIds = new Set(state.selectedParticipants.map(function (p) { return p.id; }));
    var searchValue = els.studentSearchInput.value.trim().toUpperCase();

    var filtered = students.filter(function (s) {
      return !searchValue || s.fullName.toUpperCase().includes(searchValue);
    });

    if (!filtered.length) {
      els.studentsTableWrap.innerHTML = '<div class="empty-state">Нет учеников на домашнем обучении. Данные загружаются из файла АСУ РСО.</div>';
      return;
    }

    var unselected = filtered.filter(function (s) { return !selectedIds.has(s.id); });

    els.studentsTableWrap.innerHTML = `
      ${unselected.length > 0 ? `<div class="standards-actions" style="margin-bottom:0.5rem"><button class="btn btn-secondary" id="addWholeClass" type="button">Добавить всех (${unselected.length})</button></div>` : ''}
      <table>
        <thead><tr><th>ФИО</th><th>Класс</th><th>Форма обучения</th><th>УИН</th><th>Действие</th></tr></thead>
        <tbody>
          ${filtered.map(function (s) { return `
            <tr>
              <td>${escapeHtml(s.fullName)}</td>
              <td>${escapeHtml(s.className || '-')}</td>
              <td>${escapeHtml(s.formOfEducation || '-')}</td>
              <td>${escapeHtml(s.uin || '-')}</td>
              <td>${selectedIds.has(s.id) ? `<span class="muted">Уже в заявке</span> <button class="btn btn-secondary btn-sm" data-remove-inline="${s.id}" type="button">Убрать</button>` : `<button class="btn btn-primary" data-add="${s.id}" type="button">Добавить</button>`}</td>
            </tr>
          `; }).join('')}
        </tbody>
      </table>
    `;

    var addAllBtn = document.getElementById('addWholeClass');
    if (addAllBtn) {
      addAllBtn.addEventListener('click', function () {
        unselected.forEach(function (s) { appState.addParticipant(s); });
        render();
      });
    }

    els.studentsTableWrap.querySelectorAll('[data-add]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var student = students.find(function (s) { return s.id === btn.dataset.add; });
        if (student) {
          appState.addParticipant(student);
          render();
        }
      });
    });

    els.studentsTableWrap.querySelectorAll('[data-remove-inline]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        appState.removeParticipant(btn.dataset.removeInline);
        render();
      });
    });
  }

  async function renderExtraTab(tabKey, state) {
    const tab = EXTRA_TABS.find((t) => t.key === tabKey);
    if (!tab || !window.GTOSchool) {
      els.studentsTableWrap.innerHTML = '<div class="empty-state">Данные недоступны.</div>';
      return;
    }

    /* Special handling for Домашники tab — show from roster class objects */
    if (tabKey === '__homeschool') {
      renderHomeschoolTab(state);
      return;
    }

    const api = window.GTOSchool[tab.store];
    const people = await api.getAll();
    const selectedIds = new Set(state.selectedParticipants.map((item) => item.id));
    const searchValue = els.studentSearchInput.value.trim().toUpperCase();

    const filtered = people.filter((p) => {
      if (searchValue && !p.fullName.toUpperCase().includes(searchValue)) return false;
      return true;
    });

    if (!filtered.length) {
      els.studentsTableWrap.innerHTML = `<div class="empty-state">Список "${tab.label}" пуст. Добавьте участников в школьном реестре на главной.</div>`;
      return;
    }

    els.studentsTableWrap.innerHTML = `
      <table>
        <thead><tr><th>ФИО</th><th>Роль / Должность</th><th>Телефон</th><th>Действие</th></tr></thead>
        <tbody>
          ${filtered.map((person) => `
            <tr>
              <td>${escapeHtml(person.fullName)}</td>
              <td>${escapeHtml(person.role || '-')}</td>
              <td>${escapeHtml(person.phone || '-')}</td>
              <td>${selectedIds.has(person.id) ? `<span class="muted">Уже в заявке</span> <button class="btn btn-secondary btn-sm" data-remove-inline="${person.id}" type="button">Убрать</button>` : `<button class="btn btn-primary" data-add-person="${person.id}" data-store="${tab.store}" type="button">Добавить</button>`}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    els.studentsTableWrap.querySelectorAll('[data-add-person]').forEach((button) => {
      button.addEventListener('click', async () => {
        const api2 = window.GTOSchool[button.dataset.store];
        const allPeople = await api2.getAll();
        const person = allPeople.find((p) => p.id === button.dataset.addPerson);
        if (person) {
          appState.addParticipant({
            id: person.id,
            fullName: person.fullName,
            className: person.role || tab.label,
            uin: '',
            gender: '',
            birthDate: '',
            documentNumber: '',
            address: '',
            source: tab.store
          });
          render();
        }
      });
    });

    els.studentsTableWrap.querySelectorAll('[data-remove-inline]').forEach((button) => {
      button.addEventListener('click', () => {
        appState.removeParticipant(button.dataset.removeInline);
        render();
      });
    });
  }

  function renderSelectedList(state) {
    els.selectedCountBadge.textContent = `${state.selectedParticipants.length} участников`;
    els.selectedList.innerHTML = state.selectedParticipants.length ? state.selectedParticipants.map((participant) => `
      <div class="selected-row">
        <div>
          <strong>${escapeHtml(participant.fullName)}</strong>
          <div class="muted">${escapeHtml(participant.className || 'Без класса')} · УИН: ${escapeHtml(participant.uin || '-')}</div>
        </div>
        <button class="btn btn-secondary" data-remove="${participant.id}" type="button">Убрать</button>
      </div>
    `).join('') : '<div class="empty-state">Пока никто не выбран.</div>';
    els.selectedList.querySelectorAll('[data-remove]').forEach((button) => {
      button.addEventListener('click', () => {
        appState.removeParticipant(button.dataset.remove);
        render();
      });
    });
  }

  /* ---- Standards selection step ---- */
  var standardsCurrentStageTab = null;   /* stageNumber of the active tab */
  var standardsIndividualMode = false;   /* false = stage-wide, true = per-person */
  var standardsSelectedPids = {};        /* pids selected for individual edit */
  var standardsStagesCache = null;

  async function loadStandardsStages() {
    if (window.GTOApp._standardsCacheDirty) {
      standardsStagesCache = null;
      window.GTOApp._standardsCacheDirty = false;
    }
    if (standardsStagesCache) return standardsStagesCache;
    if (window.GTOStandards) {
      await window.GTOStandards.init();
      standardsStagesCache = await window.GTOStandards.getAllStages();
    } else {
      standardsStagesCache = window.GTOApp.defaultStandards || [];
    }
    return standardsStagesCache;
  }

  function resolveParticipantStage(participant, state) {
    /* Use the stage from buildGeneratedRows or calculate */
    var stages = state.analysis.template ? state.analysis.template.stages : [];
    var birthDate = participant.birthDate || '';
    var ageValue = window.GTOApp.calculations
      ? window.GTOApp.calculations.calculateAgeOnDate(birthDate, state.meta.eventDate)
      : null;
    var stageMeta = participant.stage
      ? { label: participant.stage }
      : (window.GTOApp.calculations ? window.GTOApp.calculations.resolveStage(ageValue, stages) : null);
    return stageMeta ? stageMeta.label : '';
  }

  function parseStageNumber(stageLabel) {
    if (!stageLabel) return null;
    var str = String(stageLabel).trim();
    /* Extract the part before parenthesis (stage name) */
    var beforeParen = str.split('(')[0].trim().toUpperCase();
    /* Try Roman numeral first (labels from template are like "I", "V", "XVIII") */
    var romanMap = {
      'XVIII': 18, 'XVII': 17, 'XVI': 16, 'XV': 15, 'XIV': 14,
      'XIII': 13, 'XII': 12, 'XI': 11, 'X': 10, 'IX': 9, 'VIII': 8,
      'VII': 7, 'VI': 6, 'V': 5, 'IV': 4, 'III': 3, 'II': 2, 'I': 1
    };
    /* Match if beforeParen IS a Roman numeral (possibly with "ступень" suffix) */
    var romanPart = beforeParen.replace(/\s*СТУПЕНЬ\s*/, '').trim();
    if (romanMap[romanPart] !== undefined) return romanMap[romanPart];
    /* Try Arabic number in the beforeParen part */
    var m = beforeParen.match(/(\d+)/);
    if (m) return parseInt(m[1], 10);
    /* Fallback: check anywhere in the label for Roman */
    var keys = Object.keys(romanMap);
    for (var i = 0; i < keys.length; i++) {
      if (beforeParen === keys[i]) return romanMap[keys[i]];
    }
    return null;
  }

  async function renderStandards() {
    if (!els.standardsWrap) return;
    var state = appState.getState();
    if (!state.selectedParticipants.length) {
      els.standardsWrap.innerHTML = '<div class="empty-state">Сначала выберите участников на предыдущем шаге.</div>';
      return;
    }

    var allStages = await loadStandardsStages();
    var participants = state.selectedParticipants;
    var sel = getStdSelections();

    /* ---- Group participants by stage ---- */
    var stageGroups = {};  /* stageNumber → { stageData, participants[], label } */
    var noStageParticipants = [];
    participants.forEach(function (p) {
      var label = resolveParticipantStage(p, state);
      var num = parseStageNumber(label);
      if (!num) { noStageParticipants.push(p); return; }
      if (!stageGroups[num]) {
        var sd = allStages.find(function (s) { return s.stageNumber === num; });
        stageGroups[num] = { stageData: sd, participants: [], label: label, stageNumber: num };
      }
      stageGroups[num].participants.push(p);
    });
    var stageKeys = Object.keys(stageGroups).map(Number).sort(function (a, b) { return a - b; });

    /* Pick active tab */
    if (!standardsCurrentStageTab || !stageGroups[standardsCurrentStageTab]) {
      standardsCurrentStageTab = stageKeys.length ? stageKeys[0] : null;
    }

    /* ---- Auto-initialize defaults for participants without selections ---- */
    var dirty = false;
    participants.forEach(function (p) {
      if (sel[p.id]) return;
      var pStage = parseStageNumber(resolveParticipantStage(p, state));
      var pData = pStage ? allStages.find(function (s) { return s.stageNumber === pStage; }) : null;
      if (!pData) return;
      var defs = [];
      pData.items.forEach(function (item) {
        if (item.disciplines.length === 1) defs.push(item.disciplines[0]);
      });
      sel[p.id] = defs;
      dirty = true;
    });
    if (dirty) setStdSelections(sel);

    /* ---- Summary bar ---- */
    var withSel = 0;
    var withoutSel = 0;
    participants.forEach(function (p) {
      if (sel[p.id] && sel[p.id].length > 0) withSel++;
      else withoutSel++;
    });
    var summaryHtml = '<div class="standards-summary">' +
      '<span>Участников: <strong>' + participants.length + '</strong></span>' +
      '<span>С выбранными испытаниями: <strong>' + withSel + '</strong></span>' +
      (withoutSel > 0 ? '<span class="standards-warn">Без испытаний: <strong>' + withoutSel + '</strong></span>' : '') +
      '</div>';

    /* ---- Stage tabs ---- */
    var navHtml = '<div class="standards-stage-nav">';
    stageKeys.forEach(function (num) {
      var g = stageGroups[num];
      var allOk = g.participants.every(function (p) { return sel[p.id] && sel[p.id].length > 0; });
      navHtml += '<button class="class-tab' + (num === standardsCurrentStageTab ? ' is-active' : '') + '" data-stage-tab="' + num + '" type="button">' +
        num + ' ступень <small>(' + g.participants.length + ' чел.)</small>' +
        (allOk ? ' <span class="standards-check-mark">&#10003;</span>' : '') +
        '</button>';
    });
    if (noStageParticipants.length) {
      navHtml += '<span class="standards-warn" style="align-self:center;font-size:0.8rem;margin-left:0.5rem">' +
        noStageParticipants.length + ' без ступени</span>';
    }
    navHtml += '</div>';

    /* ---- Body for active stage ---- */
    var bodyHtml = '';
    var activeGroup = stageGroups[standardsCurrentStageTab];

    if (!activeGroup || !activeGroup.stageData) {
      bodyHtml = '<div class="empty-state">Нет данных нормативов для выбранной ступени.</div>';
    } else {
      var sd = activeGroup.stageData;
      var sNum = activeGroup.stageNumber;
      var groupPids = activeGroup.participants.map(function (p) { return p.id; });

      /* Compute "stage-level" checked state: a discipline is checked at stage level
         if ALL participants of this stage have it selected */
      function isStageChecked(disc) {
        return groupPids.every(function (pid) {
          return sel[pid] && sel[pid].indexOf(disc) >= 0;
        });
      }
      function isStagePartial(disc) {
        var count = 0;
        groupPids.forEach(function (pid) {
          if (sel[pid] && sel[pid].indexOf(disc) >= 0) count++;
        });
        return count > 0 && count < groupPids.length;
      }

      /* ---- Mode toggle ---- */
      var modeHtml = '<div class="standards-mode-bar">' +
        '<button class="btn btn-sm' + (!standardsIndividualMode ? ' btn-primary' : ' btn-ghost') + '" id="stdModeStage" type="button">По ступени (для всех)</button>' +
        '<button class="btn btn-sm' + (standardsIndividualMode ? ' btn-primary' : ' btn-ghost') + '" id="stdModeIndividual" type="button">Индивидуально</button>' +
        '<span class="standards-hint" style="margin-left:auto">' + activeGroup.participants.length + ' участн. · ' + escapeHtml(sd.ageRange || '') + '</span>' +
        '</div>';

      if (!standardsIndividualMode) {
        /* ========= STAGE-WIDE MODE ========= */
        var itemsHtml = '<h4>' + sNum + ' ступень (' + escapeHtml(sd.ageRange || '') + ')</h4>';
        sd.items.forEach(function (item) {
          var allChecked = item.disciplines.every(isStageChecked);
          itemsHtml += '<div class="standards-item">';
          itemsHtml += '<div class="standards-item-header"><span>Пункт ' + item.itemNumber;
          if (item.hint) itemsHtml += ' <span class="standards-hint">(' + escapeHtml(item.hint) + ')</span>';
          if (item.disciplines.length > 1) itemsHtml += ' <span class="standards-hint">(выберите из списка)</span>';
          itemsHtml += '</span>';
          if (item.disciplines.length > 1) {
            itemsHtml += '<button class="btn btn-ghost standards-toggle-btn" data-toggle-item="' + item.itemNumber + '" type="button">' + (allChecked ? 'Снять все' : 'Выбрать все') + '</button>';
          }
          itemsHtml += '<button class="btn btn-ghost btn-sm standards-add-disc-btn" data-add-disc-item="' + item.itemNumber + '" type="button" title="Добавить испытание">＋</button>';
          itemsHtml += '</div>';
          item.disciplines.forEach(function (disc) {
            var checked = isStageChecked(disc);
            var partial = !checked && isStagePartial(disc);
            itemsHtml += '<label class="standards-discipline' + (partial ? ' standards-partial' : '') + '">' +
              '<input type="checkbox" data-stage-disc="' + escapeHtml(disc) + '" data-item="' + item.itemNumber + '"' + (checked ? ' checked' : '') + '> ' +
              escapeHtml(disc) +
              (partial ? ' <span class="standards-hint">(не у всех)</span>' : '') +
              '<button class="standards-remove-disc-btn" data-rm-disc="' + escapeHtml(disc) + '" data-rm-item="' + item.itemNumber + '" type="button" title="Удалить испытание">✕</button>' +
              '</label>';
          });
          itemsHtml += '</div>';
        });

        /* Actions */
        var actionsHtml = '<div class="standards-actions">' +
          '<button class="btn btn-ghost" id="standardsSelectAllItems" type="button">Выбрать все</button>' +
          '<button class="btn btn-ghost" id="standardsClearAll" type="button">Снять все</button>' +
          '</div>';

        bodyHtml = modeHtml + '<div class="card">' + itemsHtml + actionsHtml + '</div>';
      } else {
        /* ========= INDIVIDUAL MODE ========= */
        /* Participant selector (multi-select checkboxes) */
        var pickHtml = '<div class="standards-individual-picker">' +
          '<div class="standards-individual-picker-header">' +
          '<span>Выберите участников для настройки:</span>' +
          '<button class="btn btn-ghost btn-sm" id="stdPickAll" type="button">Все</button>' +
          '<button class="btn btn-ghost btn-sm" id="stdPickNone" type="button">Никого</button>' +
          '</div>';
        activeGroup.participants.forEach(function (p) {
          var picked = !!standardsSelectedPids[p.id];
          var hasS = sel[p.id] && sel[p.id].length > 0;
          pickHtml += '<label class="standards-individual-person">' +
            '<input type="checkbox" data-pick-pid="' + p.id + '"' + (picked ? ' checked' : '') + '> ' +
            escapeHtml(p.fullName) +
            (hasS ? ' <span class="standards-check-mark">&#10003;</span>' : '') +
            '</label>';
        });
        pickHtml += '</div>';

        /* Build selected pids list for this stage */
        var editPids = [];
        activeGroup.participants.forEach(function (p) {
          if (standardsSelectedPids[p.id]) editPids.push(p.id);
        });

        var itemsHtml = '';
        if (editPids.length === 0) {
          itemsHtml = '<div class="empty-state" style="padding:1rem">Отметьте участников выше для индивидуальной настройки.</div>';
        } else {
          var editNames = editPids.map(function (pid) {
            var pp = activeGroup.participants.find(function (p) { return p.id === pid; });
            return pp ? pp.fullName.split(' ').slice(0, 2).join(' ') : pid;
          });
          itemsHtml += '<h4>Настройка для: ' + escapeHtml(editNames.join(', ')) + '</h4>';

          /* For individual: checked = ALL selected pids have the disc */
          function isIndivChecked(disc) {
            return editPids.every(function (pid) { return sel[pid] && sel[pid].indexOf(disc) >= 0; });
          }
          function isIndivPartial(disc) {
            var c = 0;
            editPids.forEach(function (pid) { if (sel[pid] && sel[pid].indexOf(disc) >= 0) c++; });
            return c > 0 && c < editPids.length;
          }

          sd.items.forEach(function (item) {
            var allChecked = item.disciplines.every(isIndivChecked);
            itemsHtml += '<div class="standards-item">';
            itemsHtml += '<div class="standards-item-header"><span>Пункт ' + item.itemNumber;
            if (item.hint) itemsHtml += ' <span class="standards-hint">(' + escapeHtml(item.hint) + ')</span>';
            if (item.disciplines.length > 1) itemsHtml += ' <span class="standards-hint">(выберите из списка)</span>';
            itemsHtml += '</span>';
            if (item.disciplines.length > 1) {
              itemsHtml += '<button class="btn btn-ghost standards-toggle-btn" data-indiv-toggle="' + item.itemNumber + '" type="button">' + (allChecked ? 'Снять все' : 'Выбрать все') + '</button>';
            }
            itemsHtml += '</div>';
            item.disciplines.forEach(function (disc) {
              var checked = isIndivChecked(disc);
              var partial = !checked && isIndivPartial(disc);
              itemsHtml += '<label class="standards-discipline' + (partial ? ' standards-partial' : '') + '">' +
                '<input type="checkbox" data-indiv-disc="' + escapeHtml(disc) + '" data-item="' + item.itemNumber + '"' + (checked ? ' checked' : '') + '> ' +
                escapeHtml(disc) +
                (partial ? ' <span class="standards-hint">(не у всех)</span>' : '') +
                '</label>';
            });
            itemsHtml += '</div>';
          });
        }

        var actionsHtml = editPids.length ? '<div class="standards-actions">' +
          '<button class="btn btn-ghost" id="standardsIndivSelectAll" type="button">Выбрать все</button>' +
          '<button class="btn btn-ghost" id="standardsIndivClearAll" type="button">Снять все</button>' +
          '</div>' : '';

        bodyHtml = modeHtml + pickHtml + '<div class="card">' + itemsHtml + actionsHtml + '</div>';
      }
    }

    /* ---- Warning for participants without stage ---- */
    var noStageHtml = '';
    if (noStageParticipants.length) {
      noStageHtml = '<div class="standards-item" style="border-color:#fbbf24;margin-top:0.75rem">' +
        '<div class="standards-item-header"><span class="standards-warn">Участники без определённой ступени:</span></div>';
      noStageParticipants.forEach(function (p) {
        noStageHtml += '<div style="padding:0.15rem 0.5rem;font-size:0.85rem">' + escapeHtml(p.fullName) + ' — проверьте дату рождения</div>';
      });
      noStageHtml += '</div>';
    }

    els.standardsWrap.innerHTML = summaryHtml + navHtml + bodyHtml + noStageHtml;

    /* ======== EVENT BINDINGS ======== */

    /* Stage tab clicks */
    els.standardsWrap.querySelectorAll('[data-stage-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        standardsCurrentStageTab = parseInt(btn.dataset.stageTab, 10);
        standardsIndividualMode = false;
        standardsSelectedPids = {};
        renderStandards();
      });
    });

    /* Mode toggle */
    var modeStageBtn = document.getElementById('stdModeStage');
    var modeIndivBtn = document.getElementById('stdModeIndividual');
    if (modeStageBtn) modeStageBtn.addEventListener('click', function () {
      standardsIndividualMode = false;
      renderStandards();
    });
    if (modeIndivBtn) modeIndivBtn.addEventListener('click', function () {
      standardsIndividualMode = true;
      renderStandards();
    });

    if (!standardsIndividualMode && activeGroup && activeGroup.stageData) {
      /* ---- Stage-wide checkbox changes ---- */
      els.standardsWrap.querySelectorAll('input[type="checkbox"][data-stage-disc]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var disc = cb.dataset.disc || cb.getAttribute('data-stage-disc');
          var s = getStdSelections();
          activeGroup.participants.forEach(function (p) {
            if (!s[p.id]) s[p.id] = [];
            if (cb.checked) {
              if (s[p.id].indexOf(disc) < 0) s[p.id].push(disc);
            } else {
              s[p.id] = s[p.id].filter(function (d) { return d !== disc; });
            }
          });
          setStdSelections(s);
          /* Update summary without full re-render for speed */
          renderStandards();
        });
      });

      /* Toggle-all per item (stage mode) */
      els.standardsWrap.querySelectorAll('[data-toggle-item]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var itemNum = parseInt(btn.dataset.toggleItem, 10);
          var item = activeGroup.stageData.items.find(function (it) { return it.itemNumber === itemNum; });
          if (!item) return;
          var s = getStdSelections();
          var allIn = item.disciplines.every(function (d) {
            return activeGroup.participants.every(function (p) { return s[p.id] && s[p.id].indexOf(d) >= 0; });
          });
          activeGroup.participants.forEach(function (p) {
            if (!s[p.id]) s[p.id] = [];
            if (allIn) {
              var removeSet = new Set(item.disciplines);
              s[p.id] = s[p.id].filter(function (d) { return !removeSet.has(d); });
            } else {
              item.disciplines.forEach(function (d) {
                if (s[p.id].indexOf(d) < 0) s[p.id].push(d);
              });
            }
          });
          setStdSelections(s);
          renderStandards();
        });
      });

      /* Select-all / Clear-all (stage mode) */
      var selectAllBtn = document.getElementById('standardsSelectAllItems');
      if (selectAllBtn) selectAllBtn.addEventListener('click', function () {
        var s = getStdSelections();
        var allDiscs = [];
        activeGroup.stageData.items.forEach(function (item) {
          item.disciplines.forEach(function (d) { allDiscs.push(d); });
        });
        activeGroup.participants.forEach(function (p) { s[p.id] = allDiscs.slice(); });
        setStdSelections(s);
        renderStandards();
      });
      var clearAllBtn = document.getElementById('standardsClearAll');
      if (clearAllBtn) clearAllBtn.addEventListener('click', function () {
        var s = getStdSelections();
        activeGroup.participants.forEach(function (p) { s[p.id] = []; });
        setStdSelections(s);
        renderStandards();
      });

      /* Add discipline to item */
      els.standardsWrap.querySelectorAll('[data-add-disc-item]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var itemNum = parseInt(btn.getAttribute('data-add-disc-item'), 10);
          var name = prompt('Введите название испытания:');
          if (!name || !name.trim()) return;
          name = name.trim();
          if (window.GTOStandards) {
            window.GTOStandards.addDiscipline(sNum, itemNum, name).then(function () {
              standardsStagesCache = null;
              renderStandards();
            });
          }
        });
      });

      /* Remove discipline from item */
      els.standardsWrap.querySelectorAll('[data-rm-disc]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var disc = btn.getAttribute('data-rm-disc');
          var itemNum = parseInt(btn.getAttribute('data-rm-item'), 10);
          if (!confirm('Удалить испытание «' + disc + '» из пункта ' + itemNum + '?')) return;
          if (window.GTOStandards) {
            window.GTOStandards.removeDiscipline(sNum, itemNum, disc).then(function () {
              /* Also remove from selections */
              var s = getStdSelections();
              Object.keys(s).forEach(function (pid) {
                s[pid] = s[pid].filter(function (d) { return d !== disc; });
              });
              setStdSelections(s);
              standardsStagesCache = null;
              renderStandards();
            });
          }
        });
      });

    } else if (standardsIndividualMode && activeGroup && activeGroup.stageData) {
      /* ---- Individual mode bindings ---- */

      /* Participant picker */
      els.standardsWrap.querySelectorAll('input[data-pick-pid]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var pid = cb.getAttribute('data-pick-pid');
          if (cb.checked) standardsSelectedPids[pid] = true;
          else delete standardsSelectedPids[pid];
          renderStandards();
        });
      });
      var pickAllBtn = document.getElementById('stdPickAll');
      if (pickAllBtn) pickAllBtn.addEventListener('click', function () {
        activeGroup.participants.forEach(function (p) { standardsSelectedPids[p.id] = true; });
        renderStandards();
      });
      var pickNoneBtn = document.getElementById('stdPickNone');
      if (pickNoneBtn) pickNoneBtn.addEventListener('click', function () {
        standardsSelectedPids = {};
        renderStandards();
      });

      /* Individual discipline checkboxes */
      var editPids = [];
      activeGroup.participants.forEach(function (p) {
        if (standardsSelectedPids[p.id]) editPids.push(p.id);
      });

      els.standardsWrap.querySelectorAll('input[type="checkbox"][data-indiv-disc]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var disc = cb.getAttribute('data-indiv-disc');
          var s = getStdSelections();
          editPids.forEach(function (pid) {
            if (!s[pid]) s[pid] = [];
            if (cb.checked) {
              if (s[pid].indexOf(disc) < 0) s[pid].push(disc);
            } else {
              s[pid] = s[pid].filter(function (d) { return d !== disc; });
            }
          });
          setStdSelections(s);
          renderStandards();
        });
      });

      /* Toggle-all per item (individual mode) */
      els.standardsWrap.querySelectorAll('[data-indiv-toggle]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var itemNum = parseInt(btn.getAttribute('data-indiv-toggle'), 10);
          var item = activeGroup.stageData.items.find(function (it) { return it.itemNumber === itemNum; });
          if (!item) return;
          var s = getStdSelections();
          var allIn = item.disciplines.every(function (d) {
            return editPids.every(function (pid) { return s[pid] && s[pid].indexOf(d) >= 0; });
          });
          editPids.forEach(function (pid) {
            if (!s[pid]) s[pid] = [];
            if (allIn) {
              var removeSet = new Set(item.disciplines);
              s[pid] = s[pid].filter(function (d) { return !removeSet.has(d); });
            } else {
              item.disciplines.forEach(function (d) {
                if (s[pid].indexOf(d) < 0) s[pid].push(d);
              });
            }
          });
          setStdSelections(s);
          renderStandards();
        });
      });

      /* Select-all / Clear-all (individual mode) */
      var indivSelectAll = document.getElementById('standardsIndivSelectAll');
      if (indivSelectAll) indivSelectAll.addEventListener('click', function () {
        var s = getStdSelections();
        var allDiscs = [];
        activeGroup.stageData.items.forEach(function (item) {
          item.disciplines.forEach(function (d) { allDiscs.push(d); });
        });
        editPids.forEach(function (pid) { s[pid] = allDiscs.slice(); });
        setStdSelections(s);
        renderStandards();
      });
      var indivClearAll = document.getElementById('standardsIndivClearAll');
      if (indivClearAll) indivClearAll.addEventListener('click', function () {
        var s = getStdSelections();
        editPids.forEach(function (pid) { s[pid] = []; });
        setStdSelections(s);
        renderStandards();
      });
    }
  }

  function renderReview() {
    const state = appState.getState();
    if (!state.analysis.school || !state.analysis.school.allStudents || !state.analysis.school.allStudents.length) {
      els.reviewStats.innerHTML = '';
      els.reviewTableWrap.innerHTML = '<div class="empty-state">Сначала завершите подготовку данных.</div>';
      renderIssues(els.reviewIssues, [], 'Нет данных для проверки.');
      return;
    }

    const rows = appState.buildGeneratedRows();
    const problemsCount = rows.reduce((sum, row) => sum + row.issues.length, 0);
    const missingRows = rows.filter((row) => row.issues.length).length;

    /* Standards selections summary */
    const stdSel = getStdSelections();
    const withStandards = state.selectedParticipants.filter((p) => stdSel[p.id] && stdSel[p.id].length > 0).length;
    const withoutStandards = state.selectedParticipants.length - withStandards;

    els.reviewStats.innerHTML = `
      <div class="stat-card"><strong>Строк в выгрузке</strong><div>${rows.length}</div></div>
      <div class="stat-card"><strong>Записей с проверкой</strong><div>${missingRows}</div></div>
      <div class="stat-card"><strong>Всего проблемных полей</strong><div>${problemsCount}</div></div>
      <div class="stat-card"><strong>Дата ГТО</strong><div>${escapeHtml(state.meta.eventDate || 'Не указана')}</div></div>
      <div class="stat-card"><strong>С нормативами</strong><div>${withStandards} из ${state.selectedParticipants.length}</div></div>
    `;

    /* Add warnings for participants without standards */
    const allIssues = state.analysis.issues.slice();
    if (withoutStandards > 0) {
      state.selectedParticipants.forEach((p) => {
        if (!stdSel[p.id] || stdSel[p.id].length === 0) {
          allIssues.push({ severity: 'warning', title: 'Нет выбранных испытаний', message: p.fullName + ': не выбраны нормативы ГТО (карточка будет пустой)' });
        }
      });
    }
    renderIssues(els.reviewIssues, allIssues, 'Все поля заполнены. Можно скачивать Excel и карточки.');

    els.reviewTableWrap.innerHTML = rows.length ? `
      <table>
        <thead><tr>${config.reviewColumns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${row.sequence}</td>
              ${reviewCell(row.fullName)}
              ${reviewCell(row.uin)}
              ${reviewCell(row.gender)}
              ${reviewCell(row.schoolName)}
              ${reviewCell(row.stage)}
              <td class="${row.birthDateRaw.problem ? 'cell-danger' : ''}">${escapeHtml(row.birthDateDisplay)}</td>
              ${reviewCell(row.age)}
              ${reviewCell(row.documentNumber)}
              ${reviewCell(row.className)}
              ${reviewCell(row.address)}
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<div class="empty-state">Сначала выберите хотя бы одного участника.</div>';
  }

  function reviewCell(meta) {
    return `<td class="${meta.problem ? 'cell-danger' : ''}">${escapeHtml(meta.value)}</td>`;
  }

  function getVisibleSteps() {
    const state = appState.getState();
    const rosterLoaded = state.analysis && state.analysis.school &&
      state.analysis.school.allStudents && state.analysis.school.allStudents.length > 0 &&
      state.analysis.source === 'roster';
    return rosterLoaded ? config.steps.filter((s) => s.id !== 'prepare') : config.steps;
  }

  function updateButtons() {
    const state = appState.getState();
    const steps = getVisibleSteps();
    const index = steps.findIndex((step) => step.id === state.currentStep);
    els.prevStepBtn.disabled = index <= 0;
    els.nextStepBtn.disabled = index === steps.length - 1;
  }

  function canOpenStep(stepId) {
    const state = appState.getState();
    if (stepId === 'prepare') return true;
    if (stepId === 'select') return Boolean(state.analysis.school && state.analysis.school.allStudents && state.analysis.school.allStudents.length > 0);
    if (stepId === 'standards') return Boolean(state.selectedParticipants.length);
    if (stepId === 'review') return Boolean(state.selectedParticipants.length);
    return false;
  }

  function moveStep(direction) {
    const state = appState.getState();
    const steps = getVisibleSteps();
    const currentIndex = steps.findIndex((step) => step.id === state.currentStep);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= steps.length) return;
    const nextStep = steps[nextIndex];
    if (!canOpenStep(nextStep.id)) {
      if (nextStep.id === 'select') alert('Сначала загрузите и проанализируйте два файла.');
      if (nextStep.id === 'standards') alert('Сначала выберите хотя бы одного участника.');
      if (nextStep.id === 'review') alert('Сначала выберите хотя бы одного участника.');
      return;
    }
    appState.setCurrentStep(nextStep.id);
    render();
  }

  async function analyzeFiles() {
    const schoolFile = els.schoolFileInput.files[0];
    const asuFile = els.asuFileInput.files[0];
    if (!schoolFile || !asuFile) {
      alert('Нужно загрузить два файла: школьную базу и список АСУ РСО.');
      return;
    }

    els.analyzeBtn.disabled = true;
    els.analyzeBtn.textContent = 'Анализ…';
    try {
      const builtinTemplate = window.GTOApp.builtinTemplate;
      const files = {
        school: await utils.serializeFile(schoolFile),
        template: builtinTemplate,
        asu: await utils.serializeFile(asuFile)
      };
      appState.setFiles(files);
      /* Force fresh auto-detection — do NOT pass stale mappings from localStorage */
      appState.setAnalysis({
        school: excelReader.parseSchoolWorkbook(files.school, null),
        asu: excelReader.parseAsuWorkbook(files.asu, null),
        template: excelReader.parseTemplateWorkbook(files.template),
        issues: []
      });
      const snapshot = appState.getState();
      appState.setMappings({
        school: snapshot.analysis.school.classes[0] ? snapshot.analysis.school.classes[0].mapping : {},
        asu: snapshot.analysis.asu.mapping
      });
      appState.buildStructureReport();
      render();
    } catch (error) {
      logger.error(error);
      alert('Ошибка при анализе файлов: ' + (error.message || String(error)));
    } finally {
      els.analyzeBtn.disabled = false;
      els.analyzeBtn.textContent = 'Проанализировать файлы';
    }
  }

  function reanalyzeStoredFiles() {
    const snapshot = appState.getState();
    if (!snapshot.files.school || !snapshot.files.asu || !snapshot.files.template) return;
    appState.setAnalysis({
      school: excelReader.parseSchoolWorkbook(snapshot.files.school, snapshot.mappings.school),
      asu: excelReader.parseAsuWorkbook(snapshot.files.asu, snapshot.mappings.asu),
      template: excelReader.parseTemplateWorkbook(snapshot.files.template),
      issues: []
    });
    appState.buildStructureReport();
    render();
  }

  async function saveProjectToFolder() {
    try {
      if (!directoryHandle) directoryHandle = await storage.chooseDirectory();
      await storage.saveToDirectory(directoryHandle, appState.getState());
      appState.updateMeta({ workingFolderSelected: true });
      alert('Проект сохранен в выбранную папку.');
      render();
    } catch (error) {
      logger.error(error);
      alert(error.message || 'Не удалось сохранить проект в папку.');
    }
  }

  async function importState(file) {
    try {
      appState.replaceState(await storage.importFromFile(file));
      render();
    } catch (error) {
      logger.error(error);
      alert('Не удалось импортировать проект. Проверьте JSON-файл.');
    }
  }

  async function downloadExcel() {
    try {
      await exporter.exportApplication(appState.getState(), appState.getState().generatedRows);
    } catch (error) {
      logger.error(error);
      alert(error.message || 'Не удалось сформировать Excel-файл.');
    }
  }

  function bindMetaInputs() {
    /* Keep both submission date inputs in sync */
    function syncSubmissionDate(sourceInput) {
      var val = sourceInput.value;
      if (els.submissionDateInput && els.submissionDateInput !== sourceInput) {
        els.submissionDateInput.value = val;
      }
      if (els.submissionDateExcelInput && els.submissionDateExcelInput !== sourceInput) {
        els.submissionDateExcelInput.value = val;
      }
      appState.updateMeta({
        submissionDate: val,
        eventDate: els.eventDateInput.value
      });
      renderProjectSummary();
    }

    [els.submissionDateInput, els.submissionDateExcelInput].forEach(function (input) {
      if (input) {
        input.addEventListener('change', function () { syncSubmissionDate(input); });
      }
    });

    if (els.eventDateInput) {
      els.eventDateInput.addEventListener('change', function () {
        appState.updateMeta({
          submissionDate: els.submissionDateInput.value,
          eventDate: els.eventDateInput.value
        });
        renderProjectSummary();
      });
    }
  }

  /** Sync global settings (schoolName, director) into session meta */
  function syncGlobalSettingsToMeta() {
    var g = loadGlobalSettings();
    var meta = appState.getState().meta;
    if ((g.schoolName && g.schoolName !== meta.schoolName) ||
        (g.director && g.director !== meta.director)) {
      appState.updateMeta({
        schoolName: g.schoolName || meta.schoolName || '',
        director: g.director || meta.director || ''
      });
    }
  }

  function updateUploadCardLabel(input) {
    const card = input.closest('.upload-card');
    if (!card) return;
    let fileNameEl = card.querySelector('.upload-file-name');
    if (!fileNameEl) {
      fileNameEl = document.createElement('span');
      fileNameEl.className = 'upload-file-name';
      card.appendChild(fileNameEl);
    }
    const file = input.files[0];
    if (file) {
      fileNameEl.textContent = file.name;
      card.classList.add('upload-card--has-file');
    } else {
      fileNameEl.textContent = '';
      card.classList.remove('upload-card--has-file');
    }
  }

  function bindActions() {
    els.prevStepBtn.addEventListener('click', () => moveStep(-1));
    els.nextStepBtn.addEventListener('click', () => moveStep(1));
    els.analyzeBtn.addEventListener('click', analyzeFiles);
    els.schoolFileInput.addEventListener('change', () => updateUploadCardLabel(els.schoolFileInput));
    els.asuFileInput.addEventListener('change', () => updateUploadCardLabel(els.asuFileInput));
    els.chooseFolderBtn.addEventListener('click', async () => {
      try {
        directoryHandle = await storage.chooseDirectory();
        appState.updateMeta({ workingFolderSelected: true });
        render();
      } catch (error) {
        logger.warn(error);
      }
    });
    els.saveProjectBtn.addEventListener('click', saveProjectToFolder);
    els.exportStateBtn.addEventListener('click', () => storage.exportToFile(appState.getState()));
    els.importStateInput.addEventListener('change', (event) => {
      const [file] = event.target.files;
      if (file) importState(file);
    });
    els.studentSearchInput.addEventListener('input', renderSelect);
    els.studentFilterSelect.addEventListener('change', renderSelect);
    els.addManualBtn.addEventListener('click', () => els.manualDialog.showModal());
    els.saveManualBtn.addEventListener('click', () => {
      const formData = new FormData(els.manualForm);
      const fullName = String(formData.get('fullName') || '').trim();
      if (!fullName) {
        alert('Введите ФИО участника.');
        return;
      }
      appState.addManualParticipant({
        id: `manual-${Date.now()}`,
        source: 'manual',
        fullName,
        className: normalizer.normalizeClassName(formData.get('className')),
        uin: String(formData.get('uin') || '').trim(),
        gender: String(formData.get('gender') || '').trim(),
        birthDate: String(formData.get('birthDate') || '').trim(),
        documentNumber: String(formData.get('documentNumber') || '').trim(),
        address: String(formData.get('address') || '').trim(),
        schoolName: String(formData.get('schoolName') || '').trim()
      });
      els.manualForm.reset();
      els.manualDialog.close();
      render();
    });
    els.downloadExcelBtn.addEventListener('click', downloadExcel);
    if (els.downloadCardsBtn) {
      els.downloadCardsBtn.addEventListener('click', downloadCards);
    }
  }

  async function downloadCards() {
    try {
      var state = appState.getState();
      if (!state.selectedParticipants.length) {
        alert('Нет выбранных участников.');
        return;
      }
      var cardGen = window.GTOApp.cardGenerator;
      if (!cardGen) {
        alert('Модуль генерации карточек не загружен.');
        return;
      }
      els.downloadCardsBtn.disabled = true;
      els.downloadCardsBtn.textContent = 'Генерация…';
      await cardGen.generateCards(
        state.selectedParticipants,
        getStdSelections(),
        {
          schoolName: state.meta.schoolName || '',
          submissionDate: state.meta.submissionDate || '',
          eventDate: state.meta.eventDate || '',
          director: state.meta.director || ''
        }
      );
    } catch (error) {
      logger.error(error);
      alert(error.message || 'Не удалось сгенерировать карточки.');
    } finally {
      if (els.downloadCardsBtn) {
        els.downloadCardsBtn.disabled = false;
        els.downloadCardsBtn.textContent = 'Скачать карточки-заявки на всех участников';
      }
    }
  }

  /* ---- Load data from school roster (IndexedDB) ---- */
  async function loadFromRoster() {
    if (!window.GTOSchool) return false;
    try {
      await window.GTOSchool.init();
      var classes = await window.GTOSchool.getAllClasses();
      if (!classes.length) return false;

      var allStudents = [];
      var classObjects = [];
      var homeschoolers = [];

      for (var i = 0; i < classes.length; i++) {
        var cls = classes[i];
        var students = await window.GTOSchool.getStudentsByClass(cls.id);
        var classStudents = students.map(function (s, idx) {
          var student = {
            id: s.id,
            fullName: s.fullName,
            className: cls.name,
            uin: s.uin || '',
            gender: s.gender || '',
            birthDate: s.birthDate || '',
            documentType: s.documentType || '',
            documentSeries: s.documentSeries || '',
            documentNumber: s.documentNumber || '',
            snils: s.snils || '',
            residenceLocality: s.residenceLocality || '',
            residenceStreetName: s.residenceStreetName || '',
            residenceStreetType: s.residenceStreetType || '',
            residenceHouse: s.residenceHouse || '',
            residenceBuilding: s.residenceBuilding || '',
            residenceApartment: s.residenceApartment || '',
            formOfEducation: s.formOfEducation || '',
            source: 'roster'
          };
          return student;
        });

        /* Separate regular students from homeschoolers */
        var regularStudents = classStudents.filter(function (st) {
          return !window.GTOSchool.isHomeschooler(st);
        });
        var homeStudents = classStudents.filter(function (st) {
          return window.GTOSchool.isHomeschooler(st);
        });

        if (regularStudents.length > 0) {
          classObjects.push({
            name: cls.name,
            originalName: cls.name,
            students: regularStudents,
            headers: ['ФИО', 'УИН'],
            mapping: {},
            issues: []
          });
        }
        if (homeStudents.length > 0) {
          homeschoolers = homeschoolers.concat(homeStudents);
        }
        allStudents = allStudents.concat(classStudents);
      }

      /* Add homeschoolers as a virtual class */
      if (homeschoolers.length > 0) {
        classObjects.push({
          name: 'Домашники',
          originalName: 'Домашники',
          students: homeschoolers,
          headers: ['ФИО', 'УИН'],
          mapping: {},
          issues: [],
          isHomeschooler: true
        });
      }

      /* Build fake ASU records from roster data (so buildGeneratedRows works) */
      var asuRecords = allStudents.map(function (s) {
        return {
          id: s.id,
          fullName: s.fullName,
          className: s.className,
          gender: s.gender,
          birthDate: s.birthDate,
          documentType: s.documentType,
          documentSeries: s.documentSeries,
          documentNumber: s.documentNumber,
          snils: s.snils || '',
          residenceLocality: s.residenceLocality,
          residenceStreetName: s.residenceStreetName,
          residenceStreetType: s.residenceStreetType,
          residenceHouse: s.residenceHouse,
          residenceBuilding: s.residenceBuilding,
          residenceApartment: s.residenceApartment
        };
      });

      /* Load the built-in template */
      var builtinTemplate = window.GTOApp.builtinTemplate;
      var templateData = excelReader.parseTemplateWorkbook(builtinTemplate);

      /* Set template file so exporter can access the base64 binary */
      appState.setFiles({ template: builtinTemplate });

      appState.setAnalysis({
        source: 'roster',
        school: {
          classes: classObjects,
          allStudents: allStudents,
          sheetNames: classes.map(function (c) { return c.name; }),
          issues: []
        },
        asu: {
          records: asuRecords,
          headers: [],
          mapping: {},
          sheetNames: ['Реестр'],
          issues: []
        },
        template: templateData,
        issues: []
      });

      appState.buildStructureReport();
      return true;
    } catch (e) {
      console.error('Failed to load roster data:', e);
      return false;
    }
  }

  /**
   * Sync already-selected participants with fresh data from the roster.
   * Matches by ID first, then falls back to normalized FIO + className.
   * Updates UIN, gender, birthDate, document, address, etc. from the
   * latest roster so that edits made on the dashboard are reflected
   * immediately without re-selecting the participant.
   */
  function syncSelectedFromRoster() {
    var state = appState.getState();
    var allStudents = state.analysis && state.analysis.school
      ? state.analysis.school.allStudents
      : [];
    if (!allStudents.length || !state.selectedParticipants.length) return;

    /* Build lookup by ID */
    var rosterById = {};
    for (var i = 0; i < allStudents.length; i++) {
      rosterById[allStudents[i].id] = allStudents[i];
    }

    /* Build lookup by normalized name + class for fallback matching */
    var rosterByNameClass = {};
    for (var i2 = 0; i2 < allStudents.length; i2++) {
      var s = allStudents[i2];
      var key = normalizer.normalizeFio(s.fullName) + '||' + (s.className || '').toUpperCase();
      rosterByNameClass[key] = s;
    }
    /* Also index by name only (for cases where className might differ) */
    var rosterByName = {};
    for (var i3 = 0; i3 < allStudents.length; i3++) {
      var s2 = allStudents[i3];
      var nameKey = normalizer.normalizeFio(s2.fullName);
      if (!rosterByName[nameKey]) rosterByName[nameKey] = s2;
    }

    var changed = false;
    var syncFields = [
      'fullName', 'uin', 'gender', 'birthDate', 'className', 'formOfEducation',
      'documentType', 'documentSeries', 'documentNumber', 'snils',
      'residenceLocality', 'residenceStreetName', 'residenceStreetType',
      'residenceHouse', 'residenceBuilding', 'residenceApartment',
      'schoolName', 'address'
    ];

    for (var j = 0; j < state.selectedParticipants.length; j++) {
      var p = state.selectedParticipants[j];

      /* Try match by ID first, then by name+class, then by name only */
      var fresh = rosterById[p.id];
      if (!fresh) {
        var nKey = normalizer.normalizeFio(p.fullName) + '||' + (p.className || '').toUpperCase();
        fresh = rosterByNameClass[nKey];
      }
      if (!fresh) {
        fresh = rosterByName[normalizer.normalizeFio(p.fullName)];
      }
      if (!fresh) continue;

      /* If matched by name but IDs differ, update ID to roster ID
         and migrate standards selections to the new ID */
      if (fresh.id !== p.id) {
        var oldId = p.id;
        p.id = fresh.id;
        if (state.standardsSelections && state.standardsSelections[oldId]) {
          state.standardsSelections[fresh.id] = state.standardsSelections[oldId];
          delete state.standardsSelections[oldId];
        }
        changed = true;
      }

      for (var k = 0; k < syncFields.length; k++) {
        var field = syncFields[k];
        if (fresh[field] !== undefined && fresh[field] !== p[field]) {
          p[field] = fresh[field];
          changed = true;
        }
      }
    }

    if (changed) {
      appState.save();
    }
  }

  /* ---- Session bar integration ---- */
  function initSessionBar() {
    var sessionBar = document.getElementById('sessionBar');
    var sessionBarLabel = document.getElementById('sessionBarLabel');
    var sessionBarSave = document.getElementById('sessionBarSave');
    var backBtn = document.getElementById('backToDashboard');
    var sessionId = storage.getSessionId ? storage.getSessionId() : null;

    if (!sessionId || !sessionBar) return;

    sessionBar.style.display = '';

    /* Show session label */
    if (window.GTOSessions) {
      window.GTOSessions.getSession(sessionId).then(function (session) {
        if (session) {
          sessionBarLabel.textContent = session.label || 'Рабочая сессия';
        }
      });
    }

    /* Flush data before navigating away */
    if (backBtn) {
      backBtn.addEventListener('click', function (event) {
        event.preventDefault();
        if (storage.flush) {
          storage.flush().then(function () {
            window.location.href = 'index.html';
          });
        } else {
          window.location.href = 'index.html';
        }
      });
    }

    /* Autosave indicator */
    var originalSave = storage.save;
    if (originalSave && sessionBarSave) {
      storage.save = function (state) {
        originalSave.call(storage, state);
        sessionBarSave.textContent = 'Сохранено';
        sessionBarSave.classList.add('is-visible');
        clearTimeout(storage._saveIndicatorTimeout);
        storage._saveIndicatorTimeout = setTimeout(function () {
          sessionBarSave.classList.remove('is-visible');
        }, 2000);
      };
    }
  }

  /* ---- Initialization ---- */
  async function init() {
    /* Wait for session storage to load data from IndexedDB (if in session context) */
    if (storage.initSession) {
      await storage.initSession();
      appState.reloadFromStorage();

      /* If this is a brand-new session, pre-populate eventDate from session metadata */
      var sessionId = storage.getSessionId ? storage.getSessionId() : null;
      if (sessionId && window.GTOSessions && !appState.getState().meta.eventDate) {
        var session = await window.GTOSessions.getSession(sessionId);
        if (session && session.eventDate) {
          appState.updateMeta({ eventDate: session.eventDate });
        }
      }
    }

    /* Auto-load data from school roster if available */
    var currentState = appState.getState();
    var hasAnalysis = currentState.analysis && currentState.analysis.school && currentState.analysis.school.allStudents && currentState.analysis.school.allStudents.length > 0;
    if (!hasAnalysis) {
      var loaded = await loadFromRoster();
      if (loaded) {
        /* Skip prepare step — go straight to participant selection */
        appState.setCurrentStep('select');
      }
    } else {
      /* Refresh roster data even if analysis exists (user may have edited roster) */
      await loadFromRoster();
    }

    /* Sync selected participants with fresh roster data */
    syncSelectedFromRoster();

    /* Sync global school settings (schoolName, director) from dashboard into session meta */
    syncGlobalSettingsToMeta();

    bindMetaInputs();
    bindActions();
    initSessionBar();
    render();
  }

  /* Flush session data before page unload to avoid data loss */
  window.addEventListener('beforeunload', function () {
    if (storage.flush) storage.flush();
  });

  init();
})();
