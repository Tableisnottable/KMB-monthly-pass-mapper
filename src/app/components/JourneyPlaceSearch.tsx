'use client';

import { useEffect, useRef, useState } from 'react';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { PlannerIcon } from './PlannerIcon';
import { copy, type JourneyField, type JourneyLocations, type PlannerLocale } from './plannerUi';
import type { PlaceResult } from './PlaceAutocomplete';
import { hongKongInputValue, type JourneyTimeSelection } from '../../engine/journeyTime';

export function JourneyPlaceSearch({ places, onInput, onSelect, onSwap, onFocus, onSearch, searching, locale, time, onTimeChange }: {
  places: JourneyLocations;
  onInput: (field: JourneyField) => void;
  onSelect: (field: JourneyField, place: PlaceResult) => void;
  onSwap: () => void;
  onFocus: (field: JourneyField) => void;
  onSearch: () => void;
  searching: boolean;
  locale: PlannerLocale;
  time: JourneyTimeSelection;
  onTimeChange: (time: JourneyTimeSelection) => void;
}) {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const originRef = useRef<HTMLInputElement>(null), destinationRef = useRef<HTMLInputElement>(null);
  const [locating, setLocating] = useState(false), [locationError, setLocationError] = useState('');
  useEffect(() => { if (places.origin) setOrigin(places.origin.name); }, [places.origin]);
  useEffect(() => { if (places.destination) setDestination(places.destination.name); }, [places.destination]);

  function useLocation() {
    setLocationError('');
    if (!navigator.geolocation) { setLocationError(copy(locale, '瀏覽器不支援定位，請輸入起點。', 'Location is unavailable. Please enter your starting point.')); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setLocating(false);
      if (coords.latitude < 22.1 || coords.latitude > 22.6 || coords.longitude < 113.8 || coords.longitude > 114.5) {
        setLocationError(copy(locale, '目前只支援香港，請輸入香港起點。', 'Only Hong Kong is supported. Please choose a Hong Kong start.')); return;
      }
      const place: PlaceResult = { id: 'current-location', name: copy(locale, '我的位置', 'My location'),
        address: '', lat: coords.latitude, lng: coords.longitude, type: 'location', googleMapsUrl: '' };
      setOrigin(place.name); onSelect('origin', place);
      if (!places.destination) destinationRef.current?.focus();
    }, () => { setLocating(false); setLocationError(copy(locale, '無法取得位置。你仍可輸入起點或在地圖上選擇。', 'Could not get your location. Type a start or choose it on the map.')); }, { timeout: 10000, maximumAge: 60000 });
  }

  return <form className="journey-search" onSubmit={event => {
    event.preventDefault();
    if (places.origin && places.destination && !searching) onSearch();
  }}>
    <div className="search-fields">
      <PlaceAutocomplete label={copy(locale, '起點', 'Start')} colorClass="origin-label" locale={locale}
        value={origin} selectedPlace={places.origin} inputRef={originRef}
        onFocus={() => onFocus('origin')} onChange={value => { setOrigin(value); onInput('origin'); }}
        onSelect={place => { onSelect('origin', place); if (!places.destination) destinationRef.current?.focus(); }} />
      <button type="button" className="swap-button" aria-label={copy(locale, '交換起點及目的地', 'Swap start and destination')}
        onClick={() => { setOrigin(destination); setDestination(origin); onSwap(); }}><PlannerIcon name="swap" size={19} /></button>
      <PlaceAutocomplete label={copy(locale, '目的地', 'End')} colorClass="destination-label" locale={locale}
        value={destination} selectedPlace={places.destination} inputRef={destinationRef}
        onFocus={() => onFocus('destination')} onChange={value => { setDestination(value); onInput('destination'); }}
        onSelect={place => onSelect('destination', place)} />
    </div>
    <div className="journey-time-controls">
      <label className="sr-only" htmlFor="journey-time-mode">{copy(locale, '出發或抵達時間', 'Departure or arrival time')}</label>
      <select id="journey-time-mode" value={time.mode} onChange={event => onTimeChange({ mode: event.target.value as JourneyTimeSelection['mode'], value: time.value || hongKongInputValue(new Date(Date.now() + 3600000)) })}>
        <option value="now">{copy(locale, '現在出發', 'Leave now')}</option><option value="depart">{copy(locale, '指定出發', 'Leave at')}</option><option value="arrive">{copy(locale, '最遲抵達', 'Arrive by')}</option>
      </select>
      {time.mode !== 'now' && <><label className="sr-only" htmlFor="journey-date-time">{copy(locale, '日期及時間（香港 UTC+8）', 'Date and time (Hong Kong UTC+8)')}</label><input id="journey-date-time" type="datetime-local" value={time.value} required onChange={event => onTimeChange({ ...time, value: event.target.value })} /></>}
      {searching && <span className="planner-spinner" aria-label={copy(locale, '正在搜尋', 'Searching')} />}
      <button type="submit" className="time-apply" disabled={!places.origin || !places.destination || searching || (time.mode !== 'now' && !time.value)}>{copy(locale, '搜尋', 'Go')}</button>
    </div>
    <div className="search-place-actions"><button type="button" className="use-location-button" disabled={locating} onClick={useLocation}><PlannerIcon name="locate" size={16} />{locating ? copy(locale, '定位中…', 'Locating…') : copy(locale, '我的位置作起點', 'Start at my location')}</button><span>Hong Kong · UTC+8</span></div>
    {locationError && <p className="location-error" role="status">{locationError}</p>}
  </form>;
}
