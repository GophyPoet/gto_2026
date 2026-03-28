/**
 * school-storage.js — IndexedDB persistence for school roster (classes + students).
 *
 * Stores:
 *   "classes"  — { id, name, sortOrder, createdAt, updatedAt }
 *   "students" — { id, classId, classNumber, fullName, normalizedName, uin, createdAt, updatedAt }
 *
 * Public API: window.GTOSchool
 */
(function () {
  'use strict';

  var DB_NAME = 'gto-school-roster';
  var DB_VERSION = 1;
  var db = null;

  function open() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('classes')) {
          d.createObjectStore('classes', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('students')) {
          var store = d.createObjectStore('students', { keyPath: 'id' });
          store.createIndex('byClass', 'classId', { unique: false });
          store.createIndex('byNormalizedName', 'normalizedName', { unique: false });
        }
      };
      req.onsuccess = function (e) { db = e.target.result; resolve(db); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function tx(stores, mode) { return db.transaction(stores, mode); }
  function reqP(r) {
    return new Promise(function (res, rej) {
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function txDone(t) {
    return new Promise(function (res, rej) {
      t.oncomplete = res;
      t.onerror = function () { rej(t.error); };
    });
  }

  function genId() { return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }

  function normalizeName(s) {
    return String(s || '').replace(/[Ёё]/g, function (c) { return c === 'Ё' ? 'Е' : 'е'; })
      .replace(/\s+/g, ' ').trim().toUpperCase();
  }

  function normalizeClassName(s) {
    return String(s || '').replace(/\s+/g, '').toUpperCase().replace(/Ё/g, 'Е');
  }

  async function init() { if (!db) await open(); }

  /* ======= Classes ======= */

  async function getAllClasses() {
    await init();
    var all = await reqP(tx(['classes'], 'readonly').objectStore('classes').getAll());
    all.sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name, 'ru'); });
    return all;
  }

  async function getClass(id) {
    await init();
    return reqP(tx(['classes'], 'readonly').objectStore('classes').get(id));
  }

  async function createClass(name) {
    await init();
    var all = await getAllClasses();
    var normalized = normalizeClassName(name);
    /* Prevent duplicate names */
    var dup = all.find(function (c) { return normalizeClassName(c.name) === normalized; });
    if (dup) return dup;
    var now = new Date().toISOString();
    var cls = { id: 'cls_' + genId(), name: name.trim(), sortOrder: all.length, createdAt: now, updatedAt: now };
    var t = tx(['classes'], 'readwrite');
    t.objectStore('classes').put(cls);
    await txDone(t);
    return cls;
  }

  async function renameClass(id, newName) {
    await init();
    var t = tx(['classes'], 'readwrite');
    var store = t.objectStore('classes');
    var cls = await reqP(store.get(id));
    if (!cls) throw new Error('Класс не найден');
    cls.name = newName.trim();
    cls.updatedAt = new Date().toISOString();
    store.put(cls);
    await txDone(t);
    return cls;
  }

  async function deleteClass(id) {
    await init();
    /* Check if class has students */
    var students = await getStudentsByClass(id);
    if (students.length > 0) {
      throw new Error('Нельзя удалить класс с учениками (' + students.length + ' чел.). Сначала переместите их.');
    }
    var t = tx(['classes'], 'readwrite');
    t.objectStore('classes').delete(id);
    await txDone(t);
  }

  async function findOrCreateClass(name) {
    var all = await getAllClasses();
    var normalized = normalizeClassName(name);
    var existing = all.find(function (c) { return normalizeClassName(c.name) === normalized; });
    if (existing) return existing;
    return createClass(name);
  }

  /* ======= Students ======= */

  async function getAllStudents() {
    await init();
    return reqP(tx(['students'], 'readonly').objectStore('students').getAll());
  }

  async function getStudentsByClass(classId) {
    await init();
    var store = tx(['students'], 'readonly').objectStore('students');
    var idx = store.index('byClass');
    var all = await reqP(idx.getAll(classId));
    all.sort(function (a, b) {
      var na = a.classNumber || 9999;
      var nb = b.classNumber || 9999;
      if (na !== nb) return na - nb;
      return (a.fullName || '').localeCompare(b.fullName || '', 'ru');
    });
    return all;
  }

  async function addStudent(data) {
    await init();
    var now = new Date().toISOString();
    var student = {
      id: 'stu_' + genId(),
      classId: data.classId,
      classNumber: data.classNumber || null,
      fullName: (data.fullName || '').trim(),
      normalizedName: normalizeName(data.fullName),
      uin: (data.uin || '').trim(),
      createdAt: now,
      updatedAt: now
    };
    var t = tx(['students'], 'readwrite');
    t.objectStore('students').put(student);
    await txDone(t);
    return student;
  }

  async function updateStudent(id, patch) {
    await init();
    var t = tx(['students'], 'readwrite');
    var store = t.objectStore('students');
    var s = await reqP(store.get(id));
    if (!s) throw new Error('Ученик не найден');
    if (patch.fullName !== undefined) {
      s.fullName = patch.fullName.trim();
      s.normalizedName = normalizeName(patch.fullName);
    }
    if (patch.uin !== undefined) s.uin = patch.uin.trim();
    if (patch.classId !== undefined) s.classId = patch.classId;
    if (patch.classNumber !== undefined) s.classNumber = patch.classNumber;
    s.updatedAt = new Date().toISOString();
    store.put(s);
    await txDone(t);
    return s;
  }

  async function deleteStudent(id) {
    await init();
    var t = tx(['students'], 'readwrite');
    t.objectStore('students').delete(id);
    await txDone(t);
  }

  async function moveStudents(studentIds, targetClassId) {
    await init();
    var t = tx(['students'], 'readwrite');
    var store = t.objectStore('students');
    for (var i = 0; i < studentIds.length; i++) {
      var s = await reqP(store.get(studentIds[i]));
      if (s) {
        s.classId = targetClassId;
        s.classNumber = null; /* Reset class number — will be reassigned */
        s.updatedAt = new Date().toISOString();
        store.put(s);
      }
    }
    await txDone(t);
  }

  async function renumberClass(classId) {
    var students = await getStudentsByClass(classId);
    students.sort(function (a, b) { return (a.fullName || '').localeCompare(b.fullName || '', 'ru'); });
    var t = tx(['students'], 'readwrite');
    var store = t.objectStore('students');
    for (var i = 0; i < students.length; i++) {
      var s = await reqP(store.get(students[i].id));
      s.classNumber = i + 1;
      s.updatedAt = new Date().toISOString();
      store.put(s);
    }
    await txDone(t);
  }

  /* ======= Bulk import helpers ======= */

  /**
   * Import from school file (ГТО format): clears all and replaces.
   * data: [{ className, students: [{ classNumber, fullName, uin }] }]
   */
  async function importFullReplace(data) {
    await init();
    var t = tx(['classes', 'students'], 'readwrite');
    /* Clear all existing */
    t.objectStore('classes').clear();
    t.objectStore('students').clear();
    var now = new Date().toISOString();
    data.forEach(function (cls, ci) {
      var classId = 'cls_' + genId() + '_' + ci;
      t.objectStore('classes').put({
        id: classId, name: cls.className, sortOrder: ci, createdAt: now, updatedAt: now
      });
      (cls.students || []).forEach(function (stu, si) {
        t.objectStore('students').put({
          id: 'stu_' + genId() + '_' + ci + '_' + si,
          classId: classId,
          classNumber: stu.classNumber || (si + 1),
          fullName: (stu.fullName || '').trim(),
          normalizedName: normalizeName(stu.fullName),
          uin: (stu.uin || '').trim(),
          createdAt: now,
          updatedAt: now
        });
      });
    });
    await txDone(t);
  }

  /**
   * Sync from ASU file: merges with existing data.
   * Returns a diff report: { added, updated, moved, conflicts, skipped }
   */
  async function syncFromAsu(incomingStudents) {
    await init();
    var report = { added: [], updated: [], moved: [], conflicts: [], skipped: [] };
    var allStudents = await getAllStudents();
    var allClasses = await getAllClasses();

    /* Build lookup maps */
    var byUin = {};
    var byName = {};
    allStudents.forEach(function (s) {
      if (s.uin) byUin[s.uin.trim()] = s;
      if (s.normalizedName) {
        if (!byName[s.normalizedName]) byName[s.normalizedName] = [];
        byName[s.normalizedName].push(s);
      }
    });

    for (var i = 0; i < incomingStudents.length; i++) {
      var inc = incomingStudents[i];
      var normalizedInc = normalizeName(inc.fullName);
      var normalizedClassName = normalizeClassName(inc.className);

      /* Find or create the target class */
      var targetClass = allClasses.find(function (c) { return normalizeClassName(c.name) === normalizedClassName; });
      if (!targetClass) {
        targetClass = await createClass(inc.className);
        allClasses.push(targetClass);
      }

      /* Try to match existing student */
      var matched = null;
      var matchMethod = '';

      /* 1. Match by UIN (if both have it) */
      if (inc.uin && byUin[inc.uin.trim()]) {
        matched = byUin[inc.uin.trim()];
        matchMethod = 'uin';
      }

      /* 2. Match by normalized FIO */
      if (!matched && normalizedInc) {
        var candidates = byName[normalizedInc] || [];
        if (candidates.length === 1) {
          matched = candidates[0];
          matchMethod = 'name';
        } else if (candidates.length > 1) {
          /* Multiple students with same name — try to narrow by class */
          var inClass = candidates.filter(function (c) {
            var cls = allClasses.find(function (cl) { return cl.id === c.classId; });
            return cls && normalizeClassName(cls.name) === normalizedClassName;
          });
          if (inClass.length === 1) {
            matched = inClass[0];
            matchMethod = 'name+class';
          } else {
            report.conflicts.push({
              incoming: inc,
              reason: 'Несколько учеников с одинаковым ФИО: ' + inc.fullName,
              candidates: candidates.map(function (c) {
                var cls = allClasses.find(function (cl) { return cl.id === c.classId; });
                return c.fullName + ' (' + (cls ? cls.name : '?') + ')';
              })
            });
            continue;
          }
        }
      }

      if (matched) {
        var changes = [];
        var patch = {};

        /* Check if class changed */
        var matchedClass = allClasses.find(function (c) { return c.id === matched.classId; });
        if (matchedClass && normalizeClassName(matchedClass.name) !== normalizedClassName) {
          patch.classId = targetClass.id;
          patch.classNumber = null;
          changes.push('класс: ' + matchedClass.name + ' → ' + targetClass.name);
        }

        /* Update FIO if changed (but preserve UIN!) */
        if (normalizeName(matched.fullName) !== normalizedInc) {
          patch.fullName = inc.fullName;
          changes.push('ФИО: ' + matched.fullName + ' → ' + inc.fullName);
        }

        if (changes.length > 0) {
          await updateStudent(matched.id, patch);
          if (patch.classId) {
            report.moved.push({ student: inc, from: matchedClass ? matchedClass.name : '?', to: targetClass.name, changes: changes });
          } else {
            report.updated.push({ student: inc, changes: changes });
          }
        } else {
          report.skipped.push({ student: inc, reason: 'Без изменений' });
        }
      } else {
        /* New student */
        await addStudent({
          classId: targetClass.id,
          classNumber: null,
          fullName: inc.fullName,
          uin: ''  /* UIN not in ASU file */
        });
        report.added.push({ student: inc, class: targetClass.name });
      }
    }

    /* Renumber all affected classes */
    var affectedClasses = new Set();
    report.added.forEach(function (r) {
      var cls = allClasses.find(function (c) { return c.name === r.class; });
      if (cls) affectedClasses.add(cls.id);
    });
    report.moved.forEach(function (r) {
      var cls = allClasses.find(function (c) { return c.name === r.to; });
      if (cls) affectedClasses.add(cls.id);
    });
    for (var clsId of affectedClasses) {
      await renumberClass(clsId);
    }

    return report;
  }

  /* ======= Stats ======= */
  async function getStats() {
    var classes = await getAllClasses();
    var students = await getAllStudents();
    var withUin = students.filter(function (s) { return s.uin && s.uin !== '-' && s.uin !== ''; }).length;
    return { classCount: classes.length, studentCount: students.length, withUin: withUin };
  }

  window.GTOSchool = {
    init: init,
    normalizeName: normalizeName,
    normalizeClassName: normalizeClassName,
    /* Classes */
    getAllClasses: getAllClasses,
    getClass: getClass,
    createClass: createClass,
    renameClass: renameClass,
    deleteClass: deleteClass,
    findOrCreateClass: findOrCreateClass,
    /* Students */
    getAllStudents: getAllStudents,
    getStudentsByClass: getStudentsByClass,
    addStudent: addStudent,
    updateStudent: updateStudent,
    deleteStudent: deleteStudent,
    moveStudents: moveStudents,
    renumberClass: renumberClass,
    /* Import */
    importFullReplace: importFullReplace,
    syncFromAsu: syncFromAsu,
    /* Stats */
    getStats: getStats
  };
})();
