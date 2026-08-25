/* Google Maps, the cheap way.
 *
 * The Embed API takes a raw address string, so there is no geocoding
 * step anywhere in this app - no lat/lng, no coordinates in the data
 * model, no Geocoding API bill. Google resolves the address itself.
 *
 * The directions URL needs no key and no quota at all. It is also the
 * part a technician actually taps, so it keeps working even if the
 * embedded map is cut for time. */

var MapPanel = (function () {

  function hasKey() {
    return Boolean(CONFIG.MAPS_KEY);
  }

  /* Maps Embed API - "place" mode. Free, but the key must exist and
   * the Maps Embed API must be enabled on the Cloud project. */
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
