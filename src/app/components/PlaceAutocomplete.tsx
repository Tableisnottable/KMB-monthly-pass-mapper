'use client';

import { transportFetch as fetch } from '../../browser/transportClient';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { copy, type PlannerLocale } from './plannerUi';
import { PlannerIcon } from './PlannerIcon';
import { readRecentPlaces, saveRecentPlace } from './recentPlaces';

export interface PlaceResult {
  id: string;
  name: string;
  nameZh?: string; nameEn?: string;
  addressZh?: string; addressEn?: string;
  address: string;
  lat: number;
  lng: number;
  type: string;
  googleMapsUrl: string;
}

export const placeDisplayName = (place: PlaceResult, locale: PlannerLocale) =>
  (locale === 'zh' ? typeof place.nameZh === 'string' && place.nameZh : typeof place.nameEn === 'string' && place.nameEn) || place.name;
export const placeDisplayAddress = (place: PlaceResult, locale: PlannerLocale) =>
  (locale === 'zh' ? typeof place.addressZh === 'string' && place.addressZh : typeof place.addressEn === 'string' && place.addressEn) || place.address;

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
  const interacted = useRef(false);
  const ownInputRef = useRef<HTMLInputElement>(null);
  const fieldInput = inputRef ?? ownInputRef;
  const showRecent = value.trim().length < 2 || selectedPlace?.name === value;
  const suggestions = showRecent ? recent : results;
  const expanded = open;

  useEffect(() => {
    const query = value.trim();
    setResults([]); interacted.current = false;
    setActive(-1);
    setError(false);
    if (query.length < 2 || selected.current === value || selectedPlace?.name === value) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      let hasLocal = false;
      try {
        const local = await fetch('/api/places?scope=local&lang=' + locale + '&q=' + encodeURIComponent(query), { signal: controller.signal });
        const nearby = local.ok ? await local.json() as { data?: PlaceResult[] } : {};
        if (!controller.signal.aborted && nearby.data?.length) {
          hasLocal = true;
          setResults(nearby.data.slice(0, 3)); setActive(0);
        }
        const response = await fetch('/api/places?lang=' + locale + '&q=' + encodeURIComponent(query), { signal: controller.signal });
        if (!response.ok) throw new Error('Place lookup failed');
        const payload = await response.json() as { data?: PlaceResult[] };
        if (!controller.signal.aborted) {
          const incoming = payload.data ?? [];
          setResults(previous => interacted.current ? [...previous, ...incoming.filter(place => !previous.some(row => row.id === place.id))].slice(0, 10) : incoming);
          if (!interacted.current) setActive(incoming.length ? 0 : -1);
        }
      } catch {
        if (!controller.signal.aborted && !hasLocal) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value, selectedPlace, locale]);

  function choose(place: PlaceResult) {
    selected.current = place.name;
    saveRecentPlace(place);
    onChange(place.name);
    onSelect?.(place);
    setOpen(false);
  }

  return (
    <div className={"place-field" + (expanded ? " is-editing" : "")} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <label className="place-input" htmlFor={id}>
        <span className={'field-label ' + colorClass}>{label}</span>
        <span className="place-text">
          <input ref={fieldInput} id={id} aria-label={label} role="combobox" aria-autocomplete="list" aria-expanded={expanded}
            placeholder={colorClass === 'via-label' ? copy(locale, '途經哪裏？', 'Via where?') : colorClass === 'origin-label' ? copy(locale, '由哪裏出發？', 'Where from?') : copy(locale, '想去哪裏？', 'Where to?')}
            enterKeyHint="search" aria-controls={expanded ? id + '-list' : undefined} aria-activedescendant={expanded && suggestions[active] ? id + '-' + active : undefined}
            autoComplete="off" value={selectedPlace && selectedPlace.name === value ? placeDisplayName(selectedPlace, locale) : value}
            onChange={event => { selected.current = null; onChange(event.target.value); setOpen(true); }}
            onFocus={event => { onFocus?.(); setRecent(readRecentPlaces()); setActive(-1); if (selectedPlace) event.currentTarget.select(); setOpen(true); }}
            onKeyDown={event => {
              if (event.key === 'Escape') { setOpen(false); return; }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault(); interacted.current = true; setOpen(true);
                setActive(index => suggestions.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length : -1);
              }
              if (event.key === 'Enter' && expanded && active >= 0 && suggestions[active]) {
                event.preventDefault(); choose(suggestions[active]);
              }
            }} />
        </span>
      </label>
      {selectedPlace && <small className="selected-place-description" title={placeDisplayAddress(selectedPlace, locale)}>{placeDisplayAddress(selectedPlace, locale)}
        {(selectedPlace.type === 'map' || selectedPlace.type === 'location') && <span className="endpoint-coordinate">{selectedPlace.lat.toFixed(5)}, {selectedPlace.lng.toFixed(5)}</span>}</small>}
      {value && <button type="button" className="field-clear" aria-label={copy(locale, '清除', 'Clear') + ' ' + label}
        onClick={() => { selected.current = null; onChange(''); setRecent(readRecentPlaces()); setOpen(true); fieldInput.current?.focus(); }}><PlannerIcon name="close" size={14} /></button>}
      {expanded && (
        <div className="place-results" id={id + '-list'} role="listbox" aria-label={label}>
          {showRecent && <p className="place-results-hint">{recent.length ? copy(locale, '最近地點', 'Recent places') : copy(locale, '搜尋地點、地址或車站', 'Search a place, address or station')}</p>}
          {!showRecent && loading && <p className="place-search-progress" role="status">{copy(locale, '搜尋中…', 'Searching…')}</p>}
          {!showRecent && !loading && error && <p role="status">{copy(locale, '搜尋暫時無法使用，請重試或在地圖選擇。', 'Search unavailable. Retry or choose on the map.')}</p>}
          {!showRecent && !loading && !error && !suggestions.length && <p>{copy(locale, '試試完整名稱或附近街道', 'Try the full name or a nearby street')}</p>}
          {suggestions.map((place, index) => <button type="button" role="option" aria-selected={active === index}
              id={id + '-' + index} key={place.id} className={active === index ? 'active' : ''}
              onPointerEnter={() => { interacted.current = true; }} onMouseDown={event => event.preventDefault()} onClick={() => choose(place)}>
              <span className="place-result-icon"><PlannerIcon name={place.type === 'station' ? 'train' : place.type === 'bus_stop' ? 'bus' : place.type === 'ferry_terminal' ? 'ferry' : 'pin'} size={20} /></span>
              <span><strong>{placeDisplayName(place, locale)}</strong><small>{placeDisplayAddress(place, locale)}</small></span>
              <PlannerIcon name="chevron" size={16} />
            </button>)}
          <button type="button" className="choose-place-map" onClick={() => { onFocus?.(); setOpen(false); }}><PlannerIcon name="pin" size={18} />{copy(locale, '在地圖選擇', 'Choose on map')}</button>
        </div>
      )}
    </div>
  );
}
