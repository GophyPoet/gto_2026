/**
 * dashboard.js — Main dashboard controller.
 * Manages session list, tab navigation, create/delete/open flows.
 */
(function () {
  'use strict';

  var sessions = window.GTOSessions;

  /* ---- Elements ---- */
  var els = {
    heroStats: document.getElementById('heroStats'),
    sessionsList: document.getElementById('sessionsList'),
    createBtn: document.getElementById('createSessionBtn'),
    createDialog: document.getElementById('createDialog'),
    confirmCreateBtn: document.getElementById('confirmCreateBtn'),
    newEventDate: document.getElementById('newEventDate'),
    deleteDialog: document.getElementById('deleteDialog'),
    deleteMessage: document.getElementById('deleteMessage'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBtn')
  };

  var pendingDeleteId = null;

  /* ---- Tab navigation ---- */
  document.querySelectorAll('.topnav-link[data-tab]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      var tabId = link.dataset.tab;
      document.querySelectorAll('.topnav-link').forEach(function (l) { l.classList.remove('is-active'); });
      document.querySelectorAll('.tab-content').forEach(function (t) { t.classList.remove('is-active'); });
      link.classList.add('is-active');
      var target = document.getElementById('tab-' + tabId);
      if (target) target.classList.add('is-active');
    });
  });

  /* ---- Rendering ---- */

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatRelativeTime(isoString) {
    if (!isoString) return '';
    var diff = Date.now() - new Date(isoString).getTime();
    var minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'только что';
    if (minutes < 60) return minutes + ' мин. назад';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' ч. назад';
    var days = Math.floor(hours / 24);
    if (days < 30) return days + ' дн. назад';
    return new Date(isoString).toLocaleDateString('ru-RU');
  }

  async function renderSessions() {
    var all = await sessions.getAllSessions();

    /* Hero stats */
    els.heroStats.innerHTML =
      '<div class="hero-stat"><div class="hero-stat-value">' + all.length + '</div><div class="hero-stat-label">Дат создано</div></div>' +
      '<div class="hero-stat"><div class="hero-stat-value">' + all.filter(function (s) { return s.eventDate; }).length + '</div><div class="hero-stat-label">С назначенной датой</div></div>';

    /* Session cards */
    if (!all.length) {
      els.sessionsList.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-state-icon">' +
            '<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="6" y="8" width="28" height="26" rx="4" stroke="currentColor" stroke-width="2.5"/><path d="M6 16h28" stroke="currentColor" stroke-width="2.5"/><path d="M14 4v8M26 4v8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>' +
          '</div>' +
          '<h3>Пока нет ни одной даты</h3>' +
          '<p>Создайте первую дату проведения ГТО, чтобы начать работу с заявками.</p>' +
        '</div>';
      return;
    }

    var cardsHtml = '';
    for (var i = 0; i < all.length; i++) {
      var s = all[i];
      /* Try to read some quick info from session data */
      var data = await sessions.getSessionData(s.id);
      var schoolName = (data && data.meta && data.meta.schoolName) ? data.meta.schoolName : '';
      var participantsCount = (data && data.selectedParticipants) ? data.selectedParticipants.length : 0;

      cardsHtml +=
        '<article class="session-card" data-open="' + s.id + '">' +
          '<div class="session-card-date">' + escapeHtml(sessions.formatDateLabel(s.eventDate) || 'Дата не указана') + '</div>' +
          (schoolName ? '<div class="session-card-school">' + escapeHtml(schoolName) + '</div>' : '') +
          '<div class="session-card-label">' +
            (participantsCount > 0 ? '<span class="session-card-participants">' + participantsCount + ' участн.</span> ' : '') +
          '</div>' +
          '<div class="session-card-meta">' +
            '<div class="session-card-meta-item"><span class="session-card-dot"></span> Создана: ' + escapeHtml(new Date(s.createdAt).toLocaleDateString('ru-RU')) + '</div>' +
            '<div class="session-card-meta-item">Изменена: ' + escapeHtml(formatRelativeTime(s.updatedAt)) + '</div>' +
          '</div>' +
          '<div class="session-card-actions">' +
            '<button class="btn btn-primary btn-sm" data-open="' + s.id + '" type="button">Открыть</button>' +
            '<button class="btn-icon-only" data-delete="' + s.id + '" title="Удалить" type="button">' +
              '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 0 1 1.334-1.334h2.666a1.333 1.333 0 0 1 1.334 1.334V4M12.667 4v9.333a1.333 1.333 0 0 1-1.334 1.334H4.667a1.333 1.333 0 0 1-1.334-1.334V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</button>' +
          '</div>' +
        '</article>';
    }
    els.sessionsList.innerHTML = cardsHtml;

    /* Bind open */
    els.sessionsList.querySelectorAll('[data-open]').forEach(function (el) {
      el.addEventListener('click', function (event) {
        /* Don't navigate if clicking delete button */
        if (event.target.closest('[data-delete]')) return;
        openSession(el.dataset.open);
      });
    });

    /* Bind delete */
    els.sessionsList.querySelectorAll('[data-delete]').forEach(function (btn) {
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        promptDelete(btn.dataset.delete);
      });
    });
  }

  /* ---- Actions ---- */

  function openSession(id) {
    window.location.href = 'workspace.html?session=' + encodeURIComponent(id);
  }

  /* Create */
  els.createBtn.addEventListener('click', function () {
    /* Default to today + 14 days */
    var d = new Date();
    d.setDate(d.getDate() + 14);
    els.newEventDate.value = d.toISOString().slice(0, 10);
    els.createDialog.showModal();
  });

  els.confirmCreateBtn.addEventListener('click', async function () {
    var eventDate = els.newEventDate.value;
    if (!eventDate) {
      alert('Укажите дату проведения ГТО.');
      return;
    }
    try {
      var session = await sessions.createSession(eventDate);
      els.createDialog.close();
      openSession(session.id);
    } catch (error) {
      alert('Ошибка создания сессии: ' + (error.message || error));
    }
  });

  /* Delete */
  function promptDelete(id) {
    pendingDeleteId = id;
    sessions.getSession(id).then(function (s) {
      els.deleteMessage.textContent =
        'Удалить сессию "' + (s ? s.label : id) + '"? Все данные будут удалены безвозвратно.';
      els.deleteDialog.showModal();
    });
  }

  els.confirmDeleteBtn.addEventListener('click', async function () {
    if (!pendingDeleteId) return;
    try {
      await sessions.deleteSession(pendingDeleteId);
      pendingDeleteId = null;
      els.deleteDialog.close();
      await renderSessions();
    } catch (error) {
      alert('Ошибка удаления: ' + (error.message || error));
    }
  });

  /* ---- Init ---- */
  sessions.init().then(function () {
    renderSessions();
  }).catch(function (error) {
    console.error('Failed to init sessions DB:', error);
    els.sessionsList.innerHTML = '<div class="empty-state"><p>Ошибка инициализации базы данных.</p></div>';
  });
})();
