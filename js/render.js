/* Draws every panel from APP. Each function owns exactly one container
 * and reads state; none of them mutate it. render() calls all of them.
 *
 * This rebuilds innerHTML rather than diffing. At a dozen requests that
 * is instant, and it removes the whole class of bugs where the screen
 * and the data quietly disagree. Because the markup is thrown away on
 * every pass, all event handling is delegated from the containers in
 * js/app.js and js/dragdrop.js - never bound to these elements. */

/* Never interpolate user text into HTML without this. Email bodies are
 * attacker-controlled once real Gmail is switched on. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map(function (w) { return w.charAt(0).toUpperCase(); })
    .join('');
}

/* Small inline-SVG library, so the renderer stays readable. */
var ICONS = {
  pin:    '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  user:   '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  mail:   '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  phone:  '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  chat:   '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  clock:  '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  back:   '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  star:   '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
  dots:   '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
  cal:    '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  check:  '<path d="M20 6 9 17l-5-5"/>',
  ext:    '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/>',
  car:    '<path d="M5 17h14M6 17V9l2-4h8l2 4v8"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>',
  warn:   '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  inbox:  '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'
};

function ico(name, cls) {
  return '<svg viewBox="0 0 24 24" class="ico ' + (cls || '') + '">' + ICONS[name] + '</svg>';
}

/* ==========================================================================
   Topbar
   ========================================================================== */

function renderTopbar() {
  var pill = document.getElementById('conn-pill');
  var label = document.getElementById('conn-label');
  var sync = document.getElementById('sync-label');

  if (APP.error) {
    pill.dataset.state = 'error';
    label.textContent = 'Connection problem';
  } else if (APP.connected) {
    pill.dataset.state = 'connected';
    label.textContent = 'Gmail Connected';
  } else {
    pill.dataset.state = 'idle';
    label.textContent = 'Not connected';
  }

  sync.textContent = APP.connected ? 'Sync Now' : 'Connect Gmail';

  document.getElementById('btn-sync').disabled = APP.loading;
}

/* ==========================================================================
   Column 1 — inbox
   ========================================================================== */

function renderInbox() {
  var host = document.getElementById('inbox-list');
  var list = inboxRequests();

  if (APP.filterUrgent) {
    list = list.filter(function (r) { return r.urgency === 'urgent'; });
  }

  /* Newest first, but anything urgent floats to the top. */
  list.sort(function (a, b) {
    if (a.urgency !== b.urgency) return a.urgency === 'urgent' ? -1 : 1;
    return new Date(b.receivedAt) - new Date(a.receivedAt);
  });

  document.getElementById('inbox-count').textContent = list.length;

  if (!list.length) {
    /* Saying the wrong reason is worse than saying nothing - "every
     * request has been scheduled" while disconnected is a plain lie. */
    var head, note;

    if (!APP.connected) {
      head = 'Not connected';
      note = 'Click Connect Gmail to load your repair requests.';
    } else if (APP.filterUrgent) {
      head = 'Nothing urgent';
      note = 'No urgent requests right now. Clear the filter to see the rest.';
    } else if (APP.requests.length) {
      head = 'Nothing waiting';
      note = 'Every request has been scheduled.';
    } else {
      head = 'No requests found';
      note = 'Nothing in Gmail matched the search. Widen CONFIG.GMAIL_QUERY, '
           + 'or send yourself a test email with "repair" in the subject.';
    }

    host.innerHTML = '<div class="empty">' + ico('inbox')
      + '<strong>' + esc(head) + '</strong>'
      + '<span>' + esc(note) + '</span>'
      + '</div>';
    return;
  }

  host.innerHTML = list.map(function (r) {
    var tags = '';
    if (r.urgency === 'urgent') tags += '<span class="tag tag-urgent">Urgent</span>';
    if (r.needsReview) tags += '<span class="tag tag-review">Check address</span>';

    return '<article class="req-card'
      + (r.id === APP.selectedId ? ' is-selected' : '')
      + (r.id === APP.pendingDropId ? ' is-pending' : '')
      + '" draggable="true" data-id="' + esc(r.id) + '" data-status="' + esc(r.status) + '">'
      + '<div class="req-top">'
      +   '<h3 class="req-subject">' + esc(r.subject) + '</h3>'
      +   '<span class="req-time">' + esc(relativeTime(r.receivedAt)) + '</span>'
      + '</div>'
      + '<div class="req-from">' + esc(r.from) + '</div>'
      + '<div class="req-where">' + ico('pin') + '<span>' + esc(r.area || 'Address missing') + '</span></div>'
      + (tags ? '<div class="req-tags">' + tags + '</div>' : '')
      + '</article>';
  }).join('');
}

/* ==========================================================================
   Column 2 — detail
   ========================================================================== */

function field(iconName, label, valueHtml) {
  return '<div class="field">' + ico(iconName)
    + '<span class="field-label">' + esc(label) + '</span>'
    + '<span class="field-value">' + valueHtml + '</span></div>';
}

function renderDetail() {
  var host = document.getElementById('detail');
  var r = getSelected();

  if (!r) {
    host.innerHTML = '<div class="empty">' + ico('mail')
      + '<strong>No request selected</strong>'
      + '<span>Pick a request on the left to see the details Gmail gave us.</span>'
      + '</div>';
    return;
  }

  var received = new Date(r.receivedAt);

  /* The address is the one field that regularly fails to parse, so it is
   * the one field that is always editable. A blank card would be a dead
   * end; an input is a recovery path. */
  var showInput = r.needsReview || APP.editingAddress;
  var addressHtml = showInput
    ? '<input class="addr-input" id="addr-input" data-id="' + esc(r.id) + '"'
      + ' value="' + esc(r.address) + '"'
      + ' placeholder="Type the address, e.g. 15 Admiralty Way, Lekki Phase 1, Lagos">'
      + (r.needsReview && !r.address
          ? '<div class="field-missing" style="margin-top:6px">Not found in the email — add one to schedule this job.</div>'
          : '')
    : esc(r.address);

  var scheduledLine = '';
  if (r.status === 'scheduled' && r.booking) {
    var s = new Date(r.booking.startISO);
    var e = new Date(r.booking.endISO);
    scheduledLine = field('cal', 'Scheduled',
      esc(s.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }))
      + ' &middot; ' + esc(formatTime(s)) + ' – ' + esc(formatTime(e)));
  }

  var badge = r.status === 'scheduled'
    ? '<span class="tag tag-new" style="background:var(--green-tint);color:#15803d">Scheduled</span>'
    : '<span class="tag tag-new">New request</span>';

  var foot = r.status === 'scheduled'
    ? '<button class="btn" data-act="unschedule" data-id="' + esc(r.id) + '">' + ico('back') + 'Unschedule</button>'
      + '<button class="btn btn-primary" data-act="focus-map" data-id="' + esc(r.id) + '">' + ico('pin') + 'Show on map</button>'
    : '<button class="btn" data-act="toggle-read" data-id="' + esc(r.id) + '">' + ico('check')
      + (r.status === 'new' ? 'Mark as Read' : 'Mark Unread') + '</button>'
      + '<button class="btn btn-primary" data-act="place" data-id="' + esc(r.id) + '">' + ico('cal') + 'Schedule Repair</button>';

  host.innerHTML =
    '<div class="detail-bar">'
    +   '<button class="icon-btn" data-act="clear-selection" title="Back">' + ico('back') + '</button>'
    +   '<div class="spacer"></div>'
    +   '<button class="icon-btn" title="Mark unread" data-act="toggle-read" data-id="' + esc(r.id) + '">' + ico('mail') + '</button>'
    +   '<button class="icon-btn" title="Star">' + ico('star') + '</button>'
    +   '<button class="icon-btn" title="More">' + ico('dots') + '</button>'
    + '</div>'

    + '<div class="detail-body">'
    +   badge
    +   '<h2 class="detail-subject">' + esc(r.subject) + '</h2>'

    +   '<div class="sender">'
    +     '<div class="avatar">' + esc(initials(r.from)) + '</div>'
    +     '<div class="sender-meta">'
    +       '<div class="sender-name">' + esc(r.from) + '<span>&lt;' + esc(r.email) + '&gt;</span></div>'
    +       '<div class="sender-to">to repairs@repairdesk.com</div>'
    +     '</div>'
    +     '<div class="sender-when">' + esc(received.toLocaleDateString()) + ', ' + esc(formatTime(received)) + '</div>'
    +   '</div>'

    +   '<div class="extracted">'
    +     '<div class="extracted-head">'
    +       '<h3 class="extracted-title">Extracted Details</h3>'
    +       '<button class="link-btn" data-act="toggle-edit">' + (showInput ? 'Done' : 'Edit') + '</button>'
    +     '</div>'
    +     field('user', 'Customer Name', esc(r.from))
    +     field('mail', 'Email', esc(r.email))
    +     field('phone', 'Phone', r.phone ? esc(r.phone) : '<span class="field-missing">Not given</span>')
    +     field('chat', 'Issue', esc(r.issue))
    +     field('pin', 'Location', addressHtml)
    +     field('clock', 'Preferred Time', esc(r.preferredTime || 'Not stated'))
    +     scheduledLine
    +   '</div>'

    +   '<div class="message">' + esc(r.body) + '</div>'
    + '</div>'

    + '<div class="detail-foot">' + foot + '</div>';
}

/* ==========================================================================
   Column 3a — calendar
   ========================================================================== */

function renderCalendar() {
  var head = document.getElementById('cal-head');
  var grid = document.getElementById('cal-grid');
  var rows = slotCount();

  /* ---- header: gutter cell + seven days ---- */
  var todayKey = dayKey(new Date());
  var headHtml = '<div></div>';
  var days = [];

  for (var d = 0; d < 7; d++) {
    var date = addDays(APP.weekStart, d);
    days.push(date);
    headHtml += '<div class="cal-dayhead' + (dayKey(date) === todayKey ? ' is-today' : '') + '">'
      + '<div class="cal-dayname">' + date.toLocaleDateString(undefined, { weekday: 'short' }) + '</div>'
      + '<div class="cal-daynum">' + date.getDate() + '</div>'
      + '</div>';
  }
  head.innerHTML = headHtml;

  /* ---- range label ---- */
  var first = days[0], last = days[6];
  var opts = { month: 'short', day: 'numeric' };
  document.getElementById('cal-range').textContent =
    first.toLocaleDateString(undefined, opts) + ' – ' +
    last.toLocaleDateString(undefined, opts) + ', ' + last.getFullYear();

  /* ---- which cells are already occupied ---- */
  var booked = scheduledRequests();
  var taken = {};
  booked.forEach(function (r) {
    var start = new Date(r.booking.startISO);
    var end = new Date(r.booking.endISO);
    var span = Math.max(1, Math.round((end - start) / 60000 / CONFIG.SLOT_MINUTES));
    var row0 = slotIndex(start);
    for (var i = 0; i < span; i++) taken[dayKey(start) + '|' + (row0 + i)] = true;
  });

  /* ---- time labels down the gutter, one per hour ---- */
  var html = '';
  for (var h = CONFIG.DAY_START_HOUR; h < CONFIG.DAY_END_HOUR; h++) {
    var rowForHour = (h - CONFIG.DAY_START_HOUR) * (60 / CONFIG.SLOT_MINUTES) + 1;
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    html += '<div class="cal-time" style="grid-row:' + rowForHour + '">' + h12 + ' ' + ampm + '</div>';
  }

  /* ---- drop targets: one div per day per 30 minutes ---- */
  for (var dd = 0; dd < 7; dd++) {
    var key = dayKey(days[dd]);
    for (var rr = 0; rr < rows; rr++) {
      var mins = CONFIG.DAY_START_HOUR * 60 + rr * CONFIG.SLOT_MINUTES;
      var time = String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
      var isTaken = taken[key + '|' + rr];
      html += '<div class="slot' + (rr % 2 ? ' is-half' : '') + (isTaken ? ' is-taken' : '') + '"'
        + ' style="grid-column:' + (dd + 2) + ';grid-row:' + (rr + 1) + '"'
        + ' data-day="' + key + '" data-time="' + time + '"></div>';
    }
  }

  /* ---- booked jobs, layered over the slots in the same grid cells ----
   * CSS grid lets items overlap, so there is no absolute-positioning
   * arithmetic here: the event simply spans the rows it occupies. */
  booked.forEach(function (r) {
    var start = new Date(r.booking.startISO);
    var end = new Date(r.booking.endISO);
    var col = days.findIndex(function (d) { return dayKey(d) === dayKey(start); });
    if (col === -1) return;                 // booked outside the visible week

    var row0 = slotIndex(start);
    if (row0 < 0 || row0 >= rows) return;   // booked outside 8am-6pm

    var span = Math.max(1, Math.round((end - start) / 60000 / CONFIG.SLOT_MINUTES));
    span = Math.min(span, rows - row0);

    html += '<div class="event' + (r.id === APP.selectedId ? ' is-selected' : '') + '"'
      + ' data-id="' + esc(r.id) + '"'
      + ' data-urgency="' + esc(r.urgency) + '"'
      + ' data-fresh="' + (r.booking.eventId ? '0' : '1') + '"'
      + ' style="grid-column:' + (col + 2) + ';grid-row:' + (row0 + 1) + ' / span ' + span + '"'
      + ' title="' + esc(r.subject + ' — ' + formatTime(start) + ' to ' + formatTime(end)) + '">'
      + '<div class="event-title">' + esc(r.subject) + '</div>'
      + '<div class="event-where">' + esc(r.area) + '</div>'
      + '</div>';
  });

  grid.innerHTML = html;
  grid.classList.toggle('is-placing', Boolean(APP.pendingDropId));
}

/* ==========================================================================
   Column 3b — location
   ========================================================================== */

function renderMap() {
  var wrap = document.getElementById('map-wrap');
  var foot = document.getElementById('map-foot');
  var label = document.getElementById('loc-address');
  var r = getSelected();

  if (!r || !r.address) {
    label.textContent = r ? 'No address on this request' : 'No job selected';
    wrap.innerHTML = '<div class="map-placeholder">' + ico('pin')
      + '<strong>' + (r ? 'Address missing' : 'Nothing to show') + '</strong>'
      + '<span>' + (r
          ? 'Add an address in Extracted Details and the map will fill in.'
          : 'Select a request to see where the technician is going.') + '</span>'
      + '</div>';
    foot.innerHTML = '';
    return;
  }

  label.textContent = r.address;

  if (MapPanel.hasKey()) {
    wrap.innerHTML = '<iframe title="Map of ' + esc(r.address) + '"'
      + ' loading="lazy" referrerpolicy="no-referrer-when-downgrade"'
      + ' src="' + esc(MapPanel.embedSrc(r.address)) + '"></iframe>';
  } else {
    /* No key yet. Say so plainly rather than rendering an iframe that
     * silently shows Google's grey error tile. */
    wrap.innerHTML = '<div class="map-placeholder">' + ico('pin')
      + '<strong>' + esc(r.area || r.address) + '</strong>'
      + '<span>Add a Maps Embed API key to <code>CONFIG.MAPS_KEY</code> to render the map here.</span>'
      + '<span>The directions button below works without one.</span>'
      + '</div>';
  }

  foot.innerHTML =
    '<span class="map-note">' + ico('car') + '<span>From ' + esc(CONFIG.SHOP_ADDRESS.split(',')[1] || 'the shop').trim() + '</span></span>'
    + '<a class="btn btn-primary" target="_blank" rel="noopener"'
    + ' href="' + esc(MapPanel.directionsUrl(r.address)) + '">'
    + 'Open in Google Maps' + ico('ext') + '</a>';
}

/* ==========================================================================
   Toast + master render
   ========================================================================== */

var toastTimer = null;

function toast(message) {
  var el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
}

function render() {
  renderTopbar();
  renderInbox();
  renderDetail();
  renderCalendar();
  renderMap();
}
