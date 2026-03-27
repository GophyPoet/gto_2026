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
    schoolNameInput: document.getElementById('schoolNameInput'),
    directorInput: document.getElementById('directorInput'),
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
    reviewStats: document.getElementById('reviewStats'),
    reviewIssues: document.getElementById('reviewIssues'),
    reviewTableWrap: document.getElementById('reviewTableWrap'),
    downloadExcelBtn: document.getElementById('downloadExcelBtn')
  };

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
    renderReview();
    updateButtons();
  }

  function renderNav() {
    const state = appState.getState();
    els.stepNav.innerHTML = config.steps.map((step, index) => `
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
    els.schoolNameInput.value = state.meta.schoolName || '';
    els.directorInput.value = state.meta.director || '';
    els.submissionDateInput.value = utils.toInputDate(state.meta.submissionDate);
    els.eventDateInput.value = utils.toInputDate(state.meta.eventDate);

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
            <span>${escapeHtml(field)}</span>
            <select data-prefix="${prefix}" data-field="${field}">
              <option value="">Не выбрано</option>
              ${headers.map((header, index) => `<option value="${index}" ${String(value) === String(index) ? 'selected' : ''}>${escapeHtml(header)}</option>`).join('')}
            </select>
          </label>
        `).join('')}
      </div>
    `;
  }

  function renderSelect() {
    const state = appState.getState();
    if (!state.analysis.school) {
      els.studentsTableWrap.innerHTML = '<div class="empty-state">Сначала проанализируйте файлы на первом шаге.</div>';
      els.selectedList.innerHTML = '<div class="empty-state">Пока никто не выбран.</div>';
      return;
    }

    const classes = state.analysis.school.classes;
    const classItem = classes.find((item) => item.name === currentClass) || classes[0];
    currentClass = classItem ? classItem.name : '';
    els.classTabs.innerHTML = classes.map((item) => `
      <button class="class-tab ${item.name === currentClass ? 'is-active' : ''}" data-class="${item.name}" type="button">${item.name}</button>
    `).join('');
    els.classTabs.querySelectorAll('[data-class]').forEach((button) => {
      button.addEventListener('click', () => {
        currentClass = button.dataset.class;
        renderSelect();
      });
    });

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

    els.studentsTableWrap.innerHTML = `
      <table>
        <thead><tr><th>ФИО</th><th>Класс</th><th>УИН</th><th>Действие</th></tr></thead>
        <tbody>
          ${students.map((student) => `
            <tr>
              <td>${escapeHtml(student.fullName)}</td>
              <td>${escapeHtml(student.className)}</td>
              <td>${escapeHtml(student.uin || '-')}</td>
              <td>${selectedIds.has(student.id) ? 'Уже в заявке' : `<button class="btn btn-primary" data-add="${student.id}" type="button">Добавить</button>`}</td>
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

  function renderReview() {
    const state = appState.getState();
    if (!state.analysis.school || !state.analysis.asu || !state.analysis.template) {
      els.reviewStats.innerHTML = '';
      els.reviewTableWrap.innerHTML = '<div class="empty-state">Сначала завершите подготовку данных.</div>';
      renderIssues(els.reviewIssues, [], 'Нет данных для проверки.');
      return;
    }

    const rows = appState.buildGeneratedRows();
    const problemsCount = rows.reduce((sum, row) => sum + row.issues.length, 0);
    const missingRows = rows.filter((row) => row.issues.length).length;
    els.reviewStats.innerHTML = `
      <div class="stat-card"><strong>Строк в выгрузке</strong><div>${rows.length}</div></div>
      <div class="stat-card"><strong>Записей с проверкой</strong><div>${missingRows}</div></div>
      <div class="stat-card"><strong>Всего проблемных полей</strong><div>${problemsCount}</div></div>
      <div class="stat-card"><strong>Дата ГТО</strong><div>${escapeHtml(state.meta.eventDate || 'Не указана')}</div></div>
    `;
    renderIssues(els.reviewIssues, state.analysis.issues, 'Все поля заполнены. Можно скачивать Excel.');

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

  function updateButtons() {
    const state = appState.getState();
    const index = config.steps.findIndex((step) => step.id === state.currentStep);
    els.prevStepBtn.disabled = index === 0;
    els.nextStepBtn.disabled = index === config.steps.length - 1;
  }

  function canOpenStep(stepId) {
    const state = appState.getState();
    if (stepId === 'prepare') return true;
    if (stepId === 'select') return Boolean(state.analysis.school && state.analysis.asu && state.analysis.template);
    if (stepId === 'review') return Boolean(state.selectedParticipants.length);
    return false;
  }

  function moveStep(direction) {
    const state = appState.getState();
    const currentIndex = config.steps.findIndex((step) => step.id === state.currentStep);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= config.steps.length) return;
    const nextStep = config.steps[nextIndex];
    if (!canOpenStep(nextStep.id)) {
      if (nextStep.id === 'select') alert('Сначала загрузите и проанализируйте два файла.');
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
      appState.setAnalysis({
        school: excelReader.parseSchoolWorkbook(files.school, appState.getState().mappings.school),
        asu: excelReader.parseAsuWorkbook(files.asu, appState.getState().mappings.asu),
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
    [els.schoolNameInput, els.directorInput, els.submissionDateInput, els.eventDateInput].forEach((element) => {
      element.addEventListener('change', () => {
        appState.updateMeta({
          schoolName: els.schoolNameInput.value.trim(),
          director: els.directorInput.value.trim(),
          submissionDate: els.submissionDateInput.value,
          eventDate: els.eventDateInput.value
        });
        renderProjectSummary();
      });
    });
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
  }

  bindMetaInputs();
  bindActions();
  render();
})();
