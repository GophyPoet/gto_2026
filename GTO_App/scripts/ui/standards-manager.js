/**
 * standards-manager.js — Dashboard UI for managing GTO standards (CRUD).
 *
 * Renders into #standardsManager container on the dashboard.
 * Uses GTOStandards API (standards-storage.js) for persistence.
 *
 * Public API: window.GTOStandardsManager
 *   .render() — draw the UI
 */
(function () {
  'use strict';

  var container = document.getElementById('standardsManager');
  if (!container) return;

  var currentStageNum = 1;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function render() {
    if (!window.GTOStandards) {
      container.innerHTML = '<div class="empty-state">Модуль нормативов не загружен.</div>';
      return;
    }

    await window.GTOStandards.init();
    var allStages = await window.GTOStandards.getAllStages();

    if (!allStages.length) {
      container.innerHTML = '<div class="empty-state">Нормативы не загружены. Нажмите "Сбросить к начальным" для загрузки.</div>';
      return;
    }

    /* Ensure currentStageNum is valid */
    if (!allStages.find(function (s) { return s.stageNumber === currentStageNum; })) {
      currentStageNum = allStages[0].stageNumber;
    }

    var stage = allStages.find(function (s) { return s.stageNumber === currentStageNum; });

    /* Stage tabs */
    var tabsHtml = '<div class="standards-mgmt-tabs">';
    allStages.forEach(function (s) {
      tabsHtml += '<button class="class-tab' + (s.stageNumber === currentStageNum ? ' is-active' : '') +
        '" data-stage="' + s.stageNumber + '" type="button">' + s.stageNumber + ' ст.</button>';
    });
    tabsHtml += '</div>';

    /* Stage info */
    var stageHtml = '<div class="standards-mgmt-stage">';
    stageHtml += '<h4>' + stage.stageNumber + ' ступень (' + escapeHtml(stage.ageRange) + ')</h4>';

    stage.items.forEach(function (item) {
      stageHtml += '<div class="standards-mgmt-item">';
      stageHtml += '<div class="standards-mgmt-item-header">';
      stageHtml += '<span>Пункт ' + item.itemNumber;
      if (item.hint) stageHtml += ' <span class="standards-hint">(' + escapeHtml(item.hint) + ')</span>';
      if (item.selectionType === 'multi') stageHtml += ' <span class="standards-hint">[выбор из ' + item.disciplines.length + ']</span>';
      stageHtml += '</span>';
      stageHtml += '<div class="standards-mgmt-actions">';
      stageHtml += '<button class="btn btn-secondary" data-add-disc="' + item.itemNumber + '" type="button">+ дисципл.</button>';
      stageHtml += '<button class="btn btn-secondary" data-remove-item="' + item.itemNumber + '" type="button">Удалить пункт</button>';
      stageHtml += '</div>';
      stageHtml += '</div>';

      item.disciplines.forEach(function (disc) {
        stageHtml += '<div class="standards-mgmt-disc">';
        stageHtml += '<span>' + escapeHtml(disc) + '</span>';
        stageHtml += '<div class="standards-mgmt-actions">';
        stageHtml += '<button class="btn btn-secondary" data-edit-disc="' + item.itemNumber + '" data-disc-name="' + escapeHtml(disc) + '" type="button">Ред.</button>';
        stageHtml += '<button class="btn btn-secondary" data-del-disc="' + item.itemNumber + '" data-disc-name="' + escapeHtml(disc) + '" type="button">&#10005;</button>';
        stageHtml += '</div>';
        stageHtml += '</div>';
      });

      stageHtml += '</div>';
    });

    stageHtml += '<div style="margin-top: 0.75rem; display: flex; gap: 0.5rem;">';
    stageHtml += '<button class="btn btn-secondary" id="stdAddItem" type="button">+ Добавить пункт</button>';
    stageHtml += '<button class="btn btn-ghost" id="stdReset" type="button">Сбросить к начальным</button>';
    stageHtml += '</div>';
    stageHtml += '</div>';

    container.innerHTML = tabsHtml + stageHtml;

    /* Bind stage tabs */
    container.querySelectorAll('[data-stage]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentStageNum = parseInt(btn.dataset.stage, 10);
        render();
      });
    });

    /* Bind add discipline */
    container.querySelectorAll('[data-add-disc]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var itemNum = parseInt(btn.dataset.addDisc, 10);
        var name = prompt('Название новой дисциплины:');
        if (!name || !name.trim()) return;
        window.GTOStandards.addDiscipline(currentStageNum, itemNum, name.trim()).then(function () {
          invalidateCache();
          render();
        }).catch(function (e) { alert(e.message); });
      });
    });

    /* Bind edit discipline */
    container.querySelectorAll('[data-edit-disc]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var itemNum = parseInt(btn.dataset.editDisc, 10);
        var oldName = btn.dataset.discName;
        var newName = prompt('Новое название дисциплины:', oldName);
        if (!newName || !newName.trim() || newName.trim() === oldName) return;
        window.GTOStandards.updateDiscipline(currentStageNum, itemNum, oldName, newName.trim()).then(function () {
          invalidateCache();
          render();
        }).catch(function (e) { alert(e.message); });
      });
    });

    /* Bind delete discipline */
    container.querySelectorAll('[data-del-disc]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var itemNum = parseInt(btn.dataset.delDisc, 10);
        var name = btn.dataset.discName;
        if (!confirm('Удалить дисциплину "' + name + '"?')) return;
        window.GTOStandards.removeDiscipline(currentStageNum, itemNum, name).then(function () {
          invalidateCache();
          render();
        }).catch(function (e) { alert(e.message); });
      });
    });

    /* Bind remove item */
    container.querySelectorAll('[data-remove-item]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var itemNum = parseInt(btn.dataset.removeItem, 10);
        if (!confirm('Удалить пункт ' + itemNum + ' со всеми дисциплинами?')) return;
        window.GTOStandards.removeItem(currentStageNum, itemNum).then(function () {
          invalidateCache();
          render();
        }).catch(function (e) { alert(e.message); });
      });
    });

    /* Bind add item */
    var addItemBtn = document.getElementById('stdAddItem');
    if (addItemBtn) {
      addItemBtn.addEventListener('click', function () {
        var name = prompt('Название первой дисциплины нового пункта:');
        if (!name || !name.trim()) return;
        window.GTOStandards.addItem(currentStageNum, {
          disciplines: [name.trim()],
          selectionType: 'single',
          hint: ''
        }).then(function () {
          invalidateCache();
          render();
        }).catch(function (e) { alert(e.message); });
      });
    }

    /* Bind reset */
    var resetBtn = document.getElementById('stdReset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (!confirm('Сбросить ВСЕ нормативы к начальным значениям из файла? Все пользовательские изменения будут потеряны.')) return;
        window.GTOStandards.resetToDefaults().then(function () {
          invalidateCache();
          render();
        }).catch(function (e) { alert(e.message); });
      });
    }
  }

  function invalidateCache() {
    /* Force workspace to reload standards on next visit */
    if (window.GTOApp) {
      window.GTOApp._standardsCacheDirty = true;
    }
  }

  window.GTOStandardsManager = { render: render };
})();
