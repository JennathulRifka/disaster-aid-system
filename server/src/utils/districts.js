const { distanceKm } = require("./geo");

/**
 * Sri Lanka's 25 administrative districts with approximate centroids.
 * This is nearest-centroid matching, not real polygon boundaries — points
 * near a district border can get attributed to the neighboring district.
 * Good enough for a coarse public severity map; not precise GIS. Swap for
 * real boundary polygons (e.g. a GeoJSON lookup) if that's ever needed.
 */
const DISTRICTS = [
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

/** Returns the nearest district's name for a {lat, lng} location. */
function nearestDistrict(location) {
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

module.exports = { DISTRICTS, nearestDistrict };
