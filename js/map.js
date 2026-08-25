
var MapPanel = (function () {

  function hasKey() {
    return Boolean(CONFIG.MAPS_KEY);
  }

  function embedSrc(address) {
    return 'https://www.google.com/maps/embed/v1/place'
      + '?key=' + encodeURIComponent(CONFIG.MAPS_KEY)
      + '&q=' + encodeURIComponent(address)
      + '&zoom=15';
  }

  /* Plain URL. No key, no SDK, no billing. Opens the real Maps app on
   * a phone with the route already loaded. */
  function directionsUrl(address) {
    return 'https://www.google.com/maps/dir/?api=1'
      + '&origin=' + encodeURIComponent(CONFIG.SHOP_ADDRESS)
      + '&destination=' + encodeURIComponent(address)
      + '&travelmode=driving';
  }

  /* Same, but just showing the pin rather than routing to it. */
  function searchUrl(address) {
    return 'https://www.google.com/maps/search/?api=1&query='
      + encodeURIComponent(address);
  }

  return {
    hasKey: hasKey,
    embedSrc: embedSrc,
    directionsUrl: directionsUrl,
    searchUrl: searchUrl
  };
})();
