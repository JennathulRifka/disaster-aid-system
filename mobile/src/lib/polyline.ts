/**
 * Decodes a Google encoded-polyline string (the format Routes API returns in
 * `routes.polyline.encodedPolyline`) into an array of {latitude, longitude}
 * points react-native-maps' <Polyline> can render directly.
 *
 * Web's VolunteerNavigation.tsx gets this for free from
 * `google.maps.geometry.encoding.decodePath()`, part of the Google Maps
 * JavaScript SDK it already loads — react-native-maps has no equivalent
 * helper (it never loads that SDK, only the native map view), so this is a
 * plain reimplementation of Google's own documented algorithm
 * (https://developers.google.com/maps/documentation/utilities/polylinealgorithm),
 * not a new dependency.
 */
export function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}
