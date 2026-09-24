// Pure helper for zooming react-native-maps to a GeoJSON country feature's
// bounding box — the RN equivalent of web's `L.geoJSON(feature).getBounds()`
// (Leaflet has that built in; react-native-maps has no GeoJSON utility at
// all, so this walks the coordinate arrays by hand).

interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

// Recursively finds every [lng, lat] leaf pair in a Polygon/MultiPolygon
// (or any GeoJSON geometry, in practice — Point/LineString would also work)
// coordinate tree, without needing to special-case each geometry type.
function collectPositions(coords: unknown, out: [number, number][]): void {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    out.push([coords[0] as number, coords[1] as number]);
    return;
  }
  for (const c of coords) collectPositions(c, out);
}

// Returns a react-native-maps Region that frames the whole feature, with
// `paddingFactor` widening the span a little so the outline isn't flush
// against the screen edges (0.15 ≈ Leaflet's own default fitBounds padding).
export function regionForGeometry(geometry: GeoJsonGeometry, paddingFactor = 0.15): Region | null {
  const positions: [number, number][] = [];
  collectPositions(geometry.coordinates, positions);
  if (positions.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lng, lat] of positions) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  const latSpan = Math.max(maxLat - minLat, 0.5);
  const lngSpan = Math.max(maxLng - minLng, 0.5);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latSpan * (1 + paddingFactor),
    longitudeDelta: lngSpan * (1 + paddingFactor),
  };
}
