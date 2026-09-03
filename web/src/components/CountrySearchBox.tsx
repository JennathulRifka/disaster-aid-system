import { useState } from "react";

export interface CountryFeature {
  type: "Feature";
  properties: { name: string };
  geometry: GeoJSON.Geometry;
}

/**
 * A pure search-and-select UI, no map/Leaflet dependency — the caller (each
 * map page) owns the actual zoom-to-bounds + outline-rendering logic, since
 * that needs react-leaflet's useMap() hook, which only works inside that
 * page's own <MapContainer> tree. Built so a person looking at a global
 * disaster feed doesn't need to already know where e.g. Nepal is — type a
 * name, pick it, the map finds it for you.
 */
export function CountrySearchBox({
  countries,
  onSelect,
  onClear,
  selectedName,
}: {
  countries: CountryFeature[];
  onSelect: (feature: CountryFeature) => void;
  onClear: () => void;
  selectedName: string | null;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = query.trim()
    ? countries
        .filter((c) => c.properties.name.toLowerCase().includes(query.trim().toLowerCase()))
        .slice(0, 8)
    : [];

  function handleSelect(feature: CountryFeature) {
    onSelect(feature);
    setQuery(feature.properties.name);
    setOpen(false);
  }

  function handleClear() {
    onClear();
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative ml-auto w-full sm:w-64 sm:shrink-0">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search for a country..."
          className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        {selectedName && (
          <button
            onClick={handleClear}
            title="Clear"
            className="rounded border border-gray-300 px-2 text-xs text-gray-600 hover:bg-gray-50"
          >
            ✕
          </button>
        )}
      </div>
      {selectedName && (
        <p className="mt-1 text-xs text-gray-500">
          Showing: <span className="font-medium text-gray-700">{selectedName}</span>
        </p>
      )}
      {/* z-[1200]: same fix as SosButton.tsx's modal — above Leaflet's own
          panes/controls (raw z-index up to 1000), so this dropdown doesn't
          render behind the map sitting right below it. */}
      {open && matches.length > 0 && (
        <ul className="absolute z-[1200] mt-1 max-h-48 w-full overflow-y-auto rounded border border-gray-200 bg-white shadow-lg">
          {matches.map((c) => (
            <li key={c.properties.name}>
              <button
                onClick={() => handleSelect(c)}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
              >
                {c.properties.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
