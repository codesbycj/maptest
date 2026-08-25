
var Parse = (function () {

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

  function parseFrom(value) {
    var match = value.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
    if (match) {
      return { name: match[1].trim() || match[2].split('@')[0], email: match[2].trim() };
    }
    var bare = value.trim();
    return { name: bare.split('@')[0] || 'Unknown sender', email: bare };
  }

  var PHONE_RUN = /\+?\(?\d[\d ().-]{5,}\d/g;
  var PHONE_MIN_DIGITS = 7;
  var PHONE_MAX_DIGITS = 15;          // E.164 ceiling
  var LOOKS_LIKE_DATE = /^\d{1,2}[.-]\d{1,2}[.-]\d{2,4}$/;

  function parsePhone(body) {
    var runs = body.match(PHONE_RUN) || [];

    for (var i = 0; i < runs.length; i++) {
      var raw = runs[i].trim();
      var digits = raw.replace(/\D/g, '').length;
      if (digits < PHONE_MIN_DIGITS || digits > PHONE_MAX_DIGITS) continue;
      if (LOOKS_LIKE_DATE.test(raw)) continue;
      return raw;
    }

    return '';
  }

  /* Area names come from config, so they cannot be trusted to be plain
     words - escape anything the regex engine would read as syntax. */
  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }


  var STREET_RE = new RegExp('\\b('
    + 'street|road|way|close|avenue|crescent|drive|lane|estate|boulevard'
    + '|expressway|court|place|circle|terrace|parkway|highway|trail|plaza'
    + '|square|loop'
    + '|st|rd|ave|blvd|dr|ln|ct|pl|pkwy|hwy|ter|cir|trl|sq'
    + ')\\b', 'i');

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

    var areas = CONFIG.AREAS || [];
    for (i = 0; i < areas.length; i++) {
      var re = new RegExp('\\b' + escapeRe(areas[i]) + '\\b', 'i');
      if (re.test(body)) {
        return { address: normalise(areas[i]), confident: false };
      }
    }

    return { address: '', confident: false };
  }

  function normalise(addr) {
    return addr.replace(/\s+/g, ' ').replace(/[.,;]+$/, '').trim();
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
