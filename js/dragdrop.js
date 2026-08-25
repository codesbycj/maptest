/* Native HTML5 drag and drop. No library - one would cost an hour and
 * buy nothing this app needs.
 *
 * Every handler is delegated from a container that render() never
 * replaces, because render() throws away all the cards and slots on
 * each pass. Bind to #inbox-list and #cal-grid, never to a .req-card. */

var DragDrop = (function () {

  var dragId = null;

  function init() {
    var inbox = document.getElementById('inbox-list');
    var grid = document.getElementById('cal-grid');

    /* ---------- source: the request cards ---------- */

    inbox.addEventListener('dragstart', function (e) {
      var card = e.target.closest('.req-card');
      if (!card) return;

      dragId = card.dataset.id;
      e.dataTransfer.setData('text/plain', dragId);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('is-dragging');

      /* Light every free slot up while a drag is in flight. */
      grid.classList.add('is-placing');
    });

    inbox.addEventListener('dragend', function (e) {
      var card = e.target.closest('.req-card');
      if (card) card.classList.remove('is-dragging');
      dragId = null;
      if (!APP.pendingDropId) grid.classList.remove('is-placing');
      clearHover();
    });

    /* ---------- target: the calendar slots ---------- */

    /* preventDefault() here is the one everyone forgets. Without it the
     * browser treats the slot as an invalid target, drop never fires,
     * and the card silently snaps back with no error anywhere. */
    grid.addEventListener('dragover', function (e) {
      var slot = e.target.closest('.slot');
      if (!slot) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    grid.addEventListener('dragenter', function (e) {
      var slot = e.target.closest('.slot');
      if (!slot) return;
      clearHover();
      slot.classList.add('is-over');
    });

    grid.addEventListener('dragleave', function (e) {
      var slot = e.target.closest('.slot');
      if (slot) slot.classList.remove('is-over');
    });

    grid.addEventListener('drop', function (e) {
      var slot = e.target.closest('.slot');
      if (!slot) return;
      e.preventDefault();
      clearHover();

      var id = e.dataTransfer.getData('text/plain') || dragId;
      if (id) Bookings.schedule(id, slot.dataset.day, slot.dataset.time);
    });

    /* ---------- fallback: click a card, then click a slot ----------
     * Ten minutes of work, and it saves the demo if dragging misbehaves
     * on someone else's trackpad in front of a reviewer. */
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

  function clearHover() {
    var hot = document.querySelectorAll('.slot.is-over');
    for (var i = 0; i < hot.length; i++) hot[i].classList.remove('is-over');
  }

  return { init: init };
})();
