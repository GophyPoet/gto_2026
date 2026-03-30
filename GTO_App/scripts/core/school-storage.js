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
  var DB_VERSION = 2;
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
        /* v2: archive + staff + parents + extra */
        if (!d.objectStoreNames.contains('archive')) {
          var archStore = d.createObjectStore('archive', { keyPath: 'id' });
          archStore.createIndex('byClass', 'originalClassName', { unique: false });
        }
        if (!d.objectStoreNames.contains('staff')) {
          d.createObjectStore('staff', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('parents')) {
          d.createObjectStore('parents', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('extra')) {
          d.createObjectStore('extra', { keyPath: 'id' });
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
      /* ASU extended fields */
      gender: (data.gender || '').trim(),
      birthDate: (data.birthDate || '').trim(),
      formOfEducation: (data.formOfEducation || '').trim(),
      documentType: (data.documentType || '').trim(),
      documentSeries: (data.documentSeries || '').trim(),
      documentNumber: (data.documentNumber || '').trim(),
      snils: (data.snils || '').trim(),
      residenceLocality: (data.residenceLocality || '').trim(),
      residenceStreetName: (data.residenceStreetName || '').trim(),
      residenceStreetType: (data.residenceStreetType || '').trim(),
      residenceHouse: (data.residenceHouse || '').trim(),
      residenceBuilding: (data.residenceBuilding || '').trim(),
      residenceApartment: (data.residenceApartment || '').trim(),
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
    /* ASU extended fields */
    var extFields = ['gender', 'birthDate', 'formOfEducation', 'documentType', 'documentSeries', 'documentNumber',
      'snils', 'residenceLocality', 'residenceStreetName', 'residenceStreetType',
      'residenceHouse', 'residenceBuilding', 'residenceApartment'];
    extFields.forEach(function (f) {
      if (patch[f] !== undefined) s[f] = typeof patch[f] === 'string' ? patch[f].trim() : patch[f];
    });
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

    /* Collect existing student data keyed by normalized name+class for preservation */
    var preserveMap = {};
    var tRead = tx(['students', 'classes'], 'readonly');
    var existingStudents = await reqP(tRead.objectStore('students').getAll());
    var existingClasses = await reqP(tRead.objectStore('classes').getAll());
    var classNameMap = {};
    existingClasses.forEach(function (c) { classNameMap[c.id] = normalizeClassName(c.name); });
    existingStudents.forEach(function (s) {
      var key = normalizeName(s.fullName) + '|' + (classNameMap[s.classId] || '');
      preserveMap[key] = s;
      /* Also store by name-only as fallback */
      var nameKey = normalizeName(s.fullName);
      if (!preserveMap['__name__' + nameKey]) preserveMap['__name__' + nameKey] = s;
    });

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
      var normalizedClass = normalizeClassName(cls.className);
      (cls.students || []).forEach(function (stu, si) {
        /* Look up preserved data by name+class, then by name only */
        var nName = normalizeName(stu.fullName);
        var prev = preserveMap[nName + '|' + normalizedClass] || preserveMap['__name__' + nName] || {};

        /* Preserve UIN: keep existing if incoming is empty */
        var incomingUin = (stu.uin || '').trim();
        var preservedUin = incomingUin || (prev.uin || '').trim();

        /* Preserve extended fields: keep existing if incoming is empty */
        var extFieldNames = ['formOfEducation', 'gender', 'birthDate', 'documentType', 'documentSeries', 'documentNumber',
          'snils', 'residenceLocality', 'residenceStreetName', 'residenceStreetType',
          'residenceHouse', 'residenceBuilding', 'residenceApartment'];
        var extData = {};
        extFieldNames.forEach(function (f) {
          var inc = (stu[f] || '').trim();
          extData[f] = inc || (prev[f] || '').trim();
        });

        t.objectStore('students').put({
          id: 'stu_' + genId() + '_' + ci + '_' + si,
          classId: classId,
          classNumber: stu.classNumber || (si + 1),
          fullName: (stu.fullName || '').trim(),
          normalizedName: nName,
          uin: preservedUin,
          formOfEducation: extData.formOfEducation,
          gender: extData.gender,
          birthDate: extData.birthDate,
          documentType: extData.documentType,
          documentSeries: extData.documentSeries,
          documentNumber: extData.documentNumber,
          snils: extData.snils,
          residenceLocality: extData.residenceLocality,
          residenceStreetName: extData.residenceStreetName,
          residenceStreetType: extData.residenceStreetType,
          residenceHouse: extData.residenceHouse,
          residenceBuilding: extData.residenceBuilding,
          residenceApartment: extData.residenceApartment,
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
    var report = { added: [], updated: [], moved: [], archived: [], conflicts: [], skipped: [] };
    var allStudents = await getAllStudents();
    var allClasses = await getAllClasses();
    var matchedStudentIds = new Set();

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
        matchedStudentIds.add(matched.id);
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

        /* Sync extended ASU fields (overwrite with fresh data, preserve UIN) */
        var extFields = ['gender', 'birthDate', 'formOfEducation', 'documentType', 'documentSeries', 'documentNumber',
          'snils', 'residenceLocality', 'residenceStreetName', 'residenceStreetType',
          'residenceHouse', 'residenceBuilding', 'residenceApartment'];
        extFields.forEach(function (f) {
          if (inc[f] !== undefined && inc[f] !== '') {
            var oldVal = matched[f] || '';
            if (oldVal !== inc[f]) {
              patch[f] = inc[f];
            }
          }
        });

        /* Count data field updates separately */
        var dataUpdated = Object.keys(patch).filter(function (k) {
          return k !== 'classId' && k !== 'classNumber' && k !== 'fullName';
        }).length > 0;

        if (changes.length > 0 || dataUpdated) {
          if (dataUpdated && changes.length === 0) {
            changes.push('обновлены данные АСУ');
          }
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
        /* New student — include all ASU fields */
        await addStudent({
          classId: targetClass.id,
          classNumber: null,
          fullName: inc.fullName,
          uin: '',
          formOfEducation: inc.formOfEducation || '',
          gender: inc.gender || '',
          birthDate: inc.birthDate || '',
          documentType: inc.documentType || '',
          documentSeries: inc.documentSeries || '',
          documentNumber: inc.documentNumber || '',
          snils: inc.snils || '',
          residenceLocality: inc.residenceLocality || '',
          residenceStreetName: inc.residenceStreetName || '',
          residenceStreetType: inc.residenceStreetType || '',
          residenceHouse: inc.residenceHouse || '',
          residenceBuilding: inc.residenceBuilding || '',
          residenceApartment: inc.residenceApartment || ''
        });
        report.added.push({ student: inc, class: targetClass.name });
      }
    }

    /* Archive students not found in ASU data */
    for (var si = 0; si < allStudents.length; si++) {
      var existing = allStudents[si];
      if (!matchedStudentIds.has(existing.id)) {
        var existingClass = allClasses.find(function (c) { return c.id === existing.classId; });
        await archiveStudent(existing.id, 'Не найден в АСУ РСО при синхронизации');
        report.archived.push({
          student: { fullName: existing.fullName, className: existingClass ? existingClass.name : '?' },
          reason: 'Отсутствует в файле АСУ'
        });
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
    report.archived.forEach(function (r) {
      var cls = allClasses.find(function (c) { return c.name === r.student.className; });
      if (cls) affectedClasses.add(cls.id);
    });
    for (var clsId of affectedClasses) {
      await renumberClass(clsId);
    }

    return report;
  }

  /* ======= Archive ======= */

  /**
   * Archive a student: move from students store to archive store.
   * Preserves all data + adds archivedAt and reason.
   */
  async function archiveStudent(studentId, reason) {
    await init();
    var t = tx(['students', 'archive', 'classes'], 'readwrite');
    var stuStore = t.objectStore('students');
    var archStore = t.objectStore('archive');
    var s = await reqP(stuStore.get(studentId));
    if (!s) throw new Error('Ученик не найден');
    /* Resolve class name for display */
    var cls = await reqP(t.objectStore('classes').get(s.classId));
    var archived = {
      id: s.id,
      classId: s.classId,
      originalClassName: cls ? cls.name : '',
      classNumber: s.classNumber,
      fullName: s.fullName,
      normalizedName: s.normalizedName,
      uin: s.uin,
      reason: reason || '',
      createdAt: s.createdAt,
      archivedAt: new Date().toISOString()
    };
    archStore.put(archived);
    stuStore.delete(studentId);
    await txDone(t);
    return archived;
  }

  /**
   * Archive multiple students at once.
   */
  async function archiveStudents(studentIds, reason) {
    var results = [];
    for (var i = 0; i < studentIds.length; i++) {
      results.push(await archiveStudent(studentIds[i], reason));
    }
    return results;
  }

  /**
   * Restore a student from archive back to active roster.
   */
  async function restoreStudent(archivedId) {
    await init();
    var t = tx(['students', 'archive', 'classes'], 'readwrite');
    var archStore = t.objectStore('archive');
    var stuStore = t.objectStore('students');
    var a = await reqP(archStore.get(archivedId));
    if (!a) throw new Error('Запись не найдена в архиве');
    /* Verify target class still exists */
    var cls = await reqP(t.objectStore('classes').get(a.classId));
    if (!cls) throw new Error('Класс "' + a.originalClassName + '" больше не существует. Сначала создайте его.');
    var now = new Date().toISOString();
    var student = {
      id: a.id,
      classId: a.classId,
      classNumber: null,
      fullName: a.fullName,
      normalizedName: a.normalizedName,
      uin: a.uin || '',
      createdAt: a.createdAt,
      updatedAt: now
    };
    stuStore.put(student);
    archStore.delete(archivedId);
    await txDone(t);
    return student;
  }

  async function deleteArchivedStudent(id) {
    await init();
    var t = tx(['archive'], 'readwrite');
    t.objectStore('archive').delete(id);
    await txDone(t);
  }

  async function getArchivedStudents() {
    await init();
    var all = await reqP(tx(['archive'], 'readonly').objectStore('archive').getAll());
    all.sort(function (a, b) {
      return (b.archivedAt || '').localeCompare(a.archivedAt || '');
    });
    return all;
  }

  /* ======= Generic person stores: staff, parents, extra ======= */

  function personModel(data) {
    var now = new Date().toISOString();
    return {
      id: data.id || 'per_' + genId(),
      fullName: (data.fullName || '').trim(),
      normalizedName: normalizeName(data.fullName),
      role: (data.role || '').trim(),
      phone: (data.phone || '').trim(),
      email: (data.email || '').trim(),
      note: (data.note || '').trim(),
      createdAt: data.createdAt || now,
      updatedAt: now
    };
  }

  async function getAll(storeName) {
    await init();
    var all = await reqP(tx([storeName], 'readonly').objectStore(storeName).getAll());
    all.sort(function (a, b) { return (a.fullName || '').localeCompare(b.fullName || '', 'ru'); });
    return all;
  }

  async function addPerson(storeName, data) {
    await init();
    var person = personModel(data);
    var t = tx([storeName], 'readwrite');
    t.objectStore(storeName).put(person);
    await txDone(t);
    return person;
  }

  async function updatePerson(storeName, id, patch) {
    await init();
    var t = tx([storeName], 'readwrite');
    var store = t.objectStore(storeName);
    var p = await reqP(store.get(id));
    if (!p) throw new Error('Запись не найдена');
    Object.keys(patch).forEach(function (k) {
      if (patch[k] !== undefined) p[k] = typeof patch[k] === 'string' ? patch[k].trim() : patch[k];
    });
    if (patch.fullName !== undefined) p.normalizedName = normalizeName(patch.fullName);
    p.updatedAt = new Date().toISOString();
    store.put(p);
    await txDone(t);
    return p;
  }

  async function deletePerson(storeName, id) {
    await init();
    var t = tx([storeName], 'readwrite');
    t.objectStore(storeName).delete(id);
    await txDone(t);
  }

  /* Convenience wrappers */
  var staffApi = {
    getAll: function () { return getAll('staff'); },
    add: function (data) { return addPerson('staff', data); },
    update: function (id, patch) { return updatePerson('staff', id, patch); },
    delete: function (id) { return deletePerson('staff', id); }
  };
  var parentsApi = {
    getAll: function () { return getAll('parents'); },
    add: function (data) { return addPerson('parents', data); },
    update: function (id, patch) { return updatePerson('parents', id, patch); },
    delete: function (id) { return deletePerson('parents', id); }
  };
  var extraApi = {
    getAll: function () { return getAll('extra'); },
    add: function (data) { return addPerson('extra', data); },
    update: function (id, patch) { return updatePerson('extra', id, patch); },
    delete: function (id) { return deletePerson('extra', id); }
  };

  /* ======= Stats ======= */
  function isHomeschooler(s) {
    var form = (s.formOfEducation || '').toLowerCase().trim();
    return form && form !== 'очная';
  }

  async function getStats() {
    var classes = await getAllClasses();
    var students = await getAllStudents();
    var archived = await getArchivedStudents();
    var regular = students.filter(function (s) { return !isHomeschooler(s); });
    var homeschoolers = students.filter(function (s) { return isHomeschooler(s); });
    var withUin = regular.filter(function (s) { return s.uin && s.uin !== '-' && s.uin !== ''; }).length;
    return {
      classCount: classes.length,
      studentCount: regular.length,
      withUin: withUin,
      archivedCount: archived.length,
      homeschoolerCount: homeschoolers.length
    };
  }

  async function getHomeschoolers() {
    var students = await getAllStudents();
    return students.filter(function (s) { return isHomeschooler(s); })
      .sort(function (a, b) { return (a.fullName || '').localeCompare(b.fullName || '', 'ru'); });
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
    /* Archive */
    archiveStudent: archiveStudent,
    archiveStudents: archiveStudents,
    restoreStudent: restoreStudent,
    deleteArchivedStudent: deleteArchivedStudent,
    getArchivedStudents: getArchivedStudents,
    /* Staff / Parents / Extra */
    staff: staffApi,
    parents: parentsApi,
    extra: extraApi,
    /* Homeschoolers */
    isHomeschooler: isHomeschooler,
    getHomeschoolers: getHomeschoolers,
    /* Stats */
    getStats: getStats
  };
})();
