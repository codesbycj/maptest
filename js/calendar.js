

var CalendarApi = (function () {

  function ready() {
    return typeof gapi !== 'undefined'
      && gapi.client
      && gapi.client.calendar
      && APP.connected;
  }

  function createEvent(r) {
    if (!ready()) return Promise.resolve(null);

    return gapi.client.calendar.events.insert({
      calendarId: 'primary',
      sendUpdates: 'all',            // email the customer an invite
      resource: {
        summary: 'Repair — ' + r.from,
        description: r.issue + '\n\nFrom Gmail message ' + r.id,
        location: r.address,
        start: { dateTime: r.booking.startISO, timeZone: CONFIG.TIMEZONE },
        end:   { dateTime: r.booking.endISO,   timeZone: CONFIG.TIMEZONE },
        attendees: r.email ? [{ email: r.email }] : [],
        extendedProperties: {
          private: {
            gmailMessageId: r.id,
            status: 'scheduled'
          }
        }
      }
    }).then(function (res) {
      return res.result.id;
    });
  }

  function deleteEvent(eventId) {
    if (!ready() || !eventId) return Promise.resolve();
    return gapi.client.calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId
    });
  }

  function bookedMessageIds() {
    if (!ready()) return Promise.resolve({});

    var from = addDays(APP.weekStart || startOfWeek(new Date()), -28);
    var to = addDays(APP.weekStart || startOfWeek(new Date()), 56);

    return gapi.client.calendar.events.list({
      calendarId: 'primary',
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: true,
      maxResults: 250,
      privateExtendedProperty: 'status=scheduled'
    }).then(function (res) {
      var out = {};
      (res.result.items || []).forEach(function (ev) {
        var props = (ev.extendedProperties && ev.extendedProperties.private) || {};
        var msgId = props.gmailMessageId;
        if (!msgId) return;
        out[msgId] = {
          eventId: ev.id,
          startISO: (ev.start && (ev.start.dateTime || ev.start.date)) || null,
          endISO: (ev.end && (ev.end.dateTime || ev.end.date)) || null
        };
      });
      return out;
    });
  }

  return {
    createEvent: createEvent,
    deleteEvent: deleteEvent,
    bookedMessageIds: bookedMessageIds
  };
})();
