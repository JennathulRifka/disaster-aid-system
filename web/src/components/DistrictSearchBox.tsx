import { useState } from "react";
import { DISTRICTS } from "@/lib/districts";

export interface DistrictOption {
  name: string;
  lat: number;
  lng: number;
}

/**
 * Search-and-zoom for Sri Lanka's 25 districts — the same pattern as
 * CountrySearchBox.tsx, but simpler: no API fetch needed since DISTRICTS is
 * already a small, static, client-side list. Kept as its own component
 * rather than generalizing CountrySearchBox, since that one is typed around
 * a GeoJSON feature (for zoom-to-polygon-bounds) while this only ever needs
 * a name + centroid (zoom-to-point) — different enough data shapes that
 * sharing one component would need more indirection than it saves.
 */
export function DistrictSearchBox({
  onSelect,
  onClear,
  selectedName,
}: {
  onSelect: (district: DistrictOption) => void;
  onClear: () => void;
  selectedName: string | null;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = query.trim()
    ? DISTRICTS.filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  function handleSelect(district: DistrictOption) {
    onSelect(district);
    setQuery(district.name);
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
          placeholder="Search for a district..."
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
      {/* z-[1200]: same fix as CountrySearchBox.tsx's dropdown — above
          Leaflet's own panes/controls (raw z-index up to 1000). */}
      {open && matches.length > 0 && (
        <ul className="absolute z-[1200] mt-1 max-h-48 w-full overflow-y-auto rounded border border-gray-200 bg-white shadow-lg">
          {matches.map((d) => (
            <li key={d.name}>
              <button
                onClick={() => handleSelect(d)}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
              >
                {d.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
