// Mirrors server/src/utils/districts.js — nearest-centroid matching, not
// real polygon boundaries, same tradeoff as the backend version. Kept as a
// separate client-side copy (rather than a shared package) since it's a
// small, static, pure lookup — used here so AdminRequests.tsx can filter by
// district without a round trip, the same way the backend uses it for the
// public severity map's district aggregation.

interface District {
  name: string;
  lat: number;
  lng: number;
}

export const DISTRICTS: District[] = [
  { name: "Colombo", lat: 6.9271, lng: 79.8612 },
  { name: "Gampaha", lat: 7.0917, lng: 79.9997 },
  { name: "Kalutara", lat: 6.5854, lng: 79.9607 },
  { name: "Kandy", lat: 7.2906, lng: 80.6337 },
  { name: "Matale", lat: 7.4675, lng: 80.6234 },
  { name: "Nuwara Eliya", lat: 6.9497, lng: 80.7891 },
  { name: "Galle", lat: 6.0535, lng: 80.221 },
  { name: "Matara", lat: 5.9549, lng: 80.555 },
  { name: "Hambantota", lat: 6.1241, lng: 81.1185 },
  { name: "Jaffna", lat: 9.6615, lng: 80.0255 },
  { name: "Kilinochchi", lat: 9.3803, lng: 80.377 },
  { name: "Mannar", lat: 8.981, lng: 79.9044 },
  { name: "Vavuniya", lat: 8.7514, lng: 80.4971 },
  { name: "Mullaitivu", lat: 9.2671, lng: 80.8142 },
  { name: "Batticaloa", lat: 7.717, lng: 81.7 },
  { name: "Ampara", lat: 7.2975, lng: 81.6747 },
  { name: "Trincomalee", lat: 8.5874, lng: 81.2152 },
  { name: "Kurunegala", lat: 7.4863, lng: 80.3647 },
  { name: "Puttalam", lat: 8.0362, lng: 79.8283 },
  { name: "Anuradhapura", lat: 8.3114, lng: 80.4037 },
  { name: "Polonnaruwa", lat: 7.9403, lng: 81.0188 },
  { name: "Badulla", lat: 6.9934, lng: 81.055 },
  { name: "Monaragala", lat: 6.8714, lng: 81.3507 },
  { name: "Ratnapura", lat: 6.6828, lng: 80.3992 },
  { name: "Kegalle", lat: 7.2513, lng: 80.3464 },
];

// NBRO's own designated landslide-prone districts (Landslide Hazard Zonation
// Mapping programme) — static, not a live feed. Confirmed by tracing NBRO's
// public ArcGIS "Landslide Risk Information Portal" the same way this
// project traced the Irrigation Department's dashboards: no live
// district-level risk API exists (current warnings are only ever published
// as narrative web/Telegram/Facebook posts, same PDF-only dead end as DMC's
// situation reports), and the one genuinely public ArcGIS layer found there
// turned out to be a household-level post-landslide resettlement registry —
// stale (dated 2020) and inappropriate to publish (family sizes, tax
// numbers, individual building footprints). This static 10-district list is
// the honest alternative: a fixed reference layer, not a "risk right now"
// indicator, labeled as such wherever it's shown.
export const LANDSLIDE_PRONE_DISTRICTS = [
  "Kalutara",
  "Galle",
  "Hambantota",
  "Nuwara Eliya",
  "Matale",
  "Kandy",
  "Kegalle",
  "Ratnapura",
  "Matara",
  "Badulla",
];

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Returns the nearest district's name for a {lat, lng} location. */
export function nearestDistrict(location: { lat: number; lng: number } | null | undefined) {
  if (!location) return null;
  let closest = DISTRICTS[0];
  let closestDistance = Infinity;
  for (const district of DISTRICTS) {
    const d = distanceKm(location, { lat: district.lat, lng: district.lng });
    if (d < closestDistance) {
      closestDistance = d;
      closest = district;
    }
  }
  return closest.name;
}
