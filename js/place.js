var Place = (function () {

  function init() {
    var grid = document.getElementById('cal-grid');

    grid.addEventListener('click', function (e) {
      var slot = e.target.closest('.slot');
      if (slot && APP.pendingDropId) {
        var id = APP.pendingDropId;
        APP.pendingDropId = null;
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
