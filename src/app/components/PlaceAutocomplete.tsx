'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { copy, type PlannerLocale } from './plannerUi';
import { PlannerIcon } from './PlannerIcon';

export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: string;
  googleMapsUrl: string;
}

export function PlaceAutocomplete({ label, value, colorClass, onChange, onSelect, locale = 'zh' }: {
  label: string;
  value: string;
  colorClass: string;
  onChange: (value: string) => void;
  onSelect?: (place: PlaceResult) => void;
  locale?: PlannerLocale;
}) {
  const id = useId();
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [active, setActive] = useState(-1);
  const selected = useRef<string | null>(null);

  useEffect(() => {
    const query = value.trim();
    setResults([]);
    setActive(-1);
    setError(false);
    if (query.length < 2 || selected.current === value) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/places?q=' + encodeURIComponent(query), { signal: controller.signal });
        if (!response.ok) throw new Error('Place lookup failed');
        const payload = await response.json() as { data?: PlaceResult[] };
        if (!controller.signal.aborted) setResults(payload.data ?? []);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value]);

  function choose(place: PlaceResult) {
    selected.current = place.name;
    onChange(place.name);
    onSelect?.(place);
    setOpen(false);
  }

  return (
    <div className="place-field" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <label className="place-input" htmlFor={id}>
        <span className={'place-dot ' + colorClass} />
        <span className="place-text">
          <span className="field-label">{label}</span>
          <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open && value.trim().length >= 2 && selected.current !== value}
            aria-controls={id + '-list'} aria-activedescendant={active >= 0 ? id + '-' + active : undefined}
            autoComplete="off" value={value} placeholder={copy(locale, '地點、地址或車站', 'Place, address or station')}
            onChange={event => { selected.current = null; onChange(event.target.value); setOpen(true); }}
            onFocus={() => { if (selected.current !== value) setOpen(true); }}
            onKeyDown={event => {
              if (event.key === 'Escape') { setOpen(false); return; }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault(); setOpen(true);
                setActive(index => results.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : -1);
              }
              if (event.key === 'Enter' && open && active >= 0 && results[active]) {
                event.preventDefault(); choose(results[active]);
              }
            }} />
        </span>
      </label>
      {value && <button type="button" className="field-clear" aria-label={copy(locale, '清除', 'Clear') + ' ' + label}
        onClick={() => { selected.current = null; onChange(''); setOpen(false); }}><PlannerIcon name="close" size={14} /></button>}
      {open && value.trim().length >= 2 && selected.current !== value && (
        <div className="place-results" id={id + '-list'} role="listbox" aria-label={label}>
          {loading ? <p role="status">{copy(locale, '正在搜尋地點…', 'Finding places…')}</p>
            : error ? <p role="status">{copy(locale, '地點搜尋暫時無法使用，請稍後再試。', 'Place search is unavailable. Please try again shortly.')}</p>
            : results.length === 0 ? <p>{copy(locale, '找不到地點，請試另一個名稱。', 'No places found. Try another name.')}</p>
            : results.map((place, index) => <button type="button" role="option" aria-selected={active === index}
              id={id + '-' + index} key={place.id} className={active === index ? 'active' : ''}
              onMouseDown={event => event.preventDefault()} onClick={() => choose(place)}>
              <PlannerIcon name="pin" size={18} /><span><strong>{place.name}</strong><small>{place.address}</small></span>
            </button>)}
        </div>
      )}
    </div>
  );
}
