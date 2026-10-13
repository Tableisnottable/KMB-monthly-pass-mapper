'use client';

import { useEffect, useState } from 'react';

export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: string;
  googleMapsUrl: string;
}

interface PlaceAutocompleteProps {
  label: string;
  value: string;
  colorClass: string;
  onChange: (value: string) => void;
  onSelect?: (place: PlaceResult) => void;
}

export function PlaceAutocomplete({
  label,
  value,
  colorClass,
  onChange,
  onSelect,
}: PlaceAutocompleteProps) {
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(query)}`, {
          cache: 'no-store',
        });
        const payload = (await response.json()) as { data?: PlaceResult[] };
        setResults(payload.data ?? []);
        setOpen(true);
      } catch {
        setResults([]);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <div className="relative flex-1">
      <label className="flex items-center gap-3 rounded-2xl bg-cm-paper px-4 py-3 ring-1 ring-cm-line">
        <span className={`flex h-3 w-3 rounded-full ${colorClass}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] uppercase tracking-[0.2em] text-cm-muted">{label}</span>
          <input
            aria-label={label}
            className="w-full bg-transparent text-base font-bold outline-none"
            onChange={(event) => {
              onChange(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(results.length > 0)}
            placeholder="搜尋地點、地址或地標"
            value={value}
          />
        </span>
        {loading && <span className="text-xs text-cm-muted">搜尋中</span>}
      </label>
      {open && results.length > 0 && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl bg-white p-1 shadow-pop ring-1 ring-cm-line">
          {results.map((place) => (
            <button
              className="block w-full rounded-xl px-3 py-2 text-left hover:bg-cm-paper"
              key={place.id}
              onClick={() => {
                onChange(place.name);
                onSelect?.(place);
                setOpen(false);
              }}
              type="button"
            >
              <span className="block text-sm font-bold text-cm-ink">{place.name}</span>
              <span className="block truncate text-xs text-cm-muted">{place.address}</span>
            </button>
          ))}
        </div>
      )}
      {open && !loading && value.trim().length >= 2 && results.length === 0 && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 rounded-2xl bg-white p-3 text-xs text-cm-muted shadow-pop ring-1 ring-cm-line">
          找不到完全相同的名稱，請試輸入街道、商場、屋苑或英文名稱。
        </div>
      )}
    </div>
  );
}
