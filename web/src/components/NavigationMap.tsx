import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre v6 ships its tile-decoding worker as a separate module; Vite has to
// be told to bundle it, otherwise the map shows blank with "Worker failed to load".
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { LatLng } from "@/lib/navigation";

maplibregl.setWorkerUrl(workerUrl);

// OpenFreeMap: free vector tiles built from OpenStreetMap, no API key. Vector
// tiles are what make rotation, tilt and 3D buildings possible (Leaflet's
// raster tiles can't do either).
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const ROUTE_SOURCE = "nav-route";

const toLngLat = (p: [number, number]): [number, number] => [p[1], p[0]];

interface Props {
  /** Route still to be driven (already trimmed behind the vehicle). */
  remainingPath: [number, number][];
  /** Full route, used to frame the preview. */
  fullPath: [number, number][] | null;
  position: LatLng | null;
  /** Direction of travel in degrees (0 = north), or null if unknown. */
  heading: number | null;
  destination: LatLng;
  /** Driving mode: tilted, heading-up, camera glides along behind the vehicle. */
  driving: boolean;
  onError?: () => void;
}

function userMarkerElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = "width:44px;height:44px;pointer-events:none;";
  el.innerHTML = `
    <svg viewBox="0 0 44 44" width="44" height="44">
      <circle cx="22" cy="22" r="20" fill="rgba(37,99,235,0.18)"/>
      <path d="M22 6 L33 34 L22 28 L11 34 Z" fill="#2563eb" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>
    </svg>`;
  return el;
}

export function NavigationMap({ remainingPath, fullPath, position, heading, destination, driving, onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const loadedRef = useRef(false);
  const fittedRef = useRef(false);
  const latest = useRef({ remainingPath, driving });
  latest.current = { remainingPath, driving };

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE_URL,
        center: [destination.lng, destination.lat],
        zoom: 13,
        attributionControl: { compact: true },
      });
    } catch {
      onError?.();
      return;
    }
    mapRef.current = map;
    map.on("error", (e) => {
      if (!loadedRef.current) console.warn("Map error", e.error?.message);
    });

    map.on("load", () => {
      loadedRef.current = true;
      map.addSource(ROUTE_SOURCE, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: latest.current.remainingPath.map(toLngLat) },
        },
      });
      map.addLayer({
        id: "nav-route-casing",
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 11 },
      });
      map.addLayer({
        id: "nav-route-line",
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ea580c", "line-width": 7 },
      });
    });

    new maplibregl.Marker({ color: "#dc2626" }).setLngLat([destination.lng, destination.lat]).addTo(map);

    return () => {
      loadedRef.current = false;
      fittedRef.current = false;
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // The map is created once per destination; everything else is driven by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination.lat, destination.lng]);

  // Keep the drawn route in sync.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
    source?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: remainingPath.map(toLngLat) },
    });
  });

  // Vehicle marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;
    if (!userMarkerRef.current) {
      userMarkerRef.current = new maplibregl.Marker({ element: userMarkerElement(), rotationAlignment: "map" })
        .setLngLat([position.lng, position.lat])
        .addTo(map);
    }
    userMarkerRef.current.setLngLat([position.lng, position.lat]).setRotation(heading ?? 0);
  }, [position, heading]);

  // Preview: frame the whole route once it arrives.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || driving || !fullPath || fullPath.length < 2 || fittedRef.current) return;
    const bounds = fullPath.reduce(
      (b, p) => b.extend(toLngLat(p)),
      new maplibregl.LngLatBounds(toLngLat(fullPath[0]), toLngLat(fullPath[0]))
    );
    map.fitBounds(bounds, { padding: 50, duration: 800 });
    fittedRef.current = true;
  }, [fullPath, driving]);

  // Driving camera: close, tilted, heading-up, vehicle in the lower third.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !driving || !position) return;
    map.easeTo({
      center: [position.lng, position.lat],
      bearing: heading ?? map.getBearing(),
      pitch: 60,
      zoom: 17,
      padding: { top: Math.round(map.getContainer().clientHeight * 0.35), bottom: 0, left: 0, right: 0 },
      duration: 900,
      easing: (t) => t,
    });
  }, [position, heading, driving]);

  // Leaving driving mode: level the camera again; the container also changes size.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.resize();
    if (!driving) {
      map.easeTo({ pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 600 });
      fittedRef.current = false;
    }
  }, [driving]);

  return <div ref={containerRef} className="h-full w-full" />;
}
