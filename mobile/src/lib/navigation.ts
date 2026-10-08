// Mirror of web/src/lib/navigation.ts (separate projects, no shared build) — keep the two in sync.
// Free turn-by-turn navigation helpers: OSRM routing (OpenStreetMap data, no
// API key) plus the small geometry needed for live tracking and re-routing.
// The public OSRM server is a demo service with fair-use limits — fine for
// this project; for heavy use, self-host OSRM or swap OSRM_BASE for another
// OSRM-compatible endpoint.
export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteStep {
  distance: number;
  type: string;
  modifier?: string;
  name: string;
  location: LatLng;
}

export interface OsrmRoute {
  path: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
  /** For each step, the index of the route vertex where its maneuver happens. */
  stepPathIndex: number[];
}

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

export async function fetchOsrmRoute(origin: LatLng, destination: LatLng): Promise<OsrmRoute> {
  const url =
    `${OSRM_BASE}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
    `?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url);
  const data = await res.json();
  const route = data.routes?.[0];
  if (!res.ok || data.code !== "Ok" || !route) {
    throw new Error(data.message || "No route found");
  }

  const path: [number, number][] = route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
  const steps: RouteStep[] = route.legs.flatMap((leg: any) =>
    leg.steps.map((s: any) => ({
      distance: s.distance,
      type: s.maneuver.type,
      modifier: s.maneuver.modifier,
      name: s.name || "",
      location: { lat: s.maneuver.location[1], lng: s.maneuver.location[0] },
    }))
  );
  // Maneuvers occur in route order, so each search starts where the last one ended.
  let from = 0;
  const stepPathIndex = steps.map((s) => {
    from = nearestPathIndex(s.location, path, from, path.length);
    return from;
  });
  return { path, distanceMeters: route.distance, durationSeconds: route.duration, steps, stepPathIndex };
}

const EARTH_RADIUS_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Shortest distance (meters) from a point to a polyline, via a local flat projection (accurate at route scale). */
export function distanceToPathMeters(point: LatLng, path: [number, number][]): number {
  if (path.length === 0) return Infinity;
  const cosLat = Math.cos(toRad(point.lat));
  const project = (lat: number, lng: number) => ({
    x: toRad(lng - point.lng) * cosLat * EARTH_RADIUS_M,
    y: toRad(lat - point.lat) * EARTH_RADIUS_M,
  });

  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = project(path[i][0], path[i][1]);
    const b = project(path[i + 1][0], path[i + 1][1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lenSq));
    best = Math.min(best, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  if (path.length === 1) {
    const p = project(path[0][0], path[0][1]);
    best = Math.hypot(p.x, p.y);
  }
  return best;
}

/** Compass bearing in degrees (0 = north, clockwise) from a to b. */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Index of the route vertex closest to the point, searching only forward from
 * `from` (within `window` vertices) so progress never jumps backwards on
 * routes that pass near themselves.
 */
export function nearestPathIndex(point: LatLng, path: [number, number][], from = 0, window = 400): number {
  let best = from;
  let bestDist = Infinity;
  const end = Math.min(path.length, from + window);
  for (let i = from; i < end; i++) {
    const d = haversineMeters(point, { lat: path[i][0], lng: path[i][1] });
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** Length in meters of the path from vertex `fromIndex` to the end. */
export function remainingPathMeters(path: [number, number][], fromIndex: number): number {
  let total = 0;
  for (let i = Math.max(0, fromIndex); i < path.length - 1; i++) {
    total += haversineMeters({ lat: path[i][0], lng: path[i][1] }, { lat: path[i + 1][0], lng: path[i + 1][1] });
  }
  return total;
}

/**
 * Advances past every maneuver the vehicle has already driven through, judged
 * by progress along the route rather than a proximity radius — at speed, GPS
 * fixes can land more than a radius apart and skip right over a turn. Never
 * moves backwards and never past the final (arrive) step.
 */
export function advanceStep(pathIndex: number, stepPathIndex: number[], current: number): number {
  let i = current;
  while (i < stepPathIndex.length - 1 && pathIndex >= stepPathIndex[i]) i++;
  return i;
}
