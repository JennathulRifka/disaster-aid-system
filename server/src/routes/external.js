const express = require("express");
const { XMLParser } = require("fast-xml-parser");
const AdmZip = require("adm-zip");
const simplify = require("@turf/simplify").default;
const Papa = require("papaparse");
const { getCached } = require("../utils/cache");
const { DISTRICTS, nearestDistrict } = require("../utils/districts");

const router = express.Router();

const DMC_ALERTS_RSS_URL =
  "https://www.dmc.gov.lk/index.php?option=com_content&view=category&layout=blog&id=16&Itemid=237&format=feed&type=rss&lang=en";

// The Irrigation Department's own ArcGIS Online feature service — the real
// data source behind their "Realtime Water Level in Major River" dashboard
// (irrigation.gov.lk embeds it via an ArcGIS Dashboards iframe/link; the
// plain HTML page itself blocks automated requests, but this REST endpoint
// underneath it doesn't). Confirmed official, not scraped: traced directly
// from the dashboard's own web map definition, and its "Alert Level"/"Minor
// Flood"/"Major Flood" layers read the exact alertpull/minorpull/majorpull
// fields queried below. Previously this route used an unofficial community
// proxy (slwaterlevel.mevinu.online) — replaced after that proxy silently
// changed domains and then went down entirely; its response shape happened
// to match ArcGIS's raw {attributes, geometry} query format exactly, which
// in hindsight strongly suggests it was itself just a thin wrapper around
// this same official service.
//
// The raw table is a time-series log (6,400+ rows and growing, one row per
// reading), not one row per station — ordering by EditDate DESC and taking
// the first 1000 most-recent rows reliably covers a fresh reading for every
// active station (confirmed: 40 distinct gauges in the top 1000, matching
// the ~41 stations this feature has always reported). Deduping to the
// latest-per-gauge happens in JS below, same "avoid a fancier query,
// just sort/dedupe in JS" convention already used elsewhere in this file.
const RIVER_GAUGE_FEATURE_SERVER_URL =
  "https://services3.arcgis.com/J7ZFXmR8rSmQ3FGf/arcgis/rest/services/gauges_2_view/FeatureServer/0/query";

// GDACS (Global Disaster Alert and Coordination System, EC Joint Research
// Centre) — tropical cyclone tracking + general disaster events worldwide.
// The GeoJSON REST API the project originally targeted
// (gdacsapi/api/Events/geteventlist/SEARCH) was tested repeatedly and
// consistently failed with either a connection timeout or GDACS's own
// backend error ("Timeout expired... obtaining a connection from the
// pool... max pool size was reached") — a server-side issue on their end,
// not a request-shape problem. Their RSS feed is GDACS's own official feed
// and was reliably reachable, so it's used instead — same pattern as the
// DMC integration using RSS over their PDF-only situation reports.
const GDACS_RSS_URL = "https://www.gdacs.org/xml/rss.xml";

// HDX's official COD-AB (Common Operational Dataset — Administrative
// Boundaries) for Sri Lanka, Survey-Department-sourced and OCHA-vetted.
// The "live ArcGIS geoservice" originally targeted for this
// (codgis.itos.uga.edu / gistmaps.itos.uga.edu) is genuinely dead — confirmed
// NXDOMAIN via both Google (8.8.8.8) and Cloudflare (1.1.1.1) public DNS, not
// a local network fluke, and ITOS itself has been folded into UGA's Carl
// Vinson Institute of Government (their old site 301-redirects there). This
// URL is HDX's own S3-backed file CDN instead — reachable, confirmed by
// downloading it directly. It's a ~130MB zip covering admin levels 0-4; only
// the admin-2 (25 district) GeoJSON is extracted and used here.
const HDX_LKA_BOUNDARIES_ZIP_URL =
  "https://data.humdata.org/dataset/0bedcaf3-88cd-4591-b9d5-5d3220e26abf/resource/ac173fa4-dd42-4be4-aaed-a2e445525865/download/lka_admin_boundaries.geojson.zip";

// USGS's public earthquake catalog (no API key required) — confirmed working
// by direct query, not guessed. This is deliberately NOT scoped to Sri Lanka
// itself: Sri Lanka sits on stable continental crust and barely registers
// seismic activity. It's scoped to the wider Indian Ocean / Bay of Bengal /
// Sumatra subduction zone instead — a real query against this bounding box
// surfaced genuine recent earthquakes within ~60km of Meulaboh, essentially
// the epicenter region of the 2004 Indian Ocean tsunami. That's the actual
// hazard this feed is useful for: a regional tsunami-risk indicator tied to
// the same subduction zone that produced the 2004 disaster, not a "Sri Lanka
// earthquakes" feed (framed that way in the UI too, or it reads as broken —
// most days there's nothing inside Sri Lanka's own borders, correctly).
const USGS_EARTHQUAKE_API_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const USGS_REGIONAL_BBOX = { minLat: -10, maxLat: 20, minLng: 70, maxLng: 100 };
// A tight box around Sri Lanka itself and its immediate waters — the default
// scope, same "usually empty, that's the real state" framing already used
// for GDACS's sri-lanka-scoped default. Same ?scope=global-style pattern:
// this default can look empty most days; the "show all regional events"
// toggle switches to USGS_REGIONAL_BBOX above, which is reliably populated.
const USGS_SRI_LANKA_BBOX = { minLat: 5.5, maxLat: 10, minLng: 79, maxLng: 82.5 };
const USGS_MIN_MAGNITUDE = 4.0;
const USGS_LOOKBACK_DAYS = 30;

// OpenWeatherMap's Current Weather API (data/2.5/weather) — confirmed
// reachable by direct query (returns a real, documented 401 "Invalid API
// key" response without one, not a connection failure or a dead host).
// Free tier needs no credit card and allows far more calls/day than this
// app's cache-then-serve pattern will ever use. Queried per-city rather
// than a single national point — weather genuinely varies across Sri
// Lanka's coastal/hill-country/dry-zone regions, and this project already
// treats district-level granularity as the meaningful unit everywhere else
// (severity map, active-district declarations, water-level alerts).
const OPENWEATHER_API_URL = "https://api.openweathermap.org/data/2.5/weather";
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

// One representative city per major region — coastal south/east/north,
// hill country, dry zone, and the historically flood-prone Ratnapura
// basin — rather than all 25 districts, to keep this a compact "weather
// card," not a second severity map.
const WEATHER_CITIES = [
  { city: "Colombo", district: "Colombo" },
  { city: "Kandy", district: "Kandy" },
  { city: "Galle", district: "Galle" },
  { city: "Jaffna", district: "Jaffna" },
  { city: "Trincomalee", district: "Trincomalee" },
  { city: "Anuradhapura", district: "Anuradhapura" },
  { city: "Ratnapura", district: "Ratnapura" },
  { city: "Batticaloa", district: "Batticaloa" },
];

const ALERTS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min — DMC warnings don't change second-to-second
const WATER_LEVEL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — a bit fresher since this is the "live" data
const GDACS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 min — global feed, Sri Lanka-relevant events are rare
const DISTRICT_BOUNDARIES_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — district boundaries essentially never change
const USGS_CACHE_TTL_MS = 20 * 60 * 1000; // 20 min — real-time-ish but not second-critical
const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — weather doesn't need to be second-fresh, and keeps well within free-tier call limits
const RESERVOIR_CACHE_TTL_MS = 60 * 60 * 1000; // 1h — the sheet itself is a once-daily bulletin (see DATE column)

// The Irrigation Department's Water Management Branch publishes daily
// reservoir water-level/storage bulletins as a Google Sheet, published to the
// web from the same slirrigation.maps.arcgis.com account behind the river
// gauge feed above — found the same way (tracing the "Major/Medium Reservoirs
// Daily Water Level" ArcGIS Dashboards to their underlying Web Map layer
// definitions). The dashboards' own point-location FeatureServer
// (Reservoir_Data_2024) is NOT publicly queryable — confirmed by direct
// testing (consistent "Invalid URL" from Esri's REST directory, unlike the
// public gauges_2_view service used for /water-levels) — so there are no
// reservoir coordinates to plot on a map; this feature ships as a risk-sorted
// list, not a map layer, same "verify what's actually usable, document the
// substitution" discipline as the DMC PDF/GDACS REST API/old gauge proxy.
const RESERVOIR_SHEET_PUB_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTcSGhi9RESl7CMCl1TQnrKe07Gx5Q696YiSB9jneIHqIP9lifpqSErgI3D5k9KtQXSdW5JpycIIr5e/pub";
const RESERVOIR_SHEET_GIDS = { major: "1212294664", medium: "562386515" };

// Known misspellings in the source sheet that don't match server/src/utils/districts.js's
// real spelling — add here rather than fuzzy-matching, so a genuinely new/unexpected
// district name fails visibly (district: null) instead of silently guessing wrong.
const RESERVOIR_DISTRICT_ALIASES = { anuradapura: "Anuradhapura" };

// The Irrigation Department bulletin above is specifically "Major & Medium
// IRRIGATION Reservoirs" — it does not include CEB/Mahaweli Authority
// HYDROPOWER reservoirs (Kotmale, Victoria, Randenigala etc.), a separate
// operator entirely. Found by direct investigation, not guessed: CEB's own
// mahawelicomplex.lk redirects to /login/, and that landing page — public,
// no authentication needed, confirmed by fetching it directly — embeds a
// real "Major Reservoir Water Levels & Active Storage Percentage — 6:00 AM"
// section with the current level (MSL) and capacity % baked directly into
// each reservoir's Chart.js config at server-render time. No clean JSON API;
// this scrapes that HTML the same way the DMC/GDACS RSS feeds get parsed,
// just with a small regex instead of an XML parser.
//
// Only 3 of CEB's hydro reservoirs get a water-level card on this page
// (Rantambe/Upper Kotmale/Ukuwela/Bowathenna/Nilambe only appear in a
// separate generation-output table, not storage) — Castlereigh/Maussakelle/
// Samanalawewa (the Laxapana complex) aren't on this site at all, a
// different CEB complex not yet investigated. Ship what's actually
// confirmed working rather than the full list originally proposed.
const CEB_MAHAWELI_URL = "https://mahawelicomplex.lk/login/";
// Coordinates from Wikipedia (Kotmale/Victoria/Randenigala Dam articles) —
// this source has no district field, so district is derived via the same
// nearestDistrict() every other coordinate-only feed in this app already
// uses (river gauges, aid requests), for consistent "which victims are
// nearby" semantics even where it disagrees with administrative boundaries
// (nearestDistrict places Randenigala in Badulla; various sources call it
// Kandy — a known nearest-centroid tradeoff already documented elsewhere in
// this app, not special-cased here for the sake of one dam).
const CEB_RESERVOIRS = [
  { name: "Kotmale", htmlTag: "KOTHMALE", lat: 7.06083, lng: 80.59722 },
  { name: "Victoria", htmlTag: "VICTORIA", lat: 7.24139, lng: 80.78472 },
  { name: "Randenigala", htmlTag: "RANDENIGALA", lat: 7.2025, lng: 80.925 },
];

// Sri Lanka's approximate centroid — used to test whether a GDACS event's
// bounding box covers the island, since not every event (esp. tropical
// cyclones over open ocean) has its `country`/`iso3` fields populated.
const SRI_LANKA_LAT = 7.8731;
const SRI_LANKA_LNG = 80.7718;

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * GET /api/external/alerts
 * Public. Parses the DMC's official Emergency Warnings RSS feed.
 * The feed is frequently empty (no active warning) — that's the DMC's real
 * state, not a bug here.
 */
router.get("/alerts", async (req, res) => {
  try {
    const alerts = await getCached("dmc-alerts", ALERTS_CACHE_TTL_MS, async () => {
      const response = await fetch(DMC_ALERTS_RSS_URL);
      if (!response.ok) throw new Error(`DMC RSS returned ${response.status}`);
      const xml = await response.text();

      const parser = new XMLParser({ ignoreAttributes: false });
      const parsed = parser.parse(xml);
      const rawItems = parsed?.rss?.channel?.item;
      if (!rawItems) return [];

      const items = Array.isArray(rawItems) ? rawItems : [rawItems];
      return items.map((item) => ({
        title: item.title || "Untitled",
        link: item.link || null,
        pubDate: item.pubDate || null,
        summary: stripHtml(item.description),
      }));
    });

    return res.json(alerts);
  } catch (err) {
    console.error("DMC alerts fetch error:", err.message);
    // Fail soft — an external outage shouldn't break the page that shows this.
    return res.json([]);
  }
});

/**
 * A GDACS event is "relevant to Sri Lanka" if its declared country/iso3
 * names Sri Lanka, its bounding box covers the island (catches tropical
 * cyclones and other events GDACS hasn't attributed to a single country),
 * or — as a last-resort catch-all — the title/description mentions it.
 */
function isRelevantToSriLanka(item) {
  if (item["gdacs:iso3"] === "LKA") return true;

  const country = item["gdacs:country"];
  if (country && String(country).toLowerCase().includes("sri lanka")) return true;

  const bbox = item["gdacs:bbox"];
  if (bbox) {
    const [lonMin, lonMax, latMin, latMax] = String(bbox).split(" ").map(Number);
    if (
      [lonMin, lonMax, latMin, latMax].every(Number.isFinite) &&
      SRI_LANKA_LAT >= latMin &&
      SRI_LANKA_LAT <= latMax &&
      SRI_LANKA_LNG >= lonMin &&
      SRI_LANKA_LNG <= lonMax
    ) {
      return true;
    }
  }

  const text = `${item.title || ""} ${item.description || ""}`.toLowerCase();
  return text.includes("sri lanka");
}

function normalizeGdacsEvent(item) {
  const point = item["geo:Point"];
  const severity = item["gdacs:severity"];
  return {
    eventId: item["gdacs:eventid"] ?? null,
    eventType: item["gdacs:eventtype"] || null,
    eventName: item["gdacs:eventname"] || null,
    alertLevel: item["gdacs:alertlevel"] || null,
    title: item.title || "Untitled",
    summary: stripHtml(item.description),
    link: item.link || null,
    fromDate: item["gdacs:fromdate"] || null,
    toDate: item["gdacs:todate"] || null,
    country: item["gdacs:country"] || null,
    location:
      point && typeof point["geo:lat"] === "number" && typeof point["geo:long"] === "number"
        ? { lat: point["geo:lat"], lng: point["geo:long"] }
        : null,
    severityText: severity && typeof severity === "object" ? severity["#text"] : severity || null,
    capUrl: item["gdacs:cap"] || null,
  };
}

/**
 * Fetches and parses the CAP (Common Alerting Protocol) XML linked from a
 * GDACS event's `gdacs:cap` field. CAP's <polygon> is a space-separated list
 * of "lat,lng" pairs (already Leaflet's [lat, lng] order, no swap needed) —
 * confirmed by fetching a real cyclone's CAP file and parsing it, not
 * guessed from the spec. This is the event's **current episode's** hazard/
 * uncertainty-area polygon, not a literal multi-point historical track line
 * — GDACS's RSS only ever exposes the latest episode, and the REST API that
 * would provide episode history is the same one that's currently down (see
 * the GDACS_RSS_URL comment above). Returns null on any failure — a bad or
 * unreachable CAP file for one event shouldn't break the whole list.
 */
async function fetchCapPolygon(capUrl) {
  try {
    const response = await fetch(capUrl);
    if (!response.ok) return null;
    const xml = await response.text();

    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);
    const infos = [].concat(parsed?.alert?.info || []);

    for (const info of infos) {
      const areas = [].concat(info?.area || []);
      for (const area of areas) {
        const polygonStr = area?.polygon;
        if (typeof polygonStr !== "string" || !polygonStr.trim()) continue;

        const points = polygonStr
          .trim()
          .split(/\s+/)
          .map((pair) => pair.split(",").map(Number))
          .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

        if (points.length >= 3) return points;
      }
    }
    return null;
  } catch (err) {
    console.error(`GDACS CAP polygon fetch error (${capUrl}):`, err.message);
    return null;
  }
}

function gaugeStatus(waterLevel, alertLevel, minorFloodLevel, majorFloodLevel) {
  if (majorFloodLevel != null && waterLevel >= majorFloodLevel) return "major_flood";
  if (minorFloodLevel != null && waterLevel >= minorFloodLevel) return "minor_flood";
  if (alertLevel != null && waterLevel >= alertLevel) return "alert";
  return "normal";
}

/**
 * Shared by GET /water-levels and the water-level area-alert poller (see
 * utils/waterLevelAlerts.js) — both need the exact same normalized station
 * list, and sharing the cache key means the poller never causes an extra
 * fetch beyond what the map/severity pages already trigger.
 */
async function fetchWaterLevels() {
  return getCached("river-gauges", WATER_LEVEL_CACHE_TTL_MS, async () => {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: "gauge,basin,water_level,alertpull,minorpull,majorpull,EditDate",
      orderByFields: "EditDate DESC",
      returnGeometry: "true",
      resultRecordCount: "1000",
      f: "json",
    });
    const response = await fetch(`${RIVER_GAUGE_FEATURE_SERVER_URL}?${params}`);
    if (!response.ok) throw new Error(`River gauge feature service returned ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(`River gauge feature service error: ${data.error.message || JSON.stringify(data.error)}`);
    if (!Array.isArray(data.features)) return [];

    // The query returns a time-series log ordered newest-first — keep only
    // the first (most recent) row seen per gauge, since a station reports
    // many readings over time and the map only ever wants its latest one.
    const seenGauges = new Set();
    return data.features
      .map((entry) => {
        const a = entry.attributes || {};
        const g = entry.geometry || {};
        if (typeof g.y !== "number" || typeof g.x !== "number") return null;
        const station = a.gauge || "Unknown station";
        if (seenGauges.has(station)) return null;
        seenGauges.add(station);
        return {
          station,
          basin: a.basin || "Unknown basin",
          lat: g.y,
          lng: g.x,
          waterLevel: a.water_level ?? null,
          alertLevel: a.alertpull ?? null,
          minorFloodLevel: a.minorpull ?? null,
          majorFloodLevel: a.majorpull ?? null,
          status: gaugeStatus(a.water_level, a.alertpull, a.minorpull, a.majorpull),
        };
      })
      .filter(Boolean);
  });
}

/**
 * GET /api/external/water-levels
 * Public. Live river gauge readings from the Irrigation Department's own
 * ArcGIS feature service — see RIVER_GAUGE_FEATURE_SERVER_URL comment above.
 * Each station's status is computed here by comparing its current level
 * against its own alert/minor-flood/major-flood thresholds (the same
 * convention the source uses).
 */
router.get("/water-levels", async (req, res) => {
  try {
    const stations = await fetchWaterLevels();
    return res.json(stations);
  } catch (err) {
    console.error("River gauge fetch error:", err.message);
    return res.json([]);
  }
});

/**
 * GET /api/external/gdacs
 * Public. GDACS global disaster events (tropical cyclones, earthquakes,
 * floods, droughts, wildfires). Default scope filters down to ones relevant
 * to Sri Lanka — see isRelevantToSriLanka — and is usually empty, same as
 * the DMC alerts feed; that's the real state of things, not a bug.
 *
 * ?scope=global returns every current GDACS event worldwide, unfiltered —
 * added so there's always something real to show (e.g. in a live demo)
 * even on a day with nothing Sri Lanka-relevant, rather than the feature
 * only ever being demonstrable when a real event happens to line up.
 */
router.get("/gdacs", async (req, res) => {
  try {
    const scope = req.query.scope === "global" ? "global" : "sri-lanka";
    const events = await getCached(`gdacs-events-${scope}`, GDACS_CACHE_TTL_MS, async () => {
      const response = await fetch(GDACS_RSS_URL);
      if (!response.ok) throw new Error(`GDACS RSS returned ${response.status}`);
      const xml = await response.text();

      const parser = new XMLParser({ ignoreAttributes: false });
      const parsed = parser.parse(xml);
      const rawItems = parsed?.rss?.channel?.item;
      if (!rawItems) return [];

      const items = Array.isArray(rawItems) ? rawItems : [rawItems];
      const filtered = scope === "global" ? items : items.filter(isRelevantToSriLanka);
      const normalized = filtered.map(normalizeGdacsEvent);

      // Only fetch CAP polygon geometry for tropical cyclones — the only
      // event type confirmed to carry usable hazard-area polygon data (see
      // "GDACS disaster alerts" in CLAUDE.md). In global scope there can be
      // hundreds of events (mostly wildfires); fetching CAP for all of them
      // would be wasteful for data the other event types don't have anyway.
      return Promise.all(
        normalized.map(async (event) => ({
          ...event,
          geometry: event.eventType === "TC" && event.capUrl ? await fetchCapPolygon(event.capUrl) : null,
        }))
      );
    });

    return res.json(events);
  } catch (err) {
    console.error("GDACS fetch error:", err.message);
    // Fail soft, same as the other external feeds — an outage on GDACS's
    // side shouldn't break the page that shows this.
    return res.json([]);
  }
});

/**
 * Downloads the ~130MB HDX zip, extracts the admin-2 GeoJSON, and simplifies
 * it down to something a browser map can load (~20MB raw -> ~280KB). The
 * download alone takes 1-2+ minutes depending on the network, which is far
 * too slow to happen inside a page load — this is only ever called through
 * getCached, either by the route below or the startup warm-up call at the
 * bottom of this file, never awaited directly by a request that's blocking
 * a user.
 */
async function fetchDistrictBoundaries() {
  const response = await fetch(HDX_LKA_BOUNDARIES_ZIP_URL);
  if (!response.ok) throw new Error(`HDX boundaries download returned ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());

  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("lka_admin2.geojson");
  if (!entry) throw new Error("lka_admin2.geojson not found in HDX zip");
  const raw = JSON.parse(entry.getData().toString("utf8"));

  const simplified = simplify(raw, { tolerance: 0.002, highQuality: true, mutate: false });

  // Trim to the fields the map actually needs, and rename to plain
  // English/Sinhala/Tamil keys instead of HDX's adm2_name/name1/name2
  // convention.
  simplified.features = simplified.features.map((f) => ({
    ...f,
    properties: {
      district: f.properties.adm2_name,
      districtSi: f.properties.adm2_name1,
      districtTa: f.properties.adm2_name2,
      province: f.properties.adm1_name,
      pcode: f.properties.adm2_pcode,
      areaSqKm: f.properties.area_sqkm,
    },
  }));

  return simplified;
}

/**
 * GET /api/external/district-boundaries
 * Public. Real Sri Lanka district (admin-2) boundary polygons from HDX's
 * official COD-AB dataset — see HDX_LKA_BOUNDARIES_ZIP_URL comment above for
 * why this fetches from HDX's file CDN rather than a queryable geoservice.
 * Cached 24h — this is the one external feed here that's realistically
 * static — and warmed at server startup (below) so this route is normally
 * serving from cache, not triggering the slow fetch itself.
 */
router.get("/district-boundaries", async (req, res) => {
  try {
    const geojson = await getCached(
      "district-boundaries",
      DISTRICT_BOUNDARIES_CACHE_TTL_MS,
      fetchDistrictBoundaries
    );
    return res.json(geojson);
  } catch (err) {
    console.error("District boundaries fetch error:", err.message);
    // Fail soft, same as the other external feeds — the frontend falls back
    // to its existing centroid-circle rendering if this comes back empty.
    return res.json(null);
  }
});

/**
 * GET /api/external/earthquakes
 * Public. Recent earthquakes (last 30 days, magnitude 4.0+) from USGS's
 * public catalog. `?scope=sri-lanka` (default) queries a tight box around
 * Sri Lanka itself — usually empty, which is the real, accurate state, same
 * "usually empty by default" framing as GDACS's sri-lanka scope.
 * `?scope=regional` queries the wider Indian Ocean / Bay of Bengal / Sumatra
 * subduction zone (see USGS_EARTHQUAKE_API_URL comment above) — reliably
 * populated, the fallback for "show me this feed actually working." Cached
 * 20 min per scope, same fail-soft pattern as every other feed here.
 */
router.get("/earthquakes", async (req, res) => {
  try {
    const scope = req.query.scope === "regional" ? "regional" : "sri-lanka";
    const bbox = scope === "regional" ? USGS_REGIONAL_BBOX : USGS_SRI_LANKA_BBOX;

    const earthquakes = await getCached(`usgs-earthquakes-${scope}`, USGS_CACHE_TTL_MS, async () => {
      const endtime = new Date();
      const starttime = new Date(endtime.getTime() - USGS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      const params = new URLSearchParams({
        format: "geojson",
        starttime: starttime.toISOString().slice(0, 10),
        endtime: endtime.toISOString().slice(0, 10),
        minlatitude: String(bbox.minLat),
        maxlatitude: String(bbox.maxLat),
        minlongitude: String(bbox.minLng),
        maxlongitude: String(bbox.maxLng),
        minmagnitude: String(USGS_MIN_MAGNITUDE),
        orderby: "time",
      });

      const response = await fetch(`${USGS_EARTHQUAKE_API_URL}?${params}`);
      if (!response.ok) throw new Error(`USGS earthquake API returned ${response.status}`);
      const data = await response.json();

      return (data.features || []).map((f) => ({
        id: f.id,
        magnitude: f.properties.mag,
        place: f.properties.place,
        time: new Date(f.properties.time).toISOString(),
        depthKm: f.geometry.coordinates[2] ?? null,
        tsunami: f.properties.tsunami === 1,
        url: f.properties.url,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
      }));
    });

    return res.json(earthquakes);
  } catch (err) {
    console.error("USGS earthquake fetch error:", err.message);
    return res.json([]);
  }
});

/**
 * GET /api/external/weather
 * Public. Current conditions for a fixed set of cities spanning Sri Lanka's
 * main regions — see WEATHER_CITIES comment above for why these eight and
 * not all 25 districts. Cached 30 min. Fails soft to `[]` overall, and to
 * `null` per-city if one call fails (e.g. a transient rate-limit blip)
 * rather than dropping the whole response over one bad city.
 */
router.get("/weather", async (req, res) => {
  try {
    if (!OPENWEATHER_API_KEY) {
      console.error("Weather fetch skipped: OPENWEATHER_API_KEY is not set.");
      return res.json([]);
    }

    const results = await getCached("weather", WEATHER_CACHE_TTL_MS, async () => {
      return Promise.all(
        WEATHER_CITIES.map(async ({ city, district }) => {
          try {
            const params = new URLSearchParams({
              q: `${city},LK`,
              units: "metric",
              appid: OPENWEATHER_API_KEY,
            });
            const response = await fetch(`${OPENWEATHER_API_URL}?${params}`);
            if (!response.ok) throw new Error(`OpenWeatherMap returned ${response.status} for ${city}`);
            const data = await response.json();

            return {
              city,
              district,
              tempC: Math.round(data.main?.temp),
              feelsLikeC: Math.round(data.main?.feels_like),
              condition: data.weather?.[0]?.main || null,
              description: data.weather?.[0]?.description || null,
              icon: data.weather?.[0]?.icon || null,
              humidity: data.main?.humidity ?? null,
              windSpeedMs: data.wind?.speed ?? null,
              rainLastHourMm: data.rain?.["1h"] ?? 0,
            };
          } catch (err) {
            console.error(`Weather fetch failed for ${city}:`, err.message);
            return { city, district, error: true };
          }
        })
      );
    });

    return res.json(results);
  } catch (err) {
    console.error("Weather fetch error:", err.message);
    return res.json([]);
  }
});

function normalizeReservoirDistrict(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return null;
  if (RESERVOIR_DISTRICT_ALIASES[s]) return RESERVOIR_DISTRICT_ALIASES[s];
  const match = DISTRICTS.find((d) => d.name.toLowerCase() === s);
  return match ? match.name : null;
}

function parseReservoirNumber(raw) {
  if (raw == null) return null;
  const n = parseFloat(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function parseReservoirPercent(raw) {
  if (!raw) return null;
  const n = parseFloat(String(raw).replace("%", "").trim());
  return Number.isFinite(n) ? n : null;
}

// Deliberately descriptive, not predictive — this reports the reservoir's
// current officially-published storage % and whether it's already spilling
// (both facts as of the bulletin's own DATE), never a forecast of when a
// gate might open. "spilling" (already discharging over the spillway) is
// the clearest real signal available and always wins regardless of %.
function reservoirRiskLevel(spilling, effectiveStoragePercent) {
  if (spilling) return "spilling";
  if (effectiveStoragePercent == null) return "normal";
  if (effectiveStoragePercent >= 90) return "high";
  if (effectiveStoragePercent >= 75) return "elevated";
  return "normal";
}

function findReservoirColumn(header, test) {
  return header.findIndex((h) => test(String(h || "").trim().toLowerCase()));
}

// The Major and Medium sheets don't share identical column layouts (Major
// has an extra "DS IMPACT" column Medium lacks, shifting everything after
// it) — locating columns by header text rather than a fixed index handles
// this correctly for both, and stays correct if a future column is ever
// inserted/reordered in either sheet.
async function fetchReservoirSheet(size, gid) {
  const response = await fetch(`${RESERVOIR_SHEET_PUB_URL}?output=csv&gid=${gid}`);
  if (!response.ok) throw new Error(`Reservoir sheet (${size}) returned ${response.status}`);
  const csvText = await response.text();
  const { data: rows } = Papa.parse(csvText, { skipEmptyLines: false });

  const headerIndex = rows.findIndex((r) => String(r[0]).trim().toUpperCase() === "NO");
  if (headerIndex === -1) return [];
  const header = rows[headerIndex];

  const col = {
    name: findReservoirColumn(header, (s) => s === "reservoir"),
    range: findReservoirColumn(header, (s) => s === "range"),
    grossCapacity: findReservoirColumn(header, (s) => s.includes("gross capacity")),
    deadStorage: findReservoirColumn(header, (s) => s.includes("dead storage")),
    date: findReservoirColumn(header, (s) => s === "date"),
    waterDepth: findReservoirColumn(header, (s) => s.includes("water depth")),
    grossStorage: findReservoirColumn(header, (s) => s.includes("gross storage")),
    effStorageAcft: findReservoirColumn(header, (s) => s.includes("effective storage") && !s.includes("%")),
    effStoragePct: findReservoirColumn(header, (s) => s.includes("effective storage") && s.includes("%")),
    rainfall: findReservoirColumn(header, (s) => s.includes("rain fall") || s.includes("rainfall")),
    spilling: findReservoirColumn(header, (s) => s === "spilling"),
    remarks: findReservoirColumn(header, (s) => s === "remarks"),
    sluiceDischarge: findReservoirColumn(header, (s) => s.includes("sluice discharge")),
    spillingCusec: findReservoirColumn(header, (s) => s.includes("cusec") && s.includes("spilling")),
    division: findReservoirColumn(header, (s) => s === "division" || s === "divison"),
    district: findReservoirColumn(header, (s) => s === "district"),
  };

  const reservoirs = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const no = String(row[0] || "").trim();
    const name = String(row[col.name] || "").trim();
    // Numbered rows only — the per-reservoir section ends with a blank row
    // then a "SUMMARY OF DAILY WATER LEVEL..." recap table, which this stops
    // at rather than misparsing as more reservoirs.
    if (!/^\d+$/.test(no) || !name) break;

    const effectiveStoragePercent = parseReservoirPercent(row[col.effStoragePct]);
    const spilling = String(row[col.spilling] || "").trim().toLowerCase() === "yes";
    const district = normalizeReservoirDistrict(row[col.district]);
    // This source has no coordinates at all — only a district name. Falls
    // back to that district's centroid so these can still show on the map
    // (deliberately a lower-confidence, visually distinct marker from the
    // 3 CEB reservoirs with real coordinates — see the frontend's light-pink
    // treatment). Multiple reservoirs in the same district stack on the
    // same point; that's the honest limit of this source, not a bug.
    const districtCentroid = DISTRICTS.find((d) => d.name === district) || null;

    reservoirs.push({
      name,
      size,
      source: "irrigation_department",
      lat: districtCentroid?.lat ?? null,
      lng: districtCentroid?.lng ?? null,
      locationApproximate: true,
      riverRange: String(row[col.range] || "").trim() || null,
      grossCapacityAcft: parseReservoirNumber(row[col.grossCapacity]),
      deadStorageAcft: parseReservoirNumber(row[col.deadStorage]),
      date: String(row[col.date] || "").trim() || null,
      waterDepthFt: parseReservoirNumber(row[col.waterDepth]),
      grossStorageAcft: parseReservoirNumber(row[col.grossStorage]),
      effectiveStorageAcft: parseReservoirNumber(row[col.effStorageAcft]),
      effectiveStoragePercent,
      rainfallMm: parseReservoirNumber(row[col.rainfall]),
      spilling,
      remarks: String(row[col.remarks] || "").trim() || null,
      sluiceDischargeCusec: parseReservoirNumber(row[col.sluiceDischarge]),
      spillingCusec: parseReservoirNumber(row[col.spillingCusec]),
      division: String(row[col.division] || "").trim() || null,
      district,
      riskLevel: reservoirRiskLevel(spilling, effectiveStoragePercent),
    });
  }
  return reservoirs;
}

const RESERVOIR_RISK_ORDER = { spilling: 3, high: 2, elevated: 1, normal: 0 };

// Pulls each of the 3 reservoirs' "Level in MSL" bar-chart value and
// "Capacity %" doughnut-chart value out of the page's embedded Chart.js
// config, scoped to the HTML comment block for that reservoir (confirmed via
// direct inspection that these 3 blocks are comment-delimited with nothing
// else in between, so scoping to "from this reservoir's comment to the next
// one" can't accidentally pick up a different reservoir's numbers).
function extractCebReservoirBlock(html, htmlTag) {
  const startIdx = html.indexOf(`<!-- ${htmlTag} -->`);
  if (startIdx === -1) return { levelMsl: null, capacityPercent: null };
  const nextCommentIdx = html.indexOf("<!--", startIdx + 10);
  const block = html.slice(startIdx, nextCommentIdx === -1 ? startIdx + 4000 : nextCommentIdx);

  const levelMatch = block.match(/Level in MSL[\s\S]*?data:\s*\[\s*([\d.]+)\s*\]/);
  const capacityMatch = block.match(/percent:\s*([\d.]+)/);
  return {
    levelMsl: levelMatch ? parseFloat(levelMatch[1]) : null,
    capacityPercent: capacityMatch ? parseFloat(capacityMatch[1]) : null,
  };
}

async function fetchCebMahaweliReservoirs() {
  const response = await fetch(CEB_MAHAWELI_URL);
  if (!response.ok) throw new Error(`CEB Mahaweli Complex page returned ${response.status}`);
  const html = await response.text();

  return CEB_RESERVOIRS.map(({ name, htmlTag, lat, lng }) => {
    const { levelMsl, capacityPercent } = extractCebReservoirBlock(html, htmlTag);
    return {
      name,
      size: "hydropower",
      source: "ceb_mahaweli",
      lat,
      lng,
      locationApproximate: false,
      levelMsl,
      effectiveStoragePercent: capacityPercent,
      // No spilling flag or rainfall figure on this source — only capacity %
      // is available, so risk is judged on that alone (spilling always false).
      spilling: false,
      district: nearestDistrict({ lat, lng }),
      riskLevel: reservoirRiskLevel(false, capacityPercent),
      date: null,
      riverRange: null,
      grossCapacityAcft: null,
      deadStorageAcft: null,
      waterDepthFt: null,
      grossStorageAcft: null,
      effectiveStorageAcft: null,
      rainfallMm: null,
      remarks: null,
      sluiceDischargeCusec: null,
      spillingCusec: null,
      division: null,
    };
  });
}

async function fetchReservoirs() {
  return getCached("reservoirs", RESERVOIR_CACHE_TTL_MS, async () => {
    const sources = [
      { label: "major", fetcher: () => fetchReservoirSheet("major", RESERVOIR_SHEET_GIDS.major) },
      { label: "medium", fetcher: () => fetchReservoirSheet("medium", RESERVOIR_SHEET_GIDS.medium) },
      { label: "CEB Mahaweli", fetcher: fetchCebMahaweliReservoirs },
    ];
    const results = await Promise.allSettled(sources.map((s) => s.fetcher()));

    // A total failure (every source down — e.g. a transient network blip
    // right at server startup) must actually reject here rather than
    // resolve to [], or getCached would cache that empty result as a
    // legitimate "no reservoirs" answer for the full TTL instead of letting
    // the next request retry. Any source succeeding is real partial data,
    // worth caching as-is.
    if (results.every((r) => r.status === "rejected")) {
      throw new Error(results.map((r) => r.reason?.message).join("; "));
    }

    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(`Failed to fetch ${sources[i].label} reservoir data:`, r.reason?.message);
      }
    });

    const combined = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    return combined.sort((a, b) => RESERVOIR_RISK_ORDER[b.riskLevel] - RESERVOIR_RISK_ORDER[a.riskLevel]);
  });
}

router.get("/reservoirs", async (req, res) => {
  try {
    const reservoirs = await fetchReservoirs();
    return res.json(reservoirs);
  } catch (err) {
    console.error("Reservoirs fetch error:", err.message);
    return res.json([]);
  }
});

// Warm the cache once at server startup rather than making whichever
// request happens to arrive first (possibly a real user opening the map
// during a demo) wait 1-2+ minutes for the initial download.
getCached("district-boundaries", DISTRICT_BOUNDARIES_CACHE_TTL_MS, fetchDistrictBoundaries).catch((err) => {
  console.error("District boundaries warm-up fetch failed:", err.message);
});

// Express Router instances are just functions — attaching properties here
// lets other modules (the water-level area-alert poller) reuse this exact
// fetch+cache logic without a second HTTP round trip to this same server.
router.fetchWaterLevels = fetchWaterLevels;
router.gaugeStatus = gaugeStatus;
router.fetchReservoirs = fetchReservoirs;

module.exports = router;
