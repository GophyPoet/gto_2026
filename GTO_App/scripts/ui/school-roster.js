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

  /* Current state */
  var selectedClassId = null;
  var activeFixedTab = null; // 'archive' | 'staff' | 'parents' | 'extra' | null

  var FIXED_TABS = [
    { id: 'archive', label: 'Архив' },
    { id: 'staff', label: 'Работники школы' },
    { id: 'parents', label: 'Родители' },
    { id: 'extra', label: 'Дополнительно' }
  ];

  /* ---- Helpers ---- */
  function esc(v) {
    return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(id) { return document.getElementById(id); }

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
  function infoField(label, value) {
    var v = value || '-';
    return '<div class="roster-info-field"><span class="roster-info-label">' + esc(label) + '</span><span class="roster-info-value">' + esc(v) + '</span></div>';
  }
  function formatBirthDate(iso) {
    if (!iso) return '';
    var parts = iso.split('-');
    if (parts.length === 3) return parts[2] + '.' + parts[1] + '.' + parts[0];
    return iso;
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

  /* ---- Main render ---- */
  async function render() {
    var container = $('schoolRoster');
    if (!container) return;

    var classes = await school.getAllClasses();
    var stats = await school.getStats();

    /* Reset invalid selections */
    if (selectedClassId && !classes.find(function (c) { return c.id === selectedClassId; })) {
      selectedClassId = null;
    }

    var html = '';

    /* Stats bar */
    html += '<div class="roster-stats">';
    html += '<div class="roster-stat"><span class="roster-stat-val">' + stats.classCount + '</span><span class="roster-stat-lbl">Классов</span></div>';
    html += '<div class="roster-stat"><span class="roster-stat-val">' + stats.studentCount + '</span><span class="roster-stat-lbl">Учеников</span></div>';
    html += '<div class="roster-stat"><span class="roster-stat-val">' + stats.withUin + '</span><span class="roster-stat-lbl">С УИН</span></div>';
    html += '<div class="roster-stat"><span class="roster-stat-val">' + (stats.homeschoolerCount || 0) + '</span><span class="roster-stat-lbl">Домашники</span></div>';
    html += '<div class="roster-stat"><span class="roster-stat-val">' + stats.archivedCount + '</span><span class="roster-stat-lbl">В архиве</span></div>';
    html += '</div>';

    /* Action bar */
    html += '<div class="roster-actions">';
    html += '<button class="btn btn-primary btn-sm" id="rosterAddClass" type="button">+ Новый класс</button>';
    html += '<label class="btn btn-secondary btn-sm file-label">Импорт школы (Excel)<input type="file" id="rosterImportSchool" accept=".xlsx,.xls" style="display:none"></label>';
    html += '<label class="btn btn-secondary btn-sm file-label">Синхр. из АСУ РСО<input type="file" id="rosterImportAsu" accept=".xlsx,.xls" style="display:none"></label>';
    html += '<button class="btn btn-ghost btn-sm" id="rosterExportAll" type="button">Экспорт всех классов</button>';
    html += '</div>';

    /* Class tabs + fixed tabs */
    html += '<div class="roster-class-tabs">';

    /* Dynamic class tabs */
    classes.forEach(function (cls) {
      var active = (!activeFixedTab && cls.id === selectedClassId) ? ' is-active' : '';
      html += '<button class="roster-class-tab' + active + '" data-cid="' + cls.id + '" type="button">' + esc(cls.name) + '</button>';
    });

    /* Separator */
    if (classes.length > 0) {
      html += '<span class="roster-tab-sep"></span>';
    }

    /* Fixed tabs */
    FIXED_TABS.forEach(function (tab) {
      var active = activeFixedTab === tab.id ? ' is-active is-fixed' : ' is-fixed';
      html += '<button class="roster-class-tab' + active + '" data-fixed="' + tab.id + '" type="button">' + tab.label + '</button>';
    });

    html += '</div>';

    /* Content area */
    if (activeFixedTab === 'archive') {
      html += await renderArchive();
    } else if (activeFixedTab === 'staff') {
      html += await renderPersonList('staff', 'Работники школы', 'Добавьте работников школы для формирования заявок.');
    } else if (activeFixedTab === 'parents') {
      html += await renderPersonList('parents', 'Родители', 'Добавьте родителей для формирования заявок.');
    } else if (activeFixedTab === 'extra') {
      html += await renderPersonList('extra', 'Дополнительно', 'Дополнительный список участников.');
    } else if (selectedClassId) {
      html += await renderClassDetail(selectedClassId, classes);
    } else if (classes.length > 0) {
      html += '<div class="roster-empty">Выберите класс для просмотра списка учеников.</div>';
    } else {
      html += '<div class="roster-empty">Список классов пуст. Импортируйте файл школы или создайте класс вручную.</div>';
    }

    container.innerHTML = html;
    bindEvents(classes);
  }

  /* ---- Class detail ---- */
  async function renderClassDetail(classId, allClasses) {
    var cls = allClasses.find(function (c) { return c.id === classId; });
    if (!cls) return '';
    var students = await school.getStudentsByClass(classId);

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

    /* Students table */
    if (students.length > 0) {
      html += '<div class="roster-table-wrap"><table class="roster-table">';
      html += '<thead><tr><th style="width:60px">№</th><th>ФИО</th><th style="width:200px">УИН</th><th style="width:200px">Действия</th></tr></thead>';
      html += '<tbody>';
      students.forEach(function (s) {
        var hasInfo = s.gender || s.birthDate || s.documentNumber || s.residenceLocality;
        html += '<tr data-sid="' + s.id + '">';
        html += '<td>' + (s.classNumber || '-') + '</td>';
        html += '<td>' + esc(s.fullName);
        if (hasInfo) html += ' <span class="roster-info-badge" data-toggle-info="' + s.id + '" title="Показать доп. информацию">i</span>';
        html += '</td>';
        html += '<td class="roster-uin-cell" data-edit-uin="' + s.id + '" title="Нажмите для редактирования УИН">' + esc(s.uin || '-') + '</td>';
        html += '<td class="roster-row-actions">';
        html += '<button class="btn-icon-sm" data-edit-student="' + s.id + '" title="Редактировать">&#9998;</button>';
        html += '<button class="btn-icon-sm" data-move-student="' + s.id + '" title="Перенести">&#8644;</button>';
        html += '<button class="btn-icon-sm" data-archive-student="' + s.id + '" title="В архив">&#128451;</button>';
        html += '<button class="btn-icon-sm btn-icon-danger" data-del-student="' + s.id + '" title="Удалить">&times;</button>';
        html += '</td></tr>';
        /* Expandable detail row (hidden by default) */
        html += '<tr class="roster-info-row" id="info-' + s.id + '" style="display:none">';
        html += '<td colspan="4"><div class="roster-info-grid">';
        html += infoField('Пол', s.gender);
        html += infoField('Дата рождения', formatBirthDate(s.birthDate));
        html += infoField('Тип документа', s.documentType);
        html += infoField('Серия', s.documentSeries);
        html += infoField('Номер документа', s.documentNumber);
        html += infoField('СНИЛС', s.snils);
        html += infoField('Нас. пункт', s.residenceLocality);
        html += infoField('Улица', buildStreet(s));
        html += infoField('Дом', buildHouseAddr(s));
        html += '</div></td></tr>';
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
      html += '<div class="roster-empty">В классе пока нет учеников.</div>';
    }

    html += '</div>';
    return html;
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

  /* ---- Event binding ---- */
  function bindEvents(classes) {
    /* Class tab clicks */
    document.querySelectorAll('.roster-class-tab[data-cid]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedClassId = btn.dataset.cid;
        activeFixedTab = null;
        render();
      });
    });

    /* Fixed tab clicks */
    document.querySelectorAll('.roster-class-tab[data-fixed]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeFixedTab = btn.dataset.fixed;
        selectedClassId = null;
        render();
      });
    });

    /* Add class */
    var addClassBtn = $('rosterAddClass');
    if (addClassBtn) addClassBtn.addEventListener('click', handleAddClass);

    /* Import school file */
    var importSchool = $('rosterImportSchool');
    if (importSchool) importSchool.addEventListener('change', handleImportSchool);

    /* Import ASU */
    var importAsu = $('rosterImportAsu');
    if (importAsu) importAsu.addEventListener('change', handleImportAsu);

    /* Export all */
    var exportAll = $('rosterExportAll');
    if (exportAll) exportAll.addEventListener('click', handleExportAll);

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
      btn.addEventListener('click', function () { handleEditStudent(btn.dataset.editStudent); });
    });

    /* Quick-edit UIN by clicking the cell */
    document.querySelectorAll('[data-edit-uin]').forEach(function (cell) {
      cell.addEventListener('click', function (e) {
        e.stopPropagation();
        handleEditUin(cell.dataset.editUin);
      });
    });

    /* Toggle info row */
    document.querySelectorAll('[data-toggle-info]').forEach(function (badge) {
      badge.addEventListener('click', function (e) {
        e.stopPropagation();
        var infoRow = document.getElementById('info-' + badge.dataset.toggleInfo);
        if (infoRow) {
          var visible = infoRow.style.display !== 'none';
          infoRow.style.display = visible ? 'none' : '';
          badge.classList.toggle('is-open', !visible);
        }
      });
    });

    /* Move student */
    document.querySelectorAll('[data-move-student]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleMoveStudent(btn.dataset.moveStudent, classes); });
    });

    /* Archive student */
    document.querySelectorAll('[data-archive-student]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleArchiveStudent(btn.dataset.archiveStudent); });
    });

    /* Delete student */
    document.querySelectorAll('[data-del-student]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleDeleteStudent(btn.dataset.delStudent); });
    });

    /* Restore from archive */
    document.querySelectorAll('[data-restore]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleRestoreStudent(btn.dataset.restore); });
    });

    /* Delete from archive permanently */
    document.querySelectorAll('[data-del-archived]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleDeleteArchived(btn.dataset.delArchived); });
    });

    /* Add person (staff/parents/extra) */
    document.querySelectorAll('[data-add-person]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleAddPerson(btn.dataset.addPerson); });
    });

    /* Edit person */
    document.querySelectorAll('[data-edit-person]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleEditPerson(btn.dataset.editPerson, btn.dataset.store); });
    });

    /* Delete person */
    document.querySelectorAll('[data-del-person]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleDeletePerson(btn.dataset.delPerson, btn.dataset.store); });
    });

    /* Mass move */
    var massMove = $('rosterMassMove');
    if (massMove) massMove.addEventListener('click', handleMassMove);

    /* Mass archive */
    var massArchive = $('rosterMassArchive');
    if (massArchive) massArchive.addEventListener('click', handleMassArchive);

    /* Select all checkbox + row toggle */
    var selectAll = $('rosterSelectAll');
    if (selectAll) {
      selectAll.addEventListener('change', function () {
        document.querySelectorAll('.roster-table tbody tr').forEach(function (row) {
          row.classList.toggle('is-selected', selectAll.checked);
        });
      });
      document.querySelectorAll('.roster-table tbody tr').forEach(function (row) {
        row.addEventListener('click', function (e) {
          if (e.target.closest('button') || e.target.closest('select') || e.target.closest('input')) return;
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
    if (!confirm('Удалить этот класс? Это действие нельзя отменить.')) return;
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
      if (!confirm('Найдено ' + data.length + ' классов, ' + totalStudents + ' учеников.\n\nВНИМАНИЕ: текущий список школы будет полностью заменён данными из файла.\n\nПродолжить?')) return;
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
      if (!confirm(countMsg + '\n\nБудет выполнена синхронизация:\n• Новые ученики — добавятся\n• Существующие — обновятся\n• Переведённые — переместятся в новый класс\n• Отсутствующие — уйдут в архив\n\nПродолжить?')) return;
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
    if (!confirm('Изменить УИН для ' + s.fullName + '?\n\nБыло: ' + (s.uin || '(пусто)') + '\nСтанет: ' + (uin.trim() || '(пусто)'))) return;
    await school.updateStudent(studentId, { uin: uin.trim() });
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
    if (!confirm('Удалить этого ученика навсегда? Если хотите сохранить данные, лучше переместите в архив.')) return;
    await school.deleteStudent(studentId);
    if (selectedClassId) await school.renumberClass(selectedClassId);
    render();
  }

  async function handleMassMove() {
    var target = $('rosterMoveTarget');
    if (!target || !target.value) { alert('Выберите целевой класс.'); return; }
    var ids = getSelectedIds();
    if (!ids.length) { alert('Выберите учеников (кликните по строкам).'); return; }
    if (!confirm('Переместить ' + ids.length + ' учеников?')) return;
    await school.moveStudents(ids, target.value);
    await school.renumberClass(target.value);
    if (selectedClassId) await school.renumberClass(selectedClassId);
    render();
  }

  async function handleMassArchive() {
    var ids = getSelectedIds();
    if (!ids.length) { alert('Выберите учеников (кликните по строкам).'); return; }
    if (!confirm('Переместить ' + ids.length + ' учеников в архив?')) return;
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
    if (!confirm('Удалить запись из архива навсегда?')) return;
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
    if (!confirm('Удалить эту запись?')) return;
    await school[storeName].delete(personId);
    render();
  }

  /* ---- Public ---- */
  window.GTOSchoolRoster = { render: render };
})();
