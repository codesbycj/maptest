/* Putting a request onto the calendar.
 *
 * Two taps: press Schedule Repair in the detail panel, which arms
 * APP.pendingDropId and lights up the free slots, then pick a slot. This
 * is the only booking gesture - it behaves identically with a mouse and
 * on a touch screen.
 *
 * Handlers are delegated from #cal-grid, which render() never replaces,
 * because it throws away every slot inside it on each pass. Bind to the
 * container, never to a .slot. */

var Place = (function () {

  function init() {
    var grid = document.getElementById('cal-grid');

    grid.addEventListener('click', function (e) {
      var slot = e.target.closest('.slot');
      if (slot && APP.pendingDropId) {
        var id = APP.pendingDropId;
        APP.pendingDropId = null;
        /* data-day and data-time are the whole contract between the grid
         * and the booking logic - see renderCalendar(). */
        Bookings.schedule(id, slot.dataset.day, slot.dataset.time);
        return;
      }

      /* Clicking a booked job selects it, so the map follows. */
      var event = e.target.closest('.event');
      if (event) {
        APP.selectedId = event.dataset.id;
        APP.editingAddress = false;
        render();
      }
    });
  }

  return { init: init };
})();
