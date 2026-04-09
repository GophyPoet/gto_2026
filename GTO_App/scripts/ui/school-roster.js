/**
 * school-roster.js — Dashboard UI for managing school classes and students.
 * Renders into #schoolRoster container on the dashboard.
 *
 * Tab system:
 *   - Dynamic class tabs (from imported data)
 *   - Fixed tabs: Архив, Работники школы, Родители, Дополнительно
 */
(function () {
  'use strict';

  var school = window.GTOSchool;
  var importer = window.GTOSchoolImport;
  var exporter = window.GTOSchoolExport;

  /* ====== Current state ====== */
  var selectedClassId = null;
  /* activeFixedTab: 'all' | 'homeschool' | 'archive' | 'staff' | 'parents' | 'extra' | null */
  var activeFixedTab = null;

  var FIXED_TABS = [
    { id: 'all', label: 'Все классы' },
    { id: 'homeschool', label: 'Домашники' },
    { id: 'archive', label: 'Архив' },
    { id: 'staff', label: 'Работники школы' },
    { id: 'parents', label: 'Родители' },
    { id: 'extra', label: 'Дополнительно' }
  ];

  /* Search / status-filter state (applied inside the current view). */
  var searchQuery = '';
  var searchFilter = 'all'; /* 'all' | 'missingUin' | 'hasUin' | 'homeschool' */

  /* Advanced multi-class selection. Non-empty Set switches the registry
     into an aggregated multi-class view sorted alphabetically by ФИО. */
  var multiSelectedClassIds = null; /* Set<string> | null */
  var showClassPicker = false;      /* toolbar popup visibility */
  var showColumnPicker = false;     /* toolbar popup visibility */

  /* ====== Column configuration (persistent) ====== */
  /**
   * Full catalogue of columns the user can show in the registry table.
   * `editable: true` means clicking the cell opens the inline edit flow
   * (prompt + confirmation) wired through handleEditField / handleEditUin.
   * `alwaysOn: true` columns cannot be hidden.
   * `aggregatedOnly: true` columns only make sense in aggregated views.
   */
  var COLUMN_DEFS = [
    { key: 'order',               label: '№',                width: '60px',  editable: false, alwaysOn: true  },
    { key: 'fullName',            label: 'ФИО',              width: '',      editable: true,  alwaysOn: true  },
    { key: 'uin',                 label: 'УИН',              width: '170px', editable: true,  alwaysOn: true  },
    { key: 'className',           label: 'Класс',            width: '100px', editable: false, aggregatedOnly: true, alwaysOn: true },
    { key: 'gender',              label: 'Пол',              width: '90px',  editable: true   },
    { key: 'birthDate',           label: 'Дата рождения',    width: '130px', editable: true   },
    { key: 'formOfEducation',     label: 'Форма обучения',   width: '140px', editable: true   },
    { key: 'documentType',        label: 'Тип документа',    width: '140px', editable: true   },
    { key: 'documentSeries',      label: 'Серия',            width: '90px',  editable: true   },
    { key: 'documentNumber',      label: 'Номер документа',  width: '140px', editable: true   },
    { key: 'snils',               label: 'СНИЛС',            width: '150px', editable: true   },
    { key: 'residenceLocality',   label: 'Нас. пункт',       width: '140px', editable: true   },
    { key: 'residenceStreetType', label: 'Тип улицы',        width: '110px', editable: true   },
    { key: 'residenceStreetName', label: 'Улица',            width: '160px', editable: true   },
    { key: 'residenceHouse',      label: 'Дом',              width: '80px',  editable: true   },
    { key: 'residenceBuilding',   label: 'Корпус',           width: '80px',  editable: true   },
    { key: 'residenceApartment',  label: 'Квартира',         width: '90px',  editable: true   },
    { key: 'actions',             label: 'Действия',         width: '200px', editable: false, alwaysOn: true  }
  ];

  var COLUMNS_STORAGE_KEY = 'gto-roster-columns-v1';
  var DEFAULT_VISIBLE_COLUMNS = ['order', 'fullName', 'uin', 'actions'];

  function loadColumnSettings() {
    try {
      var raw = localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (!raw) return DEFAULT_VISIBLE_COLUMNS.slice();
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return DEFAULT_VISIBLE_COLUMNS.slice();
      /* Keep only keys we know about */
      var known = COLUMN_DEFS.map(function (c) { return c.key; });
      var filtered = parsed.filter(function (k) { return known.indexOf(k) >= 0; });
      /* Ensure always-on columns are present */
      COLUMN_DEFS.forEach(function (def) {
        if (def.alwaysOn && !def.aggregatedOnly && filtered.indexOf(def.key) < 0) filtered.push(def.key);
      });
      return filtered;
    } catch (e) {
      return DEFAULT_VISIBLE_COLUMNS.slice();
    }
  }
  function saveColumnSettings(keys) {
    try { localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(keys)); } catch (e) { /* ignore */ }
  }

  var visibleColumnKeys = loadColumnSettings();

  /**
   * Resolve the list of COLUMN_DEFS that should be displayed in the
   * requested view. `view` is 'class' (per-class detail) or 'aggregated'.
   * Aggregated views always include the 'className' column.
   */
  function getActiveColumns(view) {
    var set = {};
    visibleColumnKeys.forEach(function (k) { set[k] = true; });
    /* Always-on columns */
    COLUMN_DEFS.forEach(function (def) {
      if (def.alwaysOn && !def.aggregatedOnly) set[def.key] = true;
      if (def.alwaysOn && def.aggregatedOnly && view === 'aggregated') set[def.key] = true;
    });
    return COLUMN_DEFS.filter(function (def) {
      if (def.aggregatedOnly && view !== 'aggregated') return false;
      return Boolean(set[def.key]);
    });
  }

  /* ---- Helpers ---- */
  function esc(v) {
    return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(id) { return document.getElementById(id); }

  /* ---- Custom confirm dialog ----
   * We deliberately avoid window.confirm(): when repeated, browsers attach a
   * "Don't show again" checkbox that, once ticked, permanently disables every
   * future confirm() on the page — a foot-gun that silently broke all edit
   * confirmations for the user.  This helper builds a simple <dialog> modal
   * on demand with only Yes / No buttons and returns a Promise<boolean>.
   *
   * opts:
   *   title          — dialog heading
   *   bodyHtml       — inner HTML for the body (already escaped by caller)
   *   confirmText    — label on the confirm button  (default "Да")
   *   cancelText     — label on the cancel button   (default "Отмена")
   *   confirmVariant — 'primary' | 'danger' (default 'primary')
   */
  var askConfirmDialog = null;
  function askConfirm(opts) {
    return new Promise(function (resolve) {
      var title = (opts && opts.title) || 'Подтверждение';
      var bodyHtml = (opts && opts.bodyHtml) || '';
      var confirmText = (opts && opts.confirmText) || 'Да';
      var cancelText = (opts && opts.cancelText) || 'Отмена';
      var confirmVariant = (opts && opts.confirmVariant) === 'danger' ? 'btn-danger' : 'btn-primary';

      /* Lazy-create the dialog element and keep it in the DOM. */
      var dlg = askConfirmDialog;
      if (!dlg) {
        dlg = document.createElement('dialog');
        dlg.className = 'dialog';
        dlg.innerHTML =
          '<div class="dialog-form">' +
            '<div class="dialog-head">' +
              '<h3 data-role="title"></h3>' +
              '<button class="icon-btn" type="button" data-role="close">&times;</button>' +
            '</div>' +
            '<div class="dialog-body" data-role="body"></div>' +
            '<div class="dialog-actions">' +
              '<button class="btn btn-secondary" type="button" data-role="cancel"></button>' +
              '<button class="btn btn-primary" type="button" data-role="confirm"></button>' +
            '</div>' +
          '</div>';
        document.body.appendChild(dlg);
        askConfirmDialog = dlg;
      }

      var titleEl = dlg.querySelector('[data-role="title"]') || dlg.querySelector('h3');
      var bodyEl = dlg.querySelector('[data-role="body"]');
      var confirmBtn = dlg.querySelector('[data-role="confirm"]');
      var cancelBtn = dlg.querySelector('[data-role="cancel"]');
      var closeBtn = dlg.querySelector('[data-role="close"]');

      titleEl.textContent = title;
      bodyEl.innerHTML = bodyHtml;
      confirmBtn.textContent = confirmText;
      confirmBtn.className = 'btn ' + confirmVariant;
      cancelBtn.textContent = cancelText;

      function cleanup(result) {
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        closeBtn.onclick = null;
        dlg.onclose = null;
        dlg.onkeydown = null;
        try { dlg.close(); } catch (e) { /* already closed */ }
        resolve(result);
      }

      confirmBtn.onclick = function () { cleanup(true); };
      cancelBtn.onclick = function () { cleanup(false); };
      closeBtn.onclick = function () { cleanup(false); };
      /* Pressing Esc or closing via backdrop resolves to false. */
      dlg.onclose = function () { resolve(false); };

      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    });
  }

  /* ---- Report dialog ---- */
  function showReport(title, report) {
    var dlg = $('reportDialog');
    if (!dlg) { alert(title); return; }
    $('reportTitle').textContent = title;

    var html = '';

    /* Summary badges */
    html += '<div class="report-summary">';
    var cats = [
      { key: 'added', label: 'Добавлено', css: 'added' },
      { key: 'moved', label: 'Перемещено', css: 'moved' },
      { key: 'updated', label: 'Обновлено', css: 'updated' },
      { key: 'archived', label: 'В архив', css: 'archived' },
      { key: 'skipped', label: 'Без изменений', css: 'skipped' },
      { key: 'conflicts', label: 'Конфликты', css: 'conflicts' }
    ];
    cats.forEach(function (c) {
      var arr = report[c.key];
      if (!arr || !arr.length) return;
      html += '<div class="report-summary-item report-cat-' + c.css + '">';
      html += '<span class="report-badge">' + arr.length + '</span> ' + c.label;
      html += '</div>';
    });
    html += '</div>';

    /* Detail sections */
    if (report.added && report.added.length) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title report-cat-added">Добавлены новые ученики</div>';
      html += '<ul class="report-list">';
      report.added.forEach(function (r) {
        html += '<li><span class="report-name">' + esc(r.student.fullName) + '</span>';
        html += '<span class="report-detail">' + esc(r.class || r.student.className || '') + '</span></li>';
      });
      html += '</ul></div>';
    }

    if (report.moved && report.moved.length) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title report-cat-moved">Перемещены в другой класс</div>';
      html += '<ul class="report-list">';
      report.moved.forEach(function (r) {
        html += '<li><span class="report-name">' + esc(r.student.fullName) + '</span>';
        html += '<span class="report-detail">' + esc(r.from) + '</span>';
        html += '<span class="report-arrow">&rarr;</span>';
        html += '<span class="report-detail">' + esc(r.to) + '</span></li>';
      });
      html += '</ul></div>';
    }

    if (report.updated && report.updated.length) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title report-cat-updated">Обновлены данные</div>';
      html += '<ul class="report-list">';
      report.updated.forEach(function (r) {
        html += '<li><span class="report-name">' + esc(r.student.fullName) + '</span>';
        html += '<span class="report-detail">' + esc((r.changes || []).join(', ')) + '</span></li>';
      });
      html += '</ul></div>';
    }

    if (report.archived && report.archived.length) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title report-cat-archived">Перемещены в архив</div>';
      html += '<ul class="report-list">';
      report.archived.forEach(function (r) {
        html += '<li><span class="report-name">' + esc(r.student.fullName) + '</span>';
        html += '<span class="report-detail">' + esc(r.student.className || '') + '</span>';
        html += '<span class="report-detail"> &mdash; ' + esc(r.reason || '') + '</span></li>';
      });
      html += '</ul></div>';
    }

    if (report.conflicts && report.conflicts.length) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title report-cat-conflicts">Конфликты (требуют внимания)</div>';
      html += '<ul class="report-list">';
      report.conflicts.forEach(function (r) {
        html += '<li><span class="report-name">' + esc(r.incoming.fullName) + '</span>';
        html += '<span class="report-detail">' + esc(r.reason) + '</span></li>';
      });
      html += '</ul></div>';
    }

    if (report.skipped && report.skipped.length) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title report-cat-skipped">Без изменений: ' + report.skipped.length + ' учен.</div>';
      html += '</div>';
    }

    $('reportBody').innerHTML = html;

    /* Bind close */
    var closeHandler = function () { dlg.close(); };
    $('reportCloseBtn').onclick = closeHandler;
    $('reportOkBtn').onclick = closeHandler;

    dlg.showModal();
  }

  function showImportReport(title, data) {
    var html = '';
    html += '<div class="report-summary">';
    html += '<div class="report-summary-item report-cat-added"><span class="report-badge">' + data.length + '</span> Классов</div>';
    var total = data.reduce(function (s, c) { return s + c.students.length; }, 0);
    html += '<div class="report-summary-item report-cat-skipped"><span class="report-badge">' + total + '</span> Учеников</div>';
    var withUin = data.reduce(function (s, c) { return s + c.students.filter(function (st) { return st.uin; }).length; }, 0);
    html += '<div class="report-summary-item report-cat-moved"><span class="report-badge">' + withUin + '</span> С УИН</div>';
    html += '</div>';

    html += '<div class="report-section">';
    html += '<div class="report-section-title report-cat-added">Загруженные классы</div>';
    html += '<ul class="report-list">';
    data.forEach(function (cls) {
      html += '<li><span class="report-name">' + esc(cls.className) + '</span>';
      html += '<span class="report-detail">' + cls.students.length + ' учен.</span></li>';
    });
    html += '</ul></div>';

    var dlg = $('reportDialog');
    $('reportTitle').textContent = title;
    $('reportBody').innerHTML = html;
    var closeHandler = function () { dlg.close(); };
    $('reportCloseBtn').onclick = closeHandler;
    $('reportOkBtn').onclick = closeHandler;
    dlg.showModal();
  }

  /* ---- Info helpers ---- */
  function infoField(label, value, studentId, fieldKey) {
    var v = value || '-';
    var editAttr = studentId && fieldKey ? ' data-edit-field="' + fieldKey + '" data-field-student="' + studentId + '"' : '';
    var editClass = editAttr ? ' roster-info-editable' : '';
    var editTitle = editAttr ? ' title="Нажмите для редактирования"' : '';
    return '<div class="roster-info-field' + editClass + '"' + editAttr + editTitle + '><span class="roster-info-label">' + esc(label) + '</span><span class="roster-info-value">' + esc(v) + '</span></div>';
  }
  /**
   * DATE-ONLY safe formatting. Delegates to GTODateUtils so we never
   * pipe birth dates through Date.toISOString() (which caused 23.04 to
   * become 22.04 in any positive-offset timezone).
   */
  function formatBirthDate(iso) {
    if (!iso) return '';
    if (window.GTODateUtils) return window.GTODateUtils.toDisplayDate(iso);
    var parts = String(iso).split('-');
    if (parts.length === 3) return parts[2] + '.' + parts[1] + '.' + parts[0];
    return iso;
  }

  /**
   * Convert a user-entered DD.MM.YYYY (or YYYY-MM-DD) into an ISO string
   * for storage. DATE-ONLY safe.
   */
  function parseBirthDateInput(value) {
    if (window.GTODateUtils) return window.GTODateUtils.toISODate(value);
    return value || '';
  }
  function buildStreet(s) {
    var parts = [];
    if (s.residenceStreetType) parts.push(s.residenceStreetType);
    if (s.residenceStreetName) parts.push(s.residenceStreetName);
    return parts.join(' ') || '';
  }
  function buildHouseAddr(s) {
    var parts = [];
    if (s.residenceHouse) parts.push('д. ' + s.residenceHouse);
    if (s.residenceBuilding) parts.push('корп. ' + s.residenceBuilding);
    if (s.residenceApartment) parts.push('кв. ' + s.residenceApartment);
    return parts.join(', ') || '';
  }

  /* ====== Render ======
   * The registry is split into a stable FRAME and a swappable CONTENT area:
   *   frame   = stats + actions + toolbar (search, filters, column picker) + tabs
   *   content = table / empty-state / aggregated view
   *
   * Search/filter/column changes call renderContent() only, which rewrites
   * ONLY #rosterContent. The search input element is never destroyed, so
   * focus and caret position are preserved on every keystroke. Previously
   * a full render was triggered on every key, which remounted the input
   * and stole focus — the reported bug.
   */
  var _cache = { classes: [], classMap: {} };

  async function render() {
    var container = $('schoolRoster');
    if (!container) return;

    var classes = await school.getAllClasses();
    var stats = await school.getStats();

    /* Normalize state against current class list */
    if (selectedClassId && !classes.find(function (c) { return c.id === selectedClassId; })) {
      selectedClassId = null;
    }
    if (multiSelectedClassIds) {
      var known = new Set(classes.map(function (c) { return c.id; }));
      var cleaned = new Set();
      multiSelectedClassIds.forEach(function (id) { if (known.has(id)) cleaned.add(id); });
      multiSelectedClassIds = cleaned.size ? cleaned : null;
    }
    _cache.classes = classes;
    _cache.classMap = {};
    classes.forEach(function (c) { _cache.classMap[c.id] = c; });

    var html = '';

    /* ---- Stats bar ---- */
    html += '<div class="roster-stats">';
    html += '<div class="roster-stat"><span class="roster-stat-val">' + stats.classCount + '</span><span class="roster-stat-lbl">Классов</span></div>';
    html += '<div class="roster-stat"><span class="roster-stat-val">' + stats.studentCount + '</span><span class="roster-stat-lbl">Учеников</span></div>';
    html += '<div class="roster-stat"><span class="roster-stat-val">' + stats.withUin + '</span><span class="roster-stat-lbl">С УИН</span></div>';
    html += '<div class="roster-stat"><span class="roster-stat-val">' + (stats.homeschoolerCount || 0) + '</span><span class="roster-stat-lbl">Домашники</span></div>';
    html += '<div class="roster-stat"><span class="roster-stat-val">' + stats.archivedCount + '</span><span class="roster-stat-lbl">В архиве</span></div>';
    html += '</div>';

    /* ---- Action bar ---- */
    html += '<div class="roster-actions">';
    html += '<button class="btn btn-primary btn-sm" id="rosterAddClass" type="button">+ Новый класс</button>';
    html += '<label class="btn btn-secondary btn-sm file-label">Импорт школы (Excel)<input type="file" id="rosterImportSchool" accept=".xlsx,.xls" style="display:none"></label>';
    html += '<label class="btn btn-secondary btn-sm file-label">Синхр. из АСУ РСО<input type="file" id="rosterImportAsu" accept=".xlsx,.xls" style="display:none"></label>';
    html += '<button class="btn btn-ghost btn-sm" id="rosterExportAll" type="button">Экспорт всех классов</button>';
    html += '</div>';

    /* ---- Toolbar: search + advanced filter + column settings ---- */
    html += buildToolbarHtml(classes);

    /* ---- Tabs (dynamic classes + fixed category tabs) ---- */
    html += '<div class="roster-class-tabs" id="rosterTabs">';
    classes.forEach(function (cls) {
      var active = (!activeFixedTab && !multiSelectedClassIds && cls.id === selectedClassId) ? ' is-active' : '';
      html += '<button class="roster-class-tab' + active + '" data-cid="' + cls.id + '" type="button">' + esc(cls.name) + '</button>';
    });
    if (classes.length > 0) html += '<span class="roster-tab-sep"></span>';
    FIXED_TABS.forEach(function (tab) {
      var active = activeFixedTab === tab.id ? ' is-active is-fixed' : ' is-fixed';
      html += '<button class="roster-class-tab' + active + '" data-fixed="' + tab.id + '" type="button">' + tab.label + '</button>';
    });
    html += '</div>';

    /* ---- Content slot (rewritten on search / filter / column changes) ---- */
    html += '<div id="rosterContent" class="roster-content-slot"></div>';

    container.innerHTML = html;
    bindFrameEvents(classes);
    await renderContent();
  }

  /* Build the frame toolbar HTML (search + filter + column picker). */
  function buildToolbarHtml(classes) {
    var html = '';
    html += '<div class="roster-search-bar" id="rosterToolbar">';
    html += '<input type="text" id="rosterSearchInput" placeholder="Поиск по ФИО, УИН…" value="' + esc(searchQuery) + '" autocomplete="off">';

    html += '<select id="rosterFilterSelect" title="Быстрый фильтр">';
    html += '<option value="all"' + (searchFilter === 'all' ? ' selected' : '') + '>Все</option>';
    html += '<option value="missingUin"' + (searchFilter === 'missingUin' ? ' selected' : '') + '>Без УИН</option>';
    html += '<option value="hasUin"' + (searchFilter === 'hasUin' ? ' selected' : '') + '>С УИН</option>';
    html += '<option value="homeschool"' + (searchFilter === 'homeschool' ? ' selected' : '') + '>Домашники</option>';
    html += '</select>';

    /* Advanced multi-class picker */
    var multiCount = multiSelectedClassIds ? multiSelectedClassIds.size : 0;
    var multiLabel = multiCount
      ? 'Выбрано классов: ' + multiCount
      : 'Расширенный фильтр классов';
    html += '<div class="roster-filter-dropdown">';
    html += '<button class="btn btn-ghost btn-sm' + (multiCount ? ' is-active' : '') + '" id="rosterFilterToggle" type="button" aria-expanded="' + (showClassPicker ? 'true' : 'false') + '">' + esc(multiLabel) + ' ▾</button>';
    if (showClassPicker) {
      html += '<div class="roster-filter-panel" id="rosterFilterPanel">';
      html += '<div class="roster-filter-panel-head">';
      html += '<strong>Фильтр по классам</strong>';
      html += '<div class="roster-filter-panel-actions">';
      html += '<button type="button" class="btn btn-ghost btn-sm" id="rosterFilterSelectAll">Выбрать все</button>';
      html += '<button type="button" class="btn btn-ghost btn-sm" id="rosterFilterClear">Сбросить</button>';
      html += '</div></div>';
      html += '<div class="roster-filter-list">';
      if (!classes.length) {
        html += '<div class="roster-empty">Классы ещё не созданы.</div>';
      }
      classes.forEach(function (cls) {
        var checked = multiSelectedClassIds && multiSelectedClassIds.has(cls.id) ? ' checked' : '';
        html += '<label class="roster-filter-chip"><input type="checkbox" data-multi-class="' + cls.id + '"' + checked + '> ' + esc(cls.name) + '</label>';
      });
      html += '</div>';
      html += '<div class="roster-filter-panel-foot">';
      html += '<button type="button" class="btn btn-primary btn-sm" id="rosterFilterApply">Применить</button>';
      html += '</div>';
      html += '</div>';
    }
    html += '</div>';

    /* Column settings dropdown */
    html += '<div class="roster-filter-dropdown">';
    html += '<button class="btn btn-ghost btn-sm" id="rosterColumnsToggle" type="button" aria-expanded="' + (showColumnPicker ? 'true' : 'false') + '" title="Настройки колонок таблицы">⚙ Колонки</button>';
    if (showColumnPicker) {
      html += '<div class="roster-filter-panel" id="rosterColumnsPanel">';
      html += '<div class="roster-filter-panel-head">';
      html += '<strong>Отображаемые колонки</strong>';
      html += '<div class="roster-filter-panel-actions">';
      html += '<button type="button" class="btn btn-ghost btn-sm" id="rosterColumnsReset">По умолчанию</button>';
      html += '</div></div>';
      html += '<div class="roster-filter-list roster-columns-list">';
      COLUMN_DEFS.forEach(function (def) {
        if (def.aggregatedOnly) return; /* aggregated-only auto-managed */
        var checked = visibleColumnKeys.indexOf(def.key) >= 0 ? ' checked' : '';
        var disabled = def.alwaysOn ? ' disabled' : '';
        html += '<label class="roster-filter-chip"><input type="checkbox" data-col-key="' + def.key + '"' + checked + disabled + '> ' + esc(def.label) + '</label>';
      });
      html += '</div>';
      html += '<div class="roster-filter-panel-foot">';
      html += '<span class="roster-hint">Изменения применяются сразу и сохраняются в этом браузере.</span>';
      html += '</div>';
      html += '</div>';
    }
    html += '</div>';

    html += '</div>'; /* /toolbar */
    return html;
  }

  /* Content-only render (preserves the search input element and focus). */
  async function renderContent() {
    var slot = $('rosterContent');
    if (!slot) return;
    var classes = _cache.classes;

    /* Decide which view to render: */
    var html = '';
    if (multiSelectedClassIds && multiSelectedClassIds.size > 0) {
      html = await renderAggregatedView(classes, Array.from(multiSelectedClassIds), 'multi');
    } else if (activeFixedTab === 'all') {
      var allIds = classes.map(function (c) { return c.id; });
      html = await renderAggregatedView(classes, allIds, 'all');
    } else if (activeFixedTab === 'homeschool') {
      html = await renderHomeschoolList();
    } else if (activeFixedTab === 'archive') {
      html = await renderArchive();
    } else if (activeFixedTab === 'staff') {
      html = await renderPersonList('staff', 'Работники школы', 'Добавьте работников школы для формирования заявок.');
    } else if (activeFixedTab === 'parents') {
      html = await renderPersonList('parents', 'Родители', 'Добавьте родителей для формирования заявок.');
    } else if (activeFixedTab === 'extra') {
      html = await renderPersonList('extra', 'Дополнительно', 'Дополнительный список участников.');
    } else if (searchQuery) {
      /* Global search fallback when no tab selected */
      var allIds2 = classes.map(function (c) { return c.id; });
      html = await renderAggregatedView(classes, allIds2, 'search');
    } else if (selectedClassId) {
      html = await renderClassDetail(selectedClassId, classes);
    } else if (classes.length > 0) {
      html = '<div class="roster-empty">Выберите класс для просмотра списка учеников или нажмите «Все классы».</div>';
    } else {
      html = '<div class="roster-empty">Список классов пуст. Импортируйте файл школы или создайте класс вручную.</div>';
    }

    slot.innerHTML = html;
    bindContentEvents(classes);
  }

  /* ====== Column-driven row rendering ======
   *
   * Single source of truth used by both the class-detail view and the
   * aggregated (all / multi-class) view. Editable cells carry `data-edit-field`
   * attributes that the content-event binder wires to `handleEditField`,
   * which runs a prompt + confirmation before saving — satisfying the
   * "quick inline edit with confirmation" requirement.
   *
   * Each data row is rendered as TWO <tr>s:
   *   1. Main row (cells for the active columns + an "i" badge next to ФИО
   *      when the student has data outside the visible columns).
   *   2. Expandable info row (.roster-info-row) hidden by default. Its grid
   *      contains all editable data fields that are NOT currently visible as
   *      columns — so adding a column via the picker automatically removes
   *      that field from the expanded info block.
   */

  /* Columns that are candidates for the "extra info" popup: editable data
     fields, not always-on, not aggregated-only, not actions. */
  function getHiddenDataColumns() {
    var visible = {};
    visibleColumnKeys.forEach(function (k) { visible[k] = true; });
    return COLUMN_DEFS.filter(function (def) {
      if (def.alwaysOn) return false;
      if (def.aggregatedOnly) return false;
      if (def.key === 'actions') return false;
      if (!def.editable) return false;
      return !visible[def.key];
    });
  }

  function getStudentFieldDisplayValue(s, key) {
    if (key === 'birthDate') return formatBirthDate(s.birthDate) || '';
    return s[key] || '';
  }

  /* Does this student have any value in at least one hidden data field?
     Used to decide whether the "i" badge is shown. */
  function hasHiddenInfo(s, hiddenCols) {
    for (var i = 0; i < hiddenCols.length; i++) {
      if (getStudentFieldDisplayValue(s, hiddenCols[i].key)) return true;
    }
    return false;
  }

  function renderCellValue(col, s, classMap, ctx) {
    if (col.key === 'order') return (s.classNumber || '-');
    if (col.key === 'fullName') {
      var name = esc(s.fullName || '');
      if (ctx && ctx.hiddenCols && ctx.hiddenCols.length && hasHiddenInfo(s, ctx.hiddenCols)) {
        name += ' <span class="roster-info-badge" data-toggle-info="' + esc(s.id) + '" title="Показать доп. информацию">i</span>';
      }
      return name;
    }
    if (col.key === 'uin') return esc(s.uin || '-');
    if (col.key === 'className') {
      var cname = classMap && classMap[s.classId] ? classMap[s.classId].name : '';
      return esc(cname || '-');
    }
    if (col.key === 'birthDate') return esc(formatBirthDate(s.birthDate) || '-');
    if (col.key === 'actions') {
      var html = '';
      html += '<button class="btn-icon-sm" data-edit-student="' + s.id + '" title="Редактировать">&#9998;</button>';
      html += '<button class="btn-icon-sm" data-move-student="' + s.id + '" title="Перенести">&#8644;</button>';
      html += '<button class="btn-icon-sm" data-archive-student="' + s.id + '" title="В архив">&#128451;</button>';
      html += '<button class="btn-icon-sm btn-icon-danger" data-del-student="' + s.id + '" title="Удалить">&times;</button>';
      return html;
    }
    return esc(s[col.key] || '-');
  }

  /* Render the hidden "extra info" row that follows every data row. */
  function renderInfoRow(s, columns, hiddenCols) {
    if (!hiddenCols || !hiddenCols.length) return '';
    if (!hasHiddenInfo(s, hiddenCols)) return '';
    var html = '<tr class="roster-info-row" id="info-' + esc(s.id) + '" style="display:none">';
    html += '<td colspan="' + columns.length + '">';
    html += '<div class="roster-info-grid">';
    hiddenCols.forEach(function (col) {
      var val = getStudentFieldDisplayValue(s, col.key);
      html += infoField(col.label, val, s.id, col.key);
    });
    html += '</div></td></tr>';
    return html;
  }

  function renderRow(s, columns, classMap) {
    var hiddenCols = getHiddenDataColumns();
    var ctx = { hiddenCols: hiddenCols };
    var html = '<tr data-sid="' + esc(s.id) + '">';
    columns.forEach(function (col) {
      var cls = 'roster-cell-' + col.key;
      var attrs = '';
      if (col.editable && col.key !== 'actions' && col.key !== 'fullName') {
        cls += ' roster-editable-cell';
        if (col.key === 'uin') {
          attrs = ' data-edit-uin="' + esc(s.id) + '" title="Нажмите, чтобы изменить УИН"';
        } else {
          attrs = ' data-edit-field="' + esc(col.key) + '" data-field-student="' + esc(s.id) + '" title="Нажмите, чтобы изменить"';
        }
      }
      if (col.key === 'actions') cls += ' roster-row-actions';
      html += '<td class="' + cls + '"' + attrs + '>' + renderCellValue(col, s, classMap, ctx) + '</td>';
    });
    html += '</tr>';
    html += renderInfoRow(s, columns, hiddenCols);
    return html;
  }

  function renderTableHead(columns) {
    var html = '<thead><tr>';
    columns.forEach(function (col) {
      var w = col.width ? ' style="width:' + col.width + '"' : '';
      html += '<th' + w + '>' + esc(col.label) + '</th>';
    });
    html += '</tr></thead>';
    return html;
  }

  /* ---- Class detail ---- */
  async function renderClassDetail(classId, allClasses) {
    var cls = allClasses.find(function (c) { return c.id === classId; });
    if (!cls) return '';
    var students = await school.getStudentsByClass(classId);

    /* Apply in-class status filter + search */
    var q = (searchQuery || '').toUpperCase();
    students = students.filter(function (s) { return matchesStatusFilter(s) && matchesSearch(s, q); });

    var columns = getActiveColumns('class');

    var html = '<div class="roster-detail">';

    /* Class header */
    html += '<div class="roster-detail-head">';
    html += '<div class="roster-detail-title">';
    html += '<h3>' + esc(cls.name) + '</h3>';
    html += '<span class="roster-detail-count">' + students.length + ' учен.</span>';
    html += '</div>';
    html += '<div class="roster-detail-actions">';
    html += '<button class="btn btn-sm btn-secondary" data-rename="' + cls.id + '" type="button">Переименовать</button>';
    html += '<button class="btn btn-sm btn-ghost" data-export-class="' + cls.id + '" type="button">Экспорт класса</button>';
    html += '<button class="btn btn-sm btn-secondary" data-add-student="' + cls.id + '" type="button">+ Ученик</button>';
    if (students.length === 0) {
      html += '<button class="btn btn-sm" style="background:var(--warning);color:white" data-delete-class="' + cls.id + '" type="button">Удалить класс</button>';
    }
    html += '</div></div>';

    if (students.length > 0) {
      html += '<div class="roster-table-wrap"><table class="roster-table">';
      html += renderTableHead(columns);
      html += '<tbody>';
      students.forEach(function (s) {
        html += renderRow(s, columns, null);
      });
      html += '</tbody></table></div>';

      /* Mass actions */
      if (allClasses.length > 1 || students.length > 0) {
        html += '<div class="roster-mass-move">';
        html += '<label><input type="checkbox" id="rosterSelectAll"> Выбрать всех</label>';
        if (allClasses.length > 1) {
          html += '<select id="rosterMoveTarget"><option value="">Переместить в...</option>';
          allClasses.forEach(function (c) {
            if (c.id !== classId) html += '<option value="' + c.id + '">' + esc(c.name) + '</option>';
          });
          html += '</select>';
          html += '<button class="btn btn-sm btn-ghost" id="rosterMassMove" type="button">Переместить</button>';
        }
        html += '<button class="btn btn-sm btn-secondary" id="rosterMassArchive" type="button">В архив</button>';
        html += '</div>';
      }
    } else {
      html += '<div class="roster-empty">' + (searchQuery ? 'По запросу «' + esc(searchQuery) + '» ничего не найдено в этом классе.' : 'В классе пока нет учеников.') + '</div>';
    }

    html += '</div>';
    return html;
  }

  /* ---- Aggregated multi-class view (all classes, multi-select, or search) ---- */
  async function renderAggregatedView(allClasses, classIds, mode) {
    var classMap = {};
    allClasses.forEach(function (c) { classMap[c.id] = c; });

    var buckets = [];
    for (var i = 0; i < classIds.length; i++) {
      var list = await school.getStudentsByClass(classIds[i]);
      for (var j = 0; j < list.length; j++) buckets.push(list[j]);
    }

    var q = (searchQuery || '').toUpperCase();
    var filtered = buckets.filter(function (s) {
      return matchesStatusFilter(s) && matchesSearch(s, q);
    });

    /* Alphabetical by ФИО (ru locale) — default sort for aggregated view. */
    filtered.sort(function (a, b) {
      return (a.fullName || '').localeCompare(b.fullName || '', 'ru');
    });

    /* Assign sequential row numbers for the aggregated view (override
       classNumber which is class-local and would otherwise repeat). */
    filtered.forEach(function (s, idx) { s._aggIndex = idx + 1; });

    var columns = getActiveColumns('aggregated');
    var hiddenCols = getHiddenDataColumns();
    var ctx = { hiddenCols: hiddenCols };
    /* In aggregated views, the "order" column is the aggregated sequence. */
    var renderAggCell = function (col, s) {
      if (col.key === 'order') return s._aggIndex;
      return renderCellValue(col, s, classMap, ctx);
    };

    var title = mode === 'all'
      ? 'Все классы'
      : mode === 'multi'
        ? 'Выбранные классы (' + classIds.length + ')'
        : 'Результаты поиска';

    var html = '<div class="roster-detail">';
    html += '<div class="roster-detail-head">';
    html += '<div class="roster-detail-title">';
    html += '<h3>' + esc(title) + '</h3>';
    html += '<span class="roster-detail-count">' + filtered.length + ' учен.</span>';
    html += '</div></div>';

    if (!filtered.length) {
      html += '<div class="roster-empty">' + (searchQuery ? 'Ничего не найдено по запросу «' + esc(searchQuery) + '».' : 'Нет учеников, соответствующих фильтру.') + '</div>';
    } else {
      html += '<div class="roster-table-wrap"><table class="roster-table">';
      html += renderTableHead(columns);
      html += '<tbody>';
      filtered.forEach(function (s) {
        var tr = '<tr data-sid="' + esc(s.id) + '">';
        columns.forEach(function (col) {
          var cls = 'roster-cell-' + col.key;
          var attrs = '';
          if (col.editable && col.key !== 'fullName' && col.key !== 'actions') {
            cls += ' roster-editable-cell';
            if (col.key === 'uin') {
              attrs = ' data-edit-uin="' + esc(s.id) + '" title="Нажмите, чтобы изменить УИН"';
            } else {
              attrs = ' data-edit-field="' + esc(col.key) + '" data-field-student="' + esc(s.id) + '" title="Нажмите, чтобы изменить"';
            }
          }
          if (col.key === 'actions') cls += ' roster-row-actions';
          tr += '<td class="' + cls + '"' + attrs + '>' + renderAggCell(col, s) + '</td>';
        });
        tr += '</tr>';
        tr += renderInfoRow(s, columns, hiddenCols);
        html += tr;
      });
      html += '</tbody></table></div>';
    }

    html += '</div>';
    return html;
  }

  /* ---- Filter helpers (shared by class / aggregated / homeschool views) ---- */
  function matchesStatusFilter(s) {
    if (searchFilter === 'missingUin') return !s.uin || s.uin === '-' || s.uin === '';
    if (searchFilter === 'hasUin') return s.uin && s.uin !== '-' && s.uin !== '';
    if (searchFilter === 'homeschool') return school.isHomeschooler(s);
    return true;
  }
  function matchesSearch(s, q) {
    if (!q) return true;
    return (s.fullName || '').toUpperCase().includes(q)
      || (s.uin || '').toUpperCase().includes(q);
  }

  /* ---- Archive view ---- */
  async function renderArchive() {
    var archived = await school.getArchivedStudents();

    var html = '<div class="roster-detail">';
    html += '<div class="roster-detail-head">';
    html += '<div class="roster-detail-title">';
    html += '<h3>Архив</h3>';
    html += '<span class="roster-detail-count">' + archived.length + ' учен.</span>';
    html += '</div>';
    html += '</div>';

    if (archived.length > 0) {
      html += '<div class="roster-table-wrap"><table class="roster-table">';
      html += '<thead><tr><th>ФИО</th><th style="width:120px">Класс</th><th style="width:180px">УИН</th><th style="width:200px">Причина</th><th style="width:120px">Дата</th><th style="width:160px">Действия</th></tr></thead>';
      html += '<tbody>';
      archived.forEach(function (a) {
        var date = a.archivedAt ? new Date(a.archivedAt).toLocaleDateString('ru-RU') : '-';
        html += '<tr>';
        html += '<td>' + esc(a.fullName) + '</td>';
        html += '<td>' + esc(a.originalClassName || '-') + '</td>';
        html += '<td>' + esc(a.uin || '-') + '</td>';
        html += '<td class="roster-reason">' + esc(a.reason || '-') + '</td>';
        html += '<td>' + date + '</td>';
        html += '<td class="roster-row-actions">';
        html += '<button class="btn btn-sm btn-ghost" data-restore="' + a.id + '" type="button">Восстановить</button>';
        html += '<button class="btn-icon-sm btn-icon-danger" data-del-archived="' + a.id + '" title="Удалить навсегда">&times;</button>';
        html += '</td></tr>';
      });
      html += '</tbody></table></div>';
    } else {
      html += '<div class="roster-empty">Архив пуст.</div>';
    }

    html += '</div>';
    return html;
  }

  /* ---- Person list (staff / parents / extra) ---- */
  async function renderPersonList(storeName, title, emptyText) {
    var api = school[storeName];
    var people = await api.getAll();

    var html = '<div class="roster-detail">';
    html += '<div class="roster-detail-head">';
    html += '<div class="roster-detail-title">';
    html += '<h3>' + esc(title) + '</h3>';
    html += '<span class="roster-detail-count">' + people.length + ' чел.</span>';
    html += '</div>';
    html += '<div class="roster-detail-actions">';
    html += '<button class="btn btn-sm btn-primary" data-add-person="' + storeName + '" type="button">+ Добавить</button>';
    html += '</div></div>';

    if (people.length > 0) {
      html += '<div class="roster-table-wrap"><table class="roster-table">';
      html += '<thead><tr><th>ФИО</th><th style="width:160px">Роль / Должность</th><th style="width:150px">Телефон</th><th style="width:180px">Email</th><th style="width:180px">Примечание</th><th style="width:120px">Действия</th></tr></thead>';
      html += '<tbody>';
      people.forEach(function (p) {
        html += '<tr>';
        html += '<td>' + esc(p.fullName) + '</td>';
        html += '<td>' + esc(p.role || '-') + '</td>';
        html += '<td>' + esc(p.phone || '-') + '</td>';
        html += '<td>' + esc(p.email || '-') + '</td>';
        html += '<td>' + esc(p.note || '-') + '</td>';
        html += '<td class="roster-row-actions">';
        html += '<button class="btn-icon-sm" data-edit-person="' + p.id + '" data-store="' + storeName + '" title="Редактировать">&#9998;</button>';
        html += '<button class="btn-icon-sm btn-icon-danger" data-del-person="' + p.id + '" data-store="' + storeName + '" title="Удалить">&times;</button>';
        html += '</td></tr>';
      });
      html += '</tbody></table></div>';
    } else {
      html += '<div class="roster-empty">' + esc(emptyText) + '</div>';
    }

    html += '</div>';
    return html;
  }

  /* ---- Homeschool list ----
   * Uses the shared aggregated column system, sorted alphabetically,
   * with the same inline-edit behavior as the rest of the registry. */
  async function renderHomeschoolList() {
    var students = await school.getHomeschoolers();
    var allClasses = _cache.classes;
    var classMap = {};
    allClasses.forEach(function (c) { classMap[c.id] = c; });

    var q = (searchQuery || '').toUpperCase();
    students = students.filter(function (s) { return matchesSearch(s, q); });
    students.sort(function (a, b) { return (a.fullName || '').localeCompare(b.fullName || '', 'ru'); });
    students.forEach(function (s, idx) { s._aggIndex = idx + 1; });

    var columns = getActiveColumns('aggregated');
    var hiddenCols = getHiddenDataColumns();
    var ctx = { hiddenCols: hiddenCols };

    var html = '<div class="roster-detail">';
    html += '<div class="roster-detail-head">';
    html += '<div class="roster-detail-title">';
    html += '<h3>Домашники</h3>';
    html += '<span class="roster-detail-count">' + students.length + ' учен.</span>';
    html += '</div></div>';

    if (!students.length) {
      html += '<div class="roster-empty">Нет учеников на домашнем обучении. Данные загружаются из файла АСУ РСО.</div>';
    } else {
      html += '<div class="roster-table-wrap"><table class="roster-table">';
      html += renderTableHead(columns);
      html += '<tbody>';
      students.forEach(function (s) {
        var tr = '<tr data-sid="' + esc(s.id) + '">';
        columns.forEach(function (col) {
          var cls = 'roster-cell-' + col.key;
          var attrs = '';
          if (col.editable && col.key !== 'fullName' && col.key !== 'actions') {
            cls += ' roster-editable-cell';
            if (col.key === 'uin') {
              attrs = ' data-edit-uin="' + esc(s.id) + '" title="Нажмите, чтобы изменить УИН"';
            } else {
              attrs = ' data-edit-field="' + esc(col.key) + '" data-field-student="' + esc(s.id) + '" title="Нажмите, чтобы изменить"';
            }
          }
          if (col.key === 'actions') cls += ' roster-row-actions';
          var val = (col.key === 'order') ? s._aggIndex : renderCellValue(col, s, classMap, ctx);
          tr += '<td class="' + cls + '"' + attrs + '>' + val + '</td>';
        });
        tr += '</tr>';
        tr += renderInfoRow(s, columns, hiddenCols);
        html += tr;
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';
    return html;
  }

  /* ====== Event binding ======
   *
   * FRAME events are attached ONCE per full render and never touch the
   * search input element itself — they only read its current `.value` on
   * user input and then call renderContent() to swap the content slot.
   * This is the fix for the "focus is lost after each character" bug:
   * previously the whole container was wiped on every keystroke, killing
   * the active input element along with its caret position.
   *
   * CONTENT events are attached after renderContent() every time the
   * content slot is rewritten, since those buttons/cells are recreated.
   */
  var _searchDebounceTimer = null;

  function bindFrameEvents(classes) {
    /* ---- Search input (focus-safe: no full re-render on keystroke) ---- */
    var searchInput = $('rosterSearchInput');
    if (searchInput) {
      /* Focus the input on mount so the user can start typing immediately
         after clicking a tab or opening the page. */
      searchInput.addEventListener('input', function () {
        clearTimeout(_searchDebounceTimer);
        var val = searchInput.value;
        _searchDebounceTimer = setTimeout(function () {
          searchQuery = val.trim();
          /* DO NOT call render() — only update the content slot.
             The search input element is in the frame and is never
             recreated, so focus and caret position are preserved. */
          renderContent();
        }, 180);
      });
      /* Clear on Escape */
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          searchInput.value = '';
          searchQuery = '';
          renderContent();
        }
      });
    }

    /* ---- Status filter ---- */
    var filterSelect = $('rosterFilterSelect');
    if (filterSelect) {
      filterSelect.addEventListener('change', function () {
        searchFilter = filterSelect.value;
        renderContent();
      });
    }

    /* ---- Advanced multi-class filter panel ---- */
    var filterToggle = $('rosterFilterToggle');
    if (filterToggle) {
      filterToggle.addEventListener('click', function () {
        showClassPicker = !showClassPicker;
        showColumnPicker = false;
        render();
      });
    }
    document.querySelectorAll('[data-multi-class]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var id = cb.dataset.multiClass;
        if (!multiSelectedClassIds) multiSelectedClassIds = new Set();
        if (cb.checked) multiSelectedClassIds.add(id);
        else multiSelectedClassIds.delete(id);
        if (multiSelectedClassIds.size === 0) multiSelectedClassIds = null;
        /* Multi-select takes over the view */
        selectedClassId = null;
        activeFixedTab = null;
        renderContent();
        /* Also refresh tab highlight + toggle label */
        updateFrameHighlights();
      });
    });
    var filterSelectAll = $('rosterFilterSelectAll');
    if (filterSelectAll) {
      filterSelectAll.addEventListener('click', function () {
        multiSelectedClassIds = new Set(classes.map(function (c) { return c.id; }));
        selectedClassId = null;
        activeFixedTab = null;
        render();
      });
    }
    var filterClear = $('rosterFilterClear');
    if (filterClear) {
      filterClear.addEventListener('click', function () {
        multiSelectedClassIds = null;
        render();
      });
    }
    var filterApply = $('rosterFilterApply');
    if (filterApply) {
      filterApply.addEventListener('click', function () {
        showClassPicker = false;
        render();
      });
    }

    /* ---- Column settings panel ---- */
    var columnsToggle = $('rosterColumnsToggle');
    if (columnsToggle) {
      columnsToggle.addEventListener('click', function () {
        showColumnPicker = !showColumnPicker;
        showClassPicker = false;
        render();
      });
    }
    document.querySelectorAll('[data-col-key]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var key = cb.dataset.colKey;
        if (cb.checked) {
          if (visibleColumnKeys.indexOf(key) < 0) visibleColumnKeys.push(key);
        } else {
          visibleColumnKeys = visibleColumnKeys.filter(function (k) { return k !== key; });
        }
        saveColumnSettings(visibleColumnKeys);
        renderContent();
      });
    });
    var columnsReset = $('rosterColumnsReset');
    if (columnsReset) {
      columnsReset.addEventListener('click', function () {
        visibleColumnKeys = DEFAULT_VISIBLE_COLUMNS.slice();
        saveColumnSettings(visibleColumnKeys);
        render();
      });
    }

    /* ---- Class tabs ---- */
    document.querySelectorAll('.roster-class-tab[data-cid]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedClassId = btn.dataset.cid;
        activeFixedTab = null;
        multiSelectedClassIds = null;
        renderContent();
        updateFrameHighlights();
      });
    });

    /* ---- Fixed tabs ---- */
    document.querySelectorAll('.roster-class-tab[data-fixed]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeFixedTab = btn.dataset.fixed;
        selectedClassId = null;
        multiSelectedClassIds = null;
        renderContent();
        updateFrameHighlights();
      });
    });

    /* ---- Action bar buttons ---- */
    var addClassBtn = $('rosterAddClass');
    if (addClassBtn) addClassBtn.addEventListener('click', handleAddClass);
    var importSchool = $('rosterImportSchool');
    if (importSchool) importSchool.addEventListener('change', handleImportSchool);
    var importAsu = $('rosterImportAsu');
    if (importAsu) importAsu.addEventListener('change', handleImportAsu);
    var exportAll = $('rosterExportAll');
    if (exportAll) exportAll.addEventListener('click', handleExportAll);
  }

  /* Update the visual active state on class/fixed tabs without rebuilding
     the frame (keeps the search input focus intact). */
  function updateFrameHighlights() {
    document.querySelectorAll('.roster-class-tab').forEach(function (btn) {
      btn.classList.remove('is-active');
    });
    if (multiSelectedClassIds) return; /* multi-class view has no single active tab */
    if (activeFixedTab) {
      var tab = document.querySelector('.roster-class-tab[data-fixed="' + activeFixedTab + '"]');
      if (tab) tab.classList.add('is-active');
    } else if (selectedClassId) {
      var ct = document.querySelector('.roster-class-tab[data-cid="' + selectedClassId + '"]');
      if (ct) ct.classList.add('is-active');
    }
  }

  function bindContentEvents(classes) {
    /* Rename class */
    document.querySelectorAll('[data-rename]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleRenameClass(btn.dataset.rename); });
    });
    /* Delete class */
    document.querySelectorAll('[data-delete-class]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleDeleteClass(btn.dataset.deleteClass); });
    });
    /* Export single class */
    document.querySelectorAll('[data-export-class]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleExportClass(btn.dataset.exportClass); });
    });
    /* Add student */
    document.querySelectorAll('[data-add-student]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleAddStudent(btn.dataset.addStudent); });
    });
    /* Edit student */
    document.querySelectorAll('[data-edit-student]').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); handleEditStudent(btn.dataset.editStudent); });
    });
    /* Quick-edit UIN */
    document.querySelectorAll('[data-edit-uin]').forEach(function (cell) {
      cell.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        e.stopPropagation();
        handleEditUin(cell.dataset.editUin);
      });
    });
    /* Quick-edit any info field (confirmation inside handleEditField) */
    document.querySelectorAll('[data-edit-field]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        e.stopPropagation();
        handleEditField(el.dataset.fieldStudent, el.dataset.editField);
      });
    });
    /* Toggle extra-info row ("i" badge next to ФИО). Shows fields that are
       NOT currently visible as columns, so they disappear automatically as
       the user adds columns via the column picker. */
    document.querySelectorAll('[data-toggle-info]').forEach(function (badge) {
      badge.addEventListener('click', function (e) {
        e.stopPropagation();
        var sid = badge.dataset.toggleInfo;
        var row = document.getElementById('info-' + sid);
        if (!row) return;
        var open = row.style.display !== 'none';
        row.style.display = open ? 'none' : '';
        badge.classList.toggle('is-open', !open);
      });
    });
    /* Move student */
    document.querySelectorAll('[data-move-student]').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); handleMoveStudent(btn.dataset.moveStudent, classes); });
    });
    /* Archive student */
    document.querySelectorAll('[data-archive-student]').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); handleArchiveStudent(btn.dataset.archiveStudent); });
    });
    /* Delete student */
    document.querySelectorAll('[data-del-student]').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); handleDeleteStudent(btn.dataset.delStudent); });
    });
    /* Restore from archive */
    document.querySelectorAll('[data-restore]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleRestoreStudent(btn.dataset.restore); });
    });
    /* Delete from archive permanently */
    document.querySelectorAll('[data-del-archived]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleDeleteArchived(btn.dataset.delArchived); });
    });
    /* Add/edit/delete person (staff/parents/extra) */
    document.querySelectorAll('[data-add-person]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleAddPerson(btn.dataset.addPerson); });
    });
    document.querySelectorAll('[data-edit-person]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleEditPerson(btn.dataset.editPerson, btn.dataset.store); });
    });
    document.querySelectorAll('[data-del-person]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleDeletePerson(btn.dataset.delPerson, btn.dataset.store); });
    });
    /* Mass move / archive */
    var massMove = $('rosterMassMove');
    if (massMove) massMove.addEventListener('click', handleMassMove);
    var massArchive = $('rosterMassArchive');
    if (massArchive) massArchive.addEventListener('click', handleMassArchive);

    /* Select all checkbox + row toggle.
       Only data rows (with data-sid) participate in selection, so the
       expandable .roster-info-row is excluded automatically. */
    var selectAll = $('rosterSelectAll');
    if (selectAll) {
      selectAll.addEventListener('change', function () {
        document.querySelectorAll('.roster-table tbody tr[data-sid]').forEach(function (row) {
          row.classList.toggle('is-selected', selectAll.checked);
        });
      });
      document.querySelectorAll('.roster-table tbody tr[data-sid]').forEach(function (row) {
        row.addEventListener('click', function (e) {
          if (e.target.closest('button') || e.target.closest('select') || e.target.closest('input') || e.target.closest('.roster-editable-cell') || e.target.closest('.roster-info-badge')) return;
          row.classList.toggle('is-selected');
        });
      });
    }
  }

  /* ---- Handlers: Classes ---- */

  async function handleAddClass() {
    var name = prompt('Название нового класса:');
    if (!name || !name.trim()) return;
    await school.createClass(name.trim());
    render();
  }

  async function handleRenameClass(id) {
    var cls = await school.getClass(id);
    if (!cls) return;
    var name = prompt('Новое название класса:', cls.name);
    if (!name || !name.trim() || name.trim() === cls.name) return;
    await school.renameClass(id, name.trim());
    render();
  }

  async function handleDeleteClass(id) {
    var ok = await askConfirm({
      title: 'Удалить класс?',
      bodyHtml: '<p>Это действие нельзя отменить.</p>',
      confirmText: 'Удалить',
      confirmVariant: 'danger'
    });
    if (!ok) return;
    try {
      await school.deleteClass(id);
      if (selectedClassId === id) selectedClassId = null;
      render();
    } catch (e) {
      alert(e.message);
    }
  }

  /* ---- Handlers: Import / Export ---- */

  async function handleImportSchool(event) {
    var file = event.target.files[0];
    if (!file) return;
    try {
      var buffer = await file.arrayBuffer();
      var data = importer.parseSchoolFile(buffer);
      if (!data.length) { alert('Не удалось распознать классы в файле.'); return; }
      var totalStudents = data.reduce(function (s, c) { return s + c.students.length; }, 0);
      var okImport = await askConfirm({
        title: 'Заменить весь список школы?',
        bodyHtml:
          '<p>Найдено <b>' + data.length + '</b> классов, <b>' + totalStudents + '</b> учеников.</p>' +
          '<p><b>ВНИМАНИЕ:</b> текущий список школы будет полностью заменён данными из файла.</p>' +
          '<p>Продолжить?</p>',
        confirmText: 'Заменить',
        confirmVariant: 'danger'
      });
      if (!okImport) return;
      await school.importFullReplace(data);
      selectedClassId = null;
      render();
      showImportReport('Импорт школы завершён', data);
    } catch (e) {
      alert('Ошибка импорта: ' + (e.message || e));
    }
    event.target.value = '';
  }

  async function handleImportAsu(event) {
    var file = event.target.files[0];
    if (!file) return;
    try {
      var buffer = await file.arrayBuffer();
      var incoming = importer.parseAsuStudentList(buffer);
      if (!incoming.length) { alert('Не удалось распознать учеников в файле.'); return; }
      var regularCount = incoming.filter(function (s) { var f = (s.formOfEducation || '').toLowerCase(); return !f || f === 'очная'; }).length;
      var homeCount = incoming.length - regularCount;
      var countMsg = 'Найдено ' + incoming.length + ' учеников (очная: ' + regularCount + ', домашники: ' + homeCount + ').';
      var okSync = await askConfirm({
        title: 'Синхронизировать с АСУ РСО?',
        bodyHtml:
          '<p>' + esc(countMsg) + '</p>' +
          '<p>Будет выполнена синхронизация:</p>' +
          '<ul>' +
            '<li>Новые ученики — добавятся</li>' +
            '<li>Существующие — обновятся</li>' +
            '<li>Переведённые — переместятся в новый класс</li>' +
            '<li>Отсутствующие — уйдут в архив</li>' +
          '</ul>',
        confirmText: 'Синхронизировать'
      });
      if (!okSync) return;
      var report = await school.syncFromAsu(incoming);
      selectedClassId = null;
      render();
      showReport('Синхронизация с АСУ РСО завершена', report);
    } catch (e) {
      alert('Ошибка синхронизации: ' + (e.message || e));
    }
    event.target.value = '';
  }

  async function handleExportAll() {
    try {
      var classes = await school.getAllClasses();
      if (!classes.length) { alert('Нет классов для экспорта.'); return; }
      var data = [];
      for (var i = 0; i < classes.length; i++) {
        var students = await school.getStudentsByClass(classes[i].id);
        data.push({ name: classes[i].name, students: students });
      }
      var blob = await exporter.exportAllClasses(data);
      exporter.download(blob, 'Школа_ГТО.xlsx');
    } catch (e) {
      alert('Ошибка экспорта: ' + (e.message || e));
    }
  }

  async function handleExportClass(classId) {
    try {
      var cls = await school.getClass(classId);
      if (!cls) return;
      var students = await school.getStudentsByClass(classId);
      var blob = await exporter.exportSingleClass(cls.name, students);
      exporter.download(blob, cls.name + '_ГТО.xlsx');
    } catch (e) {
      alert('Ошибка экспорта: ' + (e.message || e));
    }
  }

  /* ---- Handlers: Students ---- */

  async function handleAddStudent(classId) {
    var fullName = prompt('ФИО ученика:');
    if (!fullName || !fullName.trim()) return;
    var uin = prompt('УИН (можно оставить пустым):', '');
    await school.addStudent({ classId: classId, fullName: fullName.trim(), uin: (uin || '').trim() });
    await school.renumberClass(classId);
    render();
  }

  async function handleEditUin(studentId) {
    var students = await school.getAllStudents();
    var s = students.find(function (st) { return st.id === studentId; });
    if (!s) return;
    var uin = prompt('УИН для ' + s.fullName + ':', s.uin || '');
    if (uin === null || uin.trim() === (s.uin || '')) return;
    var okUin = await askConfirm({
      title: 'Изменить УИН?',
      bodyHtml:
        '<p>Ученик: <b>' + esc(s.fullName) + '</b></p>' +
        '<p>Было: <b>' + esc(s.uin || '(пусто)') + '</b></p>' +
        '<p>Станет: <b>' + esc(uin.trim() || '(пусто)') + '</b></p>',
      confirmText: 'Изменить'
    });
    if (!okUin) return;
    await school.updateStudent(studentId, { uin: uin.trim() });
    render();
  }

  /* Field labels and special handling for inline edit */
  var FIELD_LABELS = {
    gender: 'Пол',
    birthDate: 'Дата рождения (ДД.ММ.ГГГГ)',
    documentType: 'Тип документа',
    documentSeries: 'Серия документа',
    documentNumber: 'Номер документа',
    snils: 'СНИЛС',
    residenceLocality: 'Населённый пункт',
    residenceStreetType: 'Тип улицы',
    residenceStreetName: 'Название улицы',
    residenceHouse: 'Дом',
    residenceBuilding: 'Корпус',
    residenceApartment: 'Квартира',
    formOfEducation: 'Форма обучения'
  };

  function getFieldDisplayValue(student, field) {
    if (field === 'birthDate') return formatBirthDate(student.birthDate) || '';
    return student[field] || '';
  }

  function parseFieldInput(field, value) {
    if (field === 'birthDate' && value) {
      /* DATE-ONLY safe — accepts DD.MM.YYYY, YYYY-MM-DD, Excel serials etc. */
      return parseBirthDateInput(value);
    }
    return value;
  }

  async function handleEditField(studentId, field) {
    var students = await school.getAllStudents();
    var s = students.find(function (st) { return st.id === studentId; });
    if (!s) return;
    var label = FIELD_LABELS[field] || field;
    var currentVal = getFieldDisplayValue(s, field);
    var newVal = prompt(label + ' для ' + s.fullName + ':', currentVal);
    if (newVal === null) return;
    newVal = newVal.trim();
    var storedVal = parseFieldInput(field, newVal);
    var oldStored = s[field] || '';
    if (storedVal === oldStored) return;
    var okField = await askConfirm({
      title: 'Изменить «' + label + '»?',
      bodyHtml:
        '<p>Ученик: <b>' + esc(s.fullName) + '</b></p>' +
        '<p>Было: <b>' + esc(currentVal || '(пусто)') + '</b></p>' +
        '<p>Станет: <b>' + esc(newVal || '(пусто)') + '</b></p>',
      confirmText: 'Изменить'
    });
    if (!okField) return;
    var patch = {};
    patch[field] = storedVal;
    await school.updateStudent(studentId, patch);
    render();
  }

  async function handleEditStudent(studentId) {
    var students = await school.getAllStudents();
    var s = students.find(function (st) { return st.id === studentId; });
    if (!s) return;
    var fullName = prompt('ФИО:', s.fullName);
    if (fullName === null) return;
    var uin = prompt('УИН:', s.uin || '');
    if (uin === null) return;
    await school.updateStudent(studentId, { fullName: fullName.trim(), uin: uin.trim() });
    render();
  }

  async function handleMoveStudent(studentId, classes) {
    var options = classes.filter(function (c) { return c.id !== selectedClassId; });
    if (!options.length) { alert('Нет других классов для переноса.'); return; }
    var msg = 'Выберите номер класса:\n';
    options.forEach(function (c, i) { msg += (i + 1) + '. ' + c.name + '\n'; });
    var choice = prompt(msg);
    if (!choice) return;
    var idx = parseInt(choice, 10) - 1;
    if (idx < 0 || idx >= options.length) { alert('Неверный выбор.'); return; }
    await school.moveStudents([studentId], options[idx].id);
    await school.renumberClass(options[idx].id);
    await school.renumberClass(selectedClassId);
    render();
  }

  async function handleArchiveStudent(studentId) {
    var reason = prompt('Причина архивации (необязательно):');
    if (reason === null) return;
    await school.archiveStudent(studentId, reason || 'Вручную');
    if (selectedClassId) await school.renumberClass(selectedClassId);
    render();
  }

  async function handleDeleteStudent(studentId) {
    var ok = await askConfirm({
      title: 'Удалить ученика?',
      bodyHtml: '<p>Удалить этого ученика навсегда?</p><p>Если хотите сохранить данные, лучше переместите в архив.</p>',
      confirmText: 'Удалить',
      confirmVariant: 'danger'
    });
    if (!ok) return;
    await school.deleteStudent(studentId);
    if (selectedClassId) await school.renumberClass(selectedClassId);
    render();
  }

  async function handleMassMove() {
    var target = $('rosterMoveTarget');
    if (!target || !target.value) { alert('Выберите целевой класс.'); return; }
    var ids = getSelectedIds();
    if (!ids.length) { alert('Выберите учеников (кликните по строкам).'); return; }
    var okMove = await askConfirm({
      title: 'Переместить учеников?',
      bodyHtml: '<p>Переместить <b>' + ids.length + '</b> учеников?</p>',
      confirmText: 'Переместить'
    });
    if (!okMove) return;
    await school.moveStudents(ids, target.value);
    await school.renumberClass(target.value);
    if (selectedClassId) await school.renumberClass(selectedClassId);
    render();
  }

  async function handleMassArchive() {
    var ids = getSelectedIds();
    if (!ids.length) { alert('Выберите учеников (кликните по строкам).'); return; }
    var okArchive = await askConfirm({
      title: 'Переместить в архив?',
      bodyHtml: '<p>Переместить <b>' + ids.length + '</b> учеников в архив?</p>',
      confirmText: 'В архив'
    });
    if (!okArchive) return;
    await school.archiveStudents(ids, 'Массовая архивация');
    if (selectedClassId) await school.renumberClass(selectedClassId);
    render();
  }

  function getSelectedIds() {
    var ids = [];
    document.querySelectorAll('.roster-table tbody tr.is-selected').forEach(function (row) {
      if (row.dataset.sid) ids.push(row.dataset.sid);
    });
    return ids;
  }

  /* ---- Handlers: Archive ---- */

  async function handleRestoreStudent(archivedId) {
    try {
      var s = await school.restoreStudent(archivedId);
      await school.renumberClass(s.classId);
      render();
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleDeleteArchived(id) {
    var ok = await askConfirm({
      title: 'Удалить из архива?',
      bodyHtml: '<p>Удалить запись из архива навсегда?</p>',
      confirmText: 'Удалить',
      confirmVariant: 'danger'
    });
    if (!ok) return;
    await school.deleteArchivedStudent(id);
    render();
  }

  /* ---- Handlers: Person lists (staff/parents/extra) ---- */

  async function handleAddPerson(storeName) {
    var fullName = prompt('ФИО:');
    if (!fullName || !fullName.trim()) return;
    var role = prompt('Роль / Должность (необязательно):', '');
    var phone = prompt('Телефон (необязательно):', '');
    var email = prompt('Email (необязательно):', '');
    var note = prompt('Примечание (необязательно):', '');
    await school[storeName].add({
      fullName: fullName.trim(),
      role: (role || '').trim(),
      phone: (phone || '').trim(),
      email: (email || '').trim(),
      note: (note || '').trim()
    });
    render();
  }

  async function handleEditPerson(personId, storeName) {
    var api = school[storeName];
    var people = await api.getAll();
    var p = people.find(function (x) { return x.id === personId; });
    if (!p) return;
    var fullName = prompt('ФИО:', p.fullName);
    if (fullName === null) return;
    var role = prompt('Роль / Должность:', p.role || '');
    if (role === null) return;
    var phone = prompt('Телефон:', p.phone || '');
    if (phone === null) return;
    var email = prompt('Email:', p.email || '');
    if (email === null) return;
    var note = prompt('Примечание:', p.note || '');
    if (note === null) return;
    await api.update(personId, {
      fullName: fullName.trim(),
      role: role.trim(),
      phone: phone.trim(),
      email: email.trim(),
      note: note.trim()
    });
    render();
  }

  async function handleDeletePerson(personId, storeName) {
    var ok = await askConfirm({
      title: 'Удалить запись?',
      bodyHtml: '<p>Удалить эту запись?</p>',
      confirmText: 'Удалить',
      confirmVariant: 'danger'
    });
    if (!ok) return;
    await school[storeName].delete(personId);
    render();
  }

  /* ---- Public ---- */
  window.GTOSchoolRoster = { render: render };
})();
