/**
 * school-roster.js — Dashboard UI for managing school classes and students.
 * Renders into #schoolRoster container on the dashboard.
 */
(function () {
  'use strict';

  var school = window.GTOSchool;
  var importer = window.GTOSchoolImport;
  var exporter = window.GTOSchoolExport;
  var selectedClassId = null;

  /* ---- Helpers ---- */
  function esc(v) {
    return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function $(id) { return document.getElementById(id); }

  /* ---- Main render ---- */
  async function render() {
    var container = $('schoolRoster');
    if (!container) return;

    var classes = await school.getAllClasses();
    var stats = await school.getStats();

    /* If selectedClassId no longer exists, reset */
    if (selectedClassId && !classes.find(function (c) { return c.id === selectedClassId; })) {
      selectedClassId = null;
    }

    var html = '';

    /* Stats bar */
    html += '<div class="roster-stats">';
    html += '<div class="roster-stat"><span class="roster-stat-val">' + stats.classCount + '</span><span class="roster-stat-lbl">Классов</span></div>';
    html += '<div class="roster-stat"><span class="roster-stat-val">' + stats.studentCount + '</span><span class="roster-stat-lbl">Учеников</span></div>';
    html += '<div class="roster-stat"><span class="roster-stat-val">' + stats.withUin + '</span><span class="roster-stat-lbl">С УИН</span></div>';
    html += '</div>';

    /* Action bar */
    html += '<div class="roster-actions">';
    html += '<button class="btn btn-primary btn-sm" id="rosterAddClass" type="button">+ Новый класс</button>';
    html += '<label class="btn btn-secondary btn-sm file-label">Импорт школы (Excel)<input type="file" id="rosterImportSchool" accept=".xlsx,.xls" style="display:none"></label>';
    html += '<label class="btn btn-secondary btn-sm file-label">Синхр. из АСУ РСО<input type="file" id="rosterImportAsu" accept=".xlsx,.xls" style="display:none"></label>';
    html += '<button class="btn btn-ghost btn-sm" id="rosterExportAll" type="button">Экспорт всех классов</button>';
    html += '</div>';

    /* Class tabs */
    if (classes.length > 0) {
      html += '<div class="roster-class-tabs">';
      classes.forEach(function (cls) {
        var active = cls.id === selectedClassId ? ' is-active' : '';
        html += '<button class="roster-class-tab' + active + '" data-cid="' + cls.id + '" type="button">' + esc(cls.name) + '</button>';
      });
      html += '</div>';
    }

    /* Selected class detail */
    if (selectedClassId) {
      html += await renderClassDetail(selectedClassId, classes);
    } else if (classes.length > 0) {
      html += '<div class="roster-empty">Выберите класс для просмотра списка учеников.</div>';
    } else {
      html += '<div class="roster-empty">Список классов пуст. Импортируйте файл школы или создайте класс вручную.</div>';
    }

    container.innerHTML = html;
    bindEvents(classes);
  }

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
      html += '<thead><tr><th style="width:60px">№</th><th>ФИО</th><th style="width:200px">УИН</th><th style="width:180px">Действия</th></tr></thead>';
      html += '<tbody>';
      students.forEach(function (s) {
        html += '<tr data-sid="' + s.id + '">';
        html += '<td>' + (s.classNumber || '-') + '</td>';
        html += '<td>' + esc(s.fullName) + '</td>';
        html += '<td>' + esc(s.uin || '-') + '</td>';
        html += '<td class="roster-row-actions">';
        html += '<button class="btn-icon-sm" data-edit-student="' + s.id + '" title="Редактировать">&#9998;</button>';
        html += '<button class="btn-icon-sm" data-move-student="' + s.id + '" title="Перенести">&#8644;</button>';
        html += '<button class="btn-icon-sm btn-icon-danger" data-del-student="' + s.id + '" title="Удалить">&times;</button>';
        html += '</td></tr>';
      });
      html += '</tbody></table></div>';

      /* Mass move */
      if (allClasses.length > 1) {
        html += '<div class="roster-mass-move">';
        html += '<label><input type="checkbox" id="rosterSelectAll"> Выбрать всех</label>';
        html += '<select id="rosterMoveTarget"><option value="">Переместить в...</option>';
        allClasses.forEach(function (c) {
          if (c.id !== classId) html += '<option value="' + c.id + '">' + esc(c.name) + '</option>';
        });
        html += '</select>';
        html += '<button class="btn btn-sm btn-ghost" id="rosterMassMove" type="button">Переместить выбранных</button>';
        html += '</div>';
      }
    } else {
      html += '<div class="roster-empty">В классе пока нет учеников.</div>';
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

    /* Move student */
    document.querySelectorAll('[data-move-student]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleMoveStudent(btn.dataset.moveStudent, classes); });
    });

    /* Delete student */
    document.querySelectorAll('[data-del-student]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleDeleteStudent(btn.dataset.delStudent); });
    });

    /* Mass move */
    var massMove = $('rosterMassMove');
    if (massMove) massMove.addEventListener('click', handleMassMove);

    /* Select all checkbox */
    var selectAll = $('rosterSelectAll');
    if (selectAll) {
      selectAll.addEventListener('change', function () {
        document.querySelectorAll('.roster-table tbody tr').forEach(function (row) {
          row.classList.toggle('is-selected', selectAll.checked);
        });
      });
      /* Toggle individual rows */
      document.querySelectorAll('.roster-table tbody tr').forEach(function (row) {
        row.addEventListener('click', function (e) {
          if (e.target.closest('button')) return;
          row.classList.toggle('is-selected');
        });
      });
    }
  }

  /* ---- Handlers ---- */

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
      alert('Импорт завершён: ' + data.length + ' классов, ' + totalStudents + ' учеников.');
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
      if (!incoming.length) { alert('Не удалось распознать учеников в файле (форма обучения "очная").'); return; }
      if (!confirm('Найдено ' + incoming.length + ' учеников (очная форма).\n\nБудет выполнена синхронизация: новые ученики добавятся, существующие обновятся.\n\nПродолжить?')) return;
      var report = await school.syncFromAsu(incoming);
      selectedClassId = null;
      render();

      var msg = 'Синхронизация завершена:\n';
      msg += '• Добавлено: ' + report.added.length + '\n';
      msg += '• Обновлено: ' + report.updated.length + '\n';
      msg += '• Перемещено: ' + report.moved.length + '\n';
      msg += '• Без изменений: ' + report.skipped.length + '\n';
      if (report.conflicts.length > 0) {
        msg += '• Конфликтов: ' + report.conflicts.length + '\n';
        report.conflicts.forEach(function (c) { msg += '  - ' + c.incoming.fullName + ': ' + c.reason + '\n'; });
      }
      alert(msg);
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

  async function handleAddStudent(classId) {
    var fullName = prompt('ФИО ученика:');
    if (!fullName || !fullName.trim()) return;
    var uin = prompt('УИН (можно оставить пустым):', '');
    await school.addStudent({ classId: classId, fullName: fullName.trim(), uin: (uin || '').trim() });
    await school.renumberClass(classId);
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

  async function handleDeleteStudent(studentId) {
    if (!confirm('Удалить этого ученика?')) return;
    await school.deleteStudent(studentId);
    if (selectedClassId) await school.renumberClass(selectedClassId);
    render();
  }

  async function handleMassMove() {
    var target = $('rosterMoveTarget');
    if (!target || !target.value) { alert('Выберите целевой класс.'); return; }
    var ids = [];
    document.querySelectorAll('.roster-table tbody tr.is-selected').forEach(function (row) {
      ids.push(row.dataset.sid);
    });
    if (!ids.length) { alert('Выберите учеников (кликните по строкам).'); return; }
    if (!confirm('Переместить ' + ids.length + ' учеников?')) return;
    await school.moveStudents(ids, target.value);
    await school.renumberClass(target.value);
    if (selectedClassId) await school.renumberClass(selectedClassId);
    render();
  }

  /* ---- Public ---- */
  window.GTOSchoolRoster = { render: render };
})();
