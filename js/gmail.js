var Gmail = (function () {

  var tokenClient = null;
  var gapiReady = false;
  var scriptsLoaded = false;

  var SCRIPT_TIMEOUT_MS = 10000;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var finish = function (err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        err ? reject(err) : resolve();
      };

      var timer = setTimeout(function () {
        finish(new Error('Timed out loading ' + src + ' - the request is being blocked.'));
      }, SCRIPT_TIMEOUT_MS);

      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.defer = true;
      s.onload = function () { finish(); };
      s.onerror = function () { finish(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function init() {
    if (scriptsLoaded) return Promise.resolve();
    if (!CONFIG.CLIENT_ID) {
      return Promise.reject(new Error('CONFIG.CLIENT_ID is empty - see Sprint 5.'));
    }

    return Promise.all([
      loadScript('https://accounts.google.com/gsi/client'),
      loadScript('https://apis.google.com/js/api.js')
    ]).then(function () {
      return new Promise(function (resolve) { gapi.load('client', resolve); });
    }).then(function () {
      return gapi.client.init({
        discoveryDocs: [
          'https://gmail.googleapis.com/$discovery/rest?version=v1',
          'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'
        ]
      });
    }).then(function () {
      gapiReady = true;
      scriptsLoaded = true;
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: function () {}   // replaced per-request in connect()
      });
    });
  }

  function connect() {
    return init().then(function () {
      return new Promise(function (resolve, reject) {
        tokenClient.callback = function (response) {
          if (response.error) {
            APP.connected = false;
            reject(new Error(response.error));
            return;
          }
          APP.connected = true;
          render();
          resolve(response);
        };
        /* Called from the Connect button's click handler - see app.js. */
        tokenClient.requestAccessToken({ prompt: APP.connected ? '' : 'consent' });
      });
    }).catch(function (err) {
      APP.error = err;
      render();
      toast(err.message);
      throw err;
    });
  }

  function loadRequests() {
    if (!gapiReady || !APP.connected) {
      return Promise.reject(new Error('Not connected to Gmail yet.'));
    }

    return gapi.client.gmail.users.messages.list({
      userId: 'me',
      q: CONFIG.GMAIL_QUERY,
      maxResults: 25
    }).then(function (res) {
      var ids = (res.result.messages || []).map(function (m) { return m.id; });
      if (!ids.length) return [];

      return Promise.all(ids.map(function (id) {
        return gapi.client.gmail.users.messages.get({
          userId: 'me',
          id: id,
          format: 'full'
        }).then(function (r) { return r.result; });
      }));
    }).then(function (messages) {
      var requests = messages
        .map(function (m) {
          try {
            return Parse.toRequest(m);
          } catch (err) {
            console.warn('Skipped message ' + m.id + ':', err);
            return null;
          }
        })
        .filter(Boolean);

      if (typeof CalendarApi === 'undefined') return requests;

      return CalendarApi.bookedMessageIds().then(function (booked) {
        requests.forEach(function (r) {
          var hit = booked[r.id];
          if (!hit) return;
          r.status = 'scheduled';
          r.booking = { eventId: hit.eventId, startISO: hit.startISO, endISO: hit.endISO };
        });
        return requests;
      }).catch(function (err) {
        console.warn('Could not read the calendar, showing everything as new:', err);
        return requests;
      });
    });
  }

  return { init: init, connect: connect, loadRequests: loadRequests };
})();
