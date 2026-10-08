// Self-contained page for the navigation WebView: MapLibre GL JS (vector map,
// so it can tilt and rotate heading-up like Google Maps' driving mode) with
// free OpenFreeMap tiles built from OpenStreetMap — no API key.
//
// Why a WebView instead of a native map: it gives the exact same 3D driving
// view as the web app from one proven code path, and it can be tested in a
// desktop browser. React Native owns everything else (GPS, routing, turn
// logic, banner, voice) and pushes state in via window.__onState(...).
//
// MapLibre is pinned to 5.x because it ships a plain <script> (UMD) build;
// 6.x is ES-module only.
export const NAVIGATION_MAP_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.7.0/dist/maplibre-gl.css" />
<style>
  html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #f6f3ee; }
  .maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left { margin-bottom: 96px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/maplibre-gl@5.7.0/dist/maplibre-gl.js"></script>
<script>
(function () {
  var STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
  var ROUTE_SOURCE = 'nav-route';
  var latest = null;
  var routePath = [];
  var loaded = false;
  var fitted = false;
  var wasDriving = false;
  var resetCamera = false;
  var map, userMarker, destMarker, destKey = '';

  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
  function toLngLat(p) { return [p[1], p[0]]; }
  function line(path) {
    return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path.map(toLngLat) } };
  }
  function userEl() {
    var el = document.createElement('div');
    el.style.cssText = 'width:44px;height:44px;pointer-events:none;';
    el.innerHTML = '<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="20" fill="rgba(37,99,235,0.18)"/><path d="M22 6 L33 34 L22 28 L11 34 Z" fill="#2563eb" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>';
    return el;
  }

  try {
    map = new maplibregl.Map({
      container: 'map',
      style: STYLE_URL,
      center: [80.7718, 7.8731],
      zoom: 8,
      attributionControl: { compact: true }
    });
  } catch (e) {
    post({ type: 'error', message: String(e && e.message || e) });
    return;
  }
  window.__map = map;

  map.on('error', function (e) {
    if (!loaded) post({ type: 'maperror', message: String(e && e.error && e.error.message || '') });
  });

  map.on('load', function () {
    loaded = true;
    map.addSource(ROUTE_SOURCE, { type: 'geojson', data: line([]) });
    map.addLayer({ id: 'nav-route-casing', type: 'line', source: ROUTE_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 11 } });
    map.addLayer({ id: 'nav-route-line', type: 'line', source: ROUTE_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ea580c', 'line-width': 7 } });
    post({ type: 'ready' });
    if (latest) apply(latest);
  });

  function apply(s) {
    if (!loaded) return;

    // Destination pin (re-created only if the destination changed).
    if (s.destination) {
      var key = s.destination.lat + ',' + s.destination.lng;
      if (key !== destKey) {
        if (destMarker) destMarker.remove();
        destMarker = new maplibregl.Marker({ color: '#dc2626' }).setLngLat([s.destination.lng, s.destination.lat]).addTo(map);
        destKey = key;
        fitted = false;
      }
    }

    // Route still to drive.
    var rest = routePath.slice(s.pathIndex || 0);
    if (s.driving && s.position) rest = [[s.position.lat, s.position.lng]].concat(rest);
    var src = map.getSource(ROUTE_SOURCE);
    if (src) src.setData(line(rest));

    // Vehicle marker.
    if (s.position) {
      if (!userMarker) {
        userMarker = new maplibregl.Marker({ element: userEl(), rotationAlignment: 'map' })
          .setLngLat([s.position.lng, s.position.lat]).addTo(map);
      }
      userMarker.setLngLat([s.position.lng, s.position.lat]).setRotation(s.heading == null ? 0 : s.heading);
    }

    if (s.driving && s.position) {
      // Close, tilted, heading-up, vehicle in the lower third.
      map.easeTo({
        center: [s.position.lng, s.position.lat],
        bearing: s.heading == null ? map.getBearing() : s.heading,
        pitch: 60,
        zoom: 17,
        padding: { top: Math.round(window.innerHeight * 0.35), bottom: 0, left: 0, right: 0 },
        duration: 900,
        easing: function (t) { return t; }
      });
      wasDriving = true;
      return;
    }

    if (wasDriving) {
      // Leaving driving mode: level the camera and clear the lower-third padding,
      // then re-frame the route in the same move below (a separate easeTo would
      // just be cancelled by the fit).
      wasDriving = false;
      fitted = false;
      resetCamera = true;
      map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    }

    // Preview: frame the whole route once (or the destination if there is no route yet).
    if (!fitted) {
      var full = routePath;
      if (full.length > 1) {
        var b = new maplibregl.LngLatBounds(toLngLat(full[0]), toLngLat(full[0]));
        full.forEach(function (p) { b.extend(toLngLat(p)); });
        map.fitBounds(b, { padding: 50, duration: 800, pitch: 0, bearing: 0 });
        fitted = true;
        resetCamera = false;
      } else if (s.destination) {
        map.easeTo({ center: [s.destination.lng, s.destination.lat], zoom: 13, pitch: 0, bearing: 0, duration: 600 });
        resetCamera = false;
      }
    }
  }

  // The full route is sent once (and again only after a re-route); per-tick updates
  // then only carry a progress index, not thousands of coordinates.
  window.__setRoute = function (path) {
    routePath = path || [];
    fitted = false;
    if (latest) apply(latest);
  };

  window.__onState = function (s) {
    latest = s;
    try { apply(s); } catch (e) { post({ type: 'error', message: String(e && e.message || e) }); }
  };
})();
</script>
</body>
</html>`;
