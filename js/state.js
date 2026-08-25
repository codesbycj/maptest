

var APP = {
  requests: [],        // RepairRequest[]
  selectedId: null,    // which request the detail panel is showing
  weekStart: null,     // Monday of the visible week (Date)
  connected: false,    // has the user authorised Google yet
  pendingDropId: null, // click-to-place fallback: card waiting for a slot
  filterUrgent: false, // the funnel button in the inbox header
  editingAddress: false, // detail panel: address field shown as an input
  loading: false,
  error: null
};

/* ---------- lookups ---------- */

function getRequest(id) {
  return APP.requests.find(function (r) { return r.id === id; }) || null;
}

function getSelected() {
  return getRequest(APP.selectedId);
}

function inboxRequests() {
  return APP.requests.filter(function (r) { return r.status !== 'scheduled'; });
}

function scheduledRequests() {
  return APP.requests.filter(function (r) { return r.status === 'scheduled' && r.booking; });
}

function startOfWeek(date) {
  var d = new Date(date);
  d.setHours(0, 0, 0, 0);
  var start = CONFIG.WEEK_START_DAY;
  d.setDate(d.getDate() - ((d.getDay() - start + 7) % 7));
  return d;
}

function addDays(date, n) {
  var d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/* 'YYYY-MM-DD' - the key the calendar slots carry in data-day. */
function dayKey(date) {
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

/* 'YYYY-MM-DDTHH:MM:SS' with no Z and no offset. This is the format the
 * Calendar API wants alongside an explicit timeZone field. */
function toLocalISO(date) {
  var pad = function (n) { return String(n).padStart(2, '0'); };
  return dayKey(date) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':00';
}

function parseSlot(dayStr, timeStr) {
  var p = dayStr.split('-').map(Number);
  var t = timeStr.split(':').map(Number);
  return new Date(p[0], p[1] - 1, p[2], t[0], t[1], 0, 0);
}

function formatTime(date) {
  var h = date.getHours();
  var m = date.getMinutes();
  var ampm = h >= 12 ? 'PM' : 'AM';
  var h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ':' + String(m).padStart(2, '0') + ' ' + ampm;
}

function relativeTime(iso) {
  var then = new Date(iso);
  var mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return mins + 'm ago';
  var hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  var days = Math.round(hrs / 24);
  if (days < 7) return days + 'd ago';
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function slotCount() {
  return (CONFIG.DAY_END_HOUR - CONFIG.DAY_START_HOUR) * (60 / CONFIG.SLOT_MINUTES);
}

function slotIndex(date) {
  var mins = (date.getHours() - CONFIG.DAY_START_HOUR) * 60 + date.getMinutes();
  return Math.floor(mins / CONFIG.SLOT_MINUTES);
}
