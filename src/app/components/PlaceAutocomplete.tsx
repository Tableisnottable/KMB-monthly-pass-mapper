'use client';

import { transportFetch as fetch } from '../../browser/transportClient';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { copy, type PlannerLocale } from './plannerUi';
import { PlannerIcon } from './PlannerIcon';
import { readRecentPlaces, saveRecentPlace } from './recentPlaces';

export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: string;
  googleMapsUrl: string;
}

export function PlaceAutocomplete({ label, value, colorClass, onChange, onSelect, onFocus, selectedPlace, inputRef, locale = 'zh' }: {
  label: string;
  value: string;
  colorClass: string;
  onChange: (value: string) => void;
  onSelect?: (place: PlaceResult) => void;
  onFocus?: () => void;
  selectedPlace?: PlaceResult | null;
  inputRef?: RefObject<HTMLInputElement>;
  locale?: PlannerLocale;
}) {
  const id = useId();
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [active, setActive] = useState(-1);
  const selected = useRef<string | null>(null);
  const [recent, setRecent] = useState<PlaceResult[]>([]);
  const showRecent = value.trim().length < 2;
  const suggestions = showRecent ? recent : results;
  const expanded = open && (showRecent || selected.current !== value && selectedPlace?.name !== value);

  useEffect(() => {
    const query = value.trim();
    setResults([]);
    setActive(-1);
    setError(false);
    if (query.length < 2 || selected.current === value || selectedPlace?.name === value) {
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
        if (!controller.signal.aborted) { setResults(payload.data ?? []); setActive(payload.data?.length ? 0 : -1); }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value, selectedPlace]);

  function choose(place: PlaceResult) {
    selected.current = place.name;
    saveRecentPlace(place);
    onChange(place.name);
    onSelect?.(place);
    setOpen(false);
  }

  return (
    <div className="place-field" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <label className="place-input" htmlFor={id}>
        <span className={'field-label ' + colorClass}>{label}</span>
        <span className="place-text">
          <input ref={inputRef} id={id} aria-label={label} role="combobox" aria-autocomplete="list" aria-expanded={expanded}
            placeholder={colorClass === 'origin-label' ? copy(locale, '由哪裏出發？', 'Where from?') : copy(locale, '想去哪裏？', 'Where to?')}
            enterKeyHint="search" aria-controls={expanded ? id + '-list' : undefined} aria-activedescendant={expanded && suggestions[active] ? id + '-' + active : undefined}
            autoComplete="off" value={value}
            onChange={event => { selected.current = null; onChange(event.target.value); setOpen(true); }}
            onFocus={event => { onFocus?.(); setRecent(readRecentPlaces()); setActive(-1); if (selectedPlace) event.currentTarget.select(); setOpen(true); }}
            onKeyDown={event => {
              if (event.key === 'Escape') { setOpen(false); return; }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault(); setOpen(true);
                setActive(index => suggestions.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length : -1);
              }
              if (event.key === 'Enter' && expanded && active >= 0 && suggestions[active]) {
                event.preventDefault(); choose(suggestions[active]);
              }
            }} />
        </span>
      </label>
      {selectedPlace && <small className="selected-place-description" title={selectedPlace.address}>{selectedPlace.address}
        {(selectedPlace.type === 'map' || selectedPlace.type === 'location') && <span className="endpoint-coordinate">{selectedPlace.lat.toFixed(5)}, {selectedPlace.lng.toFixed(5)}</span>}</small>}
      {value && <button type="button" className="field-clear" aria-label={copy(locale, '清除', 'Clear') + ' ' + label}
        onClick={() => { selected.current = null; onChange(''); setRecent(readRecentPlaces()); setOpen(true); inputRef?.current?.focus(); }}><PlannerIcon name="close" size={14} /></button>}
      {expanded && (
        <div className="place-results" id={id + '-list'} role="listbox" aria-label={label}>
          {showRecent && <p className="place-results-hint">{recent.length ? copy(locale, '最近選擇 · 儲存於此裝置', 'Recent places · saved on this device') : copy(locale, '輸入車站、街道、商場或地點名稱。也可點選地圖。', 'Search a station, street, shopping centre or place. You can also pick on the map.')}</p>}
          {!showRecent && loading ? <p role="status">{copy(locale, '正在搜尋地點…', 'Finding places…')}</p>
            : !showRecent && error ? <p role="status">{copy(locale, '地點搜尋暫時無法使用，請稍後再試。', 'Place search is unavailable. Please try again shortly.')}</p>
            : !showRecent && suggestions.length === 0 ? <p>{copy(locale, '找不到地點，請試另一個名稱或使用地圖。', 'No places found. Try another name or use the map.')}</p>
            : suggestions.map((place, index) => <button type="button" role="option" aria-selected={active === index}
              id={id + '-' + index} key={place.id} className={active === index ? 'active' : ''}
              onMouseDown={event => event.preventDefault()} onClick={() => choose(place)}>
              <PlannerIcon name="pin" size={18} /><span><strong>{place.name}</strong><small>{place.address}</small></span>
            </button>)}
        </div>
      )}
    </div>
  );
}
