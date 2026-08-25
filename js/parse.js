/* Turns a raw Gmail message into the RepairRequest shape in js/state.js.
 *
 * The governing rule: never throw, never return a blank card. Real
 * inboxes are messy, and roughly a third of genuine emails will not
 * yield a clean address. Those get needsReview: true and an editable
 * field, which is a recovery path rather than a dead end. */

var Parse = (function () {

  /* Gmail encodes bodies as base64url. The browser has no Buffer, and
   * plain atob() mangles anything non-ASCII, so decode to bytes first
   * and let TextDecoder handle the UTF-8. */
  function decodeB64Url(data) {
    if (!data) return '';
    try {
      var b64 = data.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var bytes = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
      return new TextDecoder('utf-8').decode(bytes);
    } catch (err) {
      console.warn('Could not decode message body:', err);
      return '';
    }
  }

  /* The payload is a tree. text/plain may sit at payload.body.data, or
   * be buried several levels down inside a multipart/alternative. Walk
   * it and take the first text/plain; fall back to text/html stripped. */
  function findBody(payload) {
    if (!payload) return '';

    if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
      return decodeB64Url(payload.body.data);
    }

    if (payload.parts) {
      for (var i = 0; i < payload.parts.length; i++) {
        var found = findBody(payload.parts[i]);
        if (found) return found;
      }
    }

    if (payload.mimeType === 'text/html' && payload.body && payload.body.data) {
      return stripHtml(decodeB64Url(payload.body.data));
    }

    if (payload.body && payload.body.data && !payload.parts) {
      return decodeB64Url(payload.body.data);
    }

    return '';
  }

  function stripHtml(html) {
    var div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }

  function header(headers, name) {
    var found = (headers || []).find(function (h) {
      return h.name.toLowerCase() === name.toLowerCase();
    });
    return found ? found.value : '';
  }

  /* 'John Doe <john@x.com>' -> { name, email } */
  function parseFrom(value) {
    var match = value.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
    if (match) {
      return { name: match[1].trim() || match[2].split('@')[0], email: match[2].trim() };
    }
    var bare = value.trim();
    return { name: bare.split('@')[0] || 'Unknown sender', email: bare };
  }

  var PHONE_RE = /(?:\+234|0)[789]\d{1}[\s-]?\d{3}[\s-]?\d{4}/;

  function parsePhone(body) {
    var m = body.match(PHONE_RE);
    return m ? m[0].trim() : '';
  }

  /* Two passes, most reliable first:
   *   1. an explicit "Address:" / "Location:" line
   *   2. any line carrying a Nigerian street suffix
   * Anything else is a miss, and a miss is flagged, not invented. */
  var STREET_RE = /\b(street|road|way|close|avenue|crescent|drive|lane|estate|boulevard|expressway)\b/i;
  var AREAS = [
    'Lekki', 'Ikeja', 'Yaba', 'Surulere', 'Victoria Island', 'Ikoyi', 'Ajah',
    'Gbagada', 'Maryland', 'Apapa', 'Festac', 'Magodo', 'Ogba', 'Oshodi', 'Ketu'
  ];

  function parseAddress(body) {
    var lines = body.split(/\r?\n/);
    var i, line, value;

    for (i = 0; i < lines.length; i++) {
      line = lines[i].trim();
      var labelled = line.match(/^(?:address|location|addr)\s*[:\-]\s*(.+)$/i);
      if (labelled && labelled[1].trim().length > 5) {
        return { address: normalise(labelled[1].trim()), confident: true };
      }
    }

    for (i = 0; i < lines.length; i++) {
      line = lines[i].trim();
      if (line.length > 8 && line.length < 140 && STREET_RE.test(line)) {
        /* Skip lines that are clearly prose about the problem. */
        if (/\b(please|thank|regards|hello|hi\b|my |the fault)/i.test(line)) continue;
        return { address: normalise(line), confident: true };
      }
    }

    /* Last resort: a recognisable Lagos area mentioned anywhere. Enough
     * to drop a pin on, not enough to trust - flag it for a human. */
    for (i = 0; i < AREAS.length; i++) {
      var re = new RegExp('\\b' + AREAS[i] + '\\b', 'i');
      if (re.test(body)) {
        return { address: normalise(AREAS[i]), confident: false };
      }
    }

    return { address: '', confident: false };
  }

  function normalise(addr) {
    var out = addr.replace(/\s+/g, ' ').replace(/[.,;]+$/, '').trim();
    if (!/lagos/i.test(out)) out += ', Lagos';
    if (!/nigeria/i.test(out)) out += ', Nigeria';
    return out;
  }

  /* Short label for the inbox card - first two comma-separated parts. */
  function areaOf(address) {
    if (!address) return 'Address missing';
    var parts = address.split(',').map(function (p) { return p.trim(); });
    if (parts.length <= 2) return parts.join(', ');
    return parts.slice(-3, -1).join(', ');
  }

  var URGENT_RE = /\b(urgent|emergency|asap|immediately|as soon as possible|leaking|flooding|sparking|smoke|burning|today)\b/i;

  function parseUrgency(subject, body) {
    return URGENT_RE.test(subject + ' ' + body) ? 'urgent' : 'normal';
  }

  /* Rough job length by appliance, so dropped cards get a sensible
   * block height instead of every job being one hour. */
  var DURATIONS = [
    [/instal/i, 180],
    [/generator|compressor/i, 120],
    [/fridge|refrigerat|freezer/i, 90],
    [/air ?con|\bac\b|hvac/i, 90],
    [/washing machine|washer|dryer/i, 60],
    [/dishwasher|microwave|heater|\btv\b|television/i, 60]
  ];

  function parseDuration(subject, body) {
    var text = subject + ' ' + body;
    for (var i = 0; i < DURATIONS.length; i++) {
      if (DURATIONS[i][0].test(text)) return DURATIONS[i][1];
    }
    return 60;
  }

  /* First non-empty, non-greeting line makes a decent one-line summary. */
  function parseIssue(subject, body) {
    var lines = body.split(/\r?\n/).map(function (l) { return l.trim(); });
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (!l) continue;
      if (/^(hi|hello|good (morning|afternoon|evening)|dear)\b/i.test(l)) continue;
      if (/^(address|location|phone|tel)\s*[:\-]/i.test(l)) continue;
      if (l.length < 12) continue;
      return l.length > 90 ? l.slice(0, 87) + '...' : l;
    }
    return subject;
  }

  var TIME_RE = /\b(tomorrow|today|this (?:morning|afternoon|evening|week)|next week|weekends?|weekdays?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mornings?|afternoons?|as soon as possible|asap)\b/i;

  function parsePreferredTime(body) {
    var m = body.match(TIME_RE);
    if (!m) return 'Not stated';
    return m[0].charAt(0).toUpperCase() + m[0].slice(1);
  }

  /* The whole thing. Takes the raw object from users.messages.get. */
  function toRequest(message) {
    var payload = message.payload || {};
    var headers = payload.headers || [];

    var body = findBody(payload) || message.snippet || '';
    var subject = header(headers, 'Subject') || '(no subject)';
    var sender = parseFrom(header(headers, 'From'));
    var found = parseAddress(body);

    return {
      id: message.id,
      from: sender.name,
      email: sender.email,
      phone: parsePhone(body),
      subject: subject,
      issue: parseIssue(subject, body),
      body: body.trim(),
      address: found.address,
      area: areaOf(found.address),
      receivedAt: new Date(Number(message.internalDate) || Date.now()).toISOString(),
      preferredTime: parsePreferredTime(body),
      urgency: parseUrgency(subject, body),
      durationMins: parseDuration(subject, body),
      needsReview: !found.confident,
      status: (message.labelIds || []).indexOf('UNREAD') !== -1 ? 'new' : 'read',
      booking: null
    };
  }

  return {
    toRequest: toRequest,
    findBody: findBody,
    decodeB64Url: decodeB64Url,
    parseAddress: parseAddress
  };
})();
