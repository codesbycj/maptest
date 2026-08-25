/* Boot sequence and every event handler. All handlers are delegated
 * from containers that render() leaves alone, because render() replaces
 * the markup inside them on every pass. */

/* ==========================================================================
   Bookings — the one place a request changes from "waiting" to "booked"
   ========================================================================== */

var Bookings = (function () {

  /* localStorage mirror of what is booked, so a refresh is cheap. */
  function persist() {
    var rows = scheduledRequests().map(function (r) {
      return {
        id: r.id,
        startISO: r.booking.startISO,
        endISO: r.booking.endISO,
        eventId: r.booking.eventId
      };
    });
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(rows));
    } catch (err) {
      /* Private browsing, or storage disabled. Not worth failing over -
       * the session still works, it just will not survive a refresh. */
      console.warn('Could not save bookings:', err);
    }
  }

  function restore(requests) {
    var raw;
    try {
      raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    } catch (err) {
      return requests;
    }
    if (!raw) return requests;

    var rows;
    try {
      rows = JSON.parse(raw);
    } catch (err) {
      return requests;
    }

    var byId = {};
    rows.forEach(function (row) { byId[row.id] = row; });

    requests.forEach(function (r) {
      var row = byId[r.id];
      if (row) {
        r.status = 'scheduled';
        r.booking = { eventId: row.eventId || null, startISO: row.startISO, endISO: row.endISO };
      } else if (r.status === 'scheduled') {
        r.status = 'read';
        r.booking = null;
      }
    });

    return requests;
  }

  /* Does this span collide with something already booked? */
  function conflictAt(startDate, endDate, ignoreId) {
    return scheduledRequests().some(function (r) {
      if (r.id === ignoreId) return false;
      var s = new Date(r.booking.startISO);
      var e = new Date(r.booking.endISO);
      return startDate < e && endDate > s;
    });
  }

  function schedule(id, dayStr, timeStr) {
    var r = getRequest(id);
    if (!r) return;

    /* Guard, not a crash. A job with no address cannot be routed to, so
     * send the user to the field that fixes it. */
    if (!r.address) {
      APP.selectedId = r.id;
      APP.editingAddress = true;
      APP.pendingDropId = null;
      render();
      toast('Add an address before scheduling this job.');
      var input = document.getElementById('addr-input');
      if (input) input.focus();
      return;
    }

    var start = parseSlot(dayStr, timeStr);
    var end = new Date(start.getTime() + r.durationMins * 60000);

    if (conflictAt(start, end, r.id)) {
      toast('That slot overlaps another job.');
      return;
    }

    r.status = 'scheduled';
    r.booking = { eventId: null, startISO: toLocalISO(start), endISO: toLocalISO(end) };

    APP.selectedId = r.id;
    APP.pendingDropId = null;
    persist();
    render();
    toast(r.subject + ' booked for ' + formatTime(start) + '.');

    /* Sprint 7: mirror it into the real calendar. Fire and forget - the
     * UI has already committed, and a failure only costs the eventId. */
    if (APP.connected && typeof CalendarApi !== 'undefined') {
      CalendarApi.createEvent(r).then(function (eventId) {
        if (!eventId) return;
        r.booking.eventId = eventId;
        persist();
        render();
      }).catch(function (err) {
        console.error(err);
        toast('Booked locally, but Google Calendar rejected it.');
      });
    }
  }

  function unschedule(id) {
    var r = getRequest(id);
    if (!r || !r.booking) return;

    var eventId = r.booking.eventId;
    r.status = 'read';
    r.booking = null;
    persist();
    render();
    toast(r.subject + ' moved back to the inbox.');

    if (eventId && APP.connected && typeof CalendarApi !== 'undefined') {
      CalendarApi.deleteEvent(eventId).catch(function (err) { console.error(err); });
    }
  }

  return {
    schedule: schedule,
    unschedule: unschedule,
    restore: restore,
    persist: persist
  };
})();

/* ==========================================================================
   Loading
   ========================================================================== */

function loadRequests() {
  APP.loading = true;
  APP.error = null;
  render();

  return Gmail.loadRequests().then(function (requests) {
    APP.requests = Bookings.restore(requests);
    APP.loading = false;

    /* Keep the current selection if it still exists, otherwise pick the
     * newest thing waiting so the panels are never blank on first load. */
    if (!getSelected()) {
      var first = inboxRequests()[0] || APP.requests[0];
      APP.selectedId = first ? first.id : null;
    }
    render();
  }).catch(function (err) {
    console.error(err);
    APP.loading = false;
    APP.error = err;
    render();
    toast('Could not load requests.');
  });
}

/* ==========================================================================
   Wiring
   ========================================================================== */

function wireTopbar() {
  document.getElementById('btn-refresh').addEventListener('click', function () {
    loadRequests();
  });

  document.getElementById('btn-sync').addEventListener('click', function () {
    /* Must be called straight from a click handler - popup blockers
     * kill requestAccessToken() otherwise. Never call it on page load. */
    if (!APP.connected) {
      Gmail.connect().then(loadRequests).catch(function (err) {
        console.error(err);
        APP.error = err;
        render();
        toast('Could not connect to Gmail.');
      });
    } else {
      loadRequests();
    }
  });

  document.getElementById('btn-filter').addEventListener('click', function (e) {
    APP.filterUrgent = !APP.filterUrgent;
    e.currentTarget.classList.toggle('is-on', APP.filterUrgent);
    renderInbox();
  });
}

function wireCalendarNav() {
  document.getElementById('btn-prev-week').addEventListener('click', function () {
    APP.weekStart = addDays(APP.weekStart, -7);
    renderCalendar();
  });

  document.getElementById('btn-next-week').addEventListener('click', function () {
    APP.weekStart = addDays(APP.weekStart, 7);
    renderCalendar();
  });

  document.getElementById('btn-today').addEventListener('click', function () {
    APP.weekStart = startOfWeek(new Date());
    renderCalendar();
  });
}

function wireInbox() {
  document.getElementById('inbox-list').addEventListener('click', function (e) {
    var card = e.target.closest('.req-card');
    if (!card) return;
    APP.selectedId = card.dataset.id;
    APP.editingAddress = false;

    var r = getRequest(card.dataset.id);
    if (r && r.status === 'new') r.status = 'read';
    render();
  });
}

function wireDetail() {
  var detail = document.getElementById('detail');

  detail.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.dataset.act;
    var r = getRequest(btn.dataset.id);

    if (act === 'clear-selection') {
      APP.selectedId = null;
      APP.editingAddress = false;
      render();

    } else if (act === 'toggle-read' && r) {
      r.status = r.status === 'new' ? 'read' : 'new';
      render();

    } else if (act === 'toggle-edit') {
      APP.editingAddress = !APP.editingAddress;
      render();

    } else if (act === 'place' && r) {
      /* Click-to-place: arm the card, light up the grid, wait for a
       * slot click. js/dragdrop.js completes the other half. */
      APP.pendingDropId = r.id;
      render();
      toast('Now click a slot on the calendar.');

    } else if (act === 'unschedule' && r) {
      Bookings.unschedule(r.id);

    } else if (act === 'focus-map' && r) {
      document.getElementById('map-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  /* Address recovery. Writes straight into the request, clears the
   * needsReview flag, and refreshes the map without a full re-render
   * (which would blow away the input the user is typing in). */
  detail.addEventListener('input', function (e) {
    if (!e.target.matches('.addr-input')) return;
    var r = getRequest(e.target.dataset.id);
    if (!r) return;

    r.address = e.target.value.trim();
    if (r.address) {
      r.needsReview = false;
      r.area = r.address.split(',').slice(0, 2).join(',').trim();
    }
    renderInbox();
    renderMap();
  });
}

/* ==========================================================================
   Boot
   ========================================================================== */

function boot() {
  APP.weekStart = startOfWeek(new Date());

  wireTopbar();
  wireCalendarNav();
  wireInbox();
  wireDetail();
  DragDrop.init();

  render();

  /* Do not auto-open the consent popup - browsers block it unless it
   * comes from a real click. Wait for the Connect button. */
  Gmail.init().catch(function (err) {
    console.error(err);
    APP.error = err;
    render();
  });
}

document.addEventListener('DOMContentLoaded', boot);
