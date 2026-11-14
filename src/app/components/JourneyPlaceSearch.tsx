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
    <p className="search-step-hint">{!places.origin ? copy(locale, '1 · 選擇起點', '1 · Choose where to start') : !places.destination ? copy(locale, '2 · 選擇目的地', '2 · Choose your destination') : copy(locale, '起點及目的地已選擇', 'Start and destination selected')}</p>
    <div className="search-fields">
      <PlaceAutocomplete label={copy(locale, '起點', 'Start')} colorClass="origin-label" locale={locale}
        value={origin} selectedPlace={places.origin} inputRef={originRef}
        onFocus={() => onFocus('origin')} onChange={value => { setOrigin(value); onInput('origin'); }}
        onSelect={place => { onSelect('origin', place); if (!places.destination) destinationRef.current?.focus(); }} />
      <PlaceAutocomplete label={copy(locale, '目的地', 'End')} colorClass="destination-label" locale={locale}
        value={destination} selectedPlace={places.destination} inputRef={destinationRef}
        onFocus={() => onFocus('destination')} onChange={value => { setDestination(value); onInput('destination'); }}
        onSelect={place => onSelect('destination', place)} />
      <button type="button" className="swap-button" aria-label={copy(locale, '交換起點及目的地', 'Swap start and destination')}
        onClick={() => { setOrigin(destination); setDestination(origin); onSwap(); }}><PlannerIcon name="swap" size={17} /></button>
    </div>
    <div className="search-place-actions"><button type="button" className="use-location-button" disabled={locating} onClick={useLocation}><PlannerIcon name="locate" size={18} />{locating ? copy(locale, '定位中…', 'Locating…') : copy(locale, '使用我的位置作起點', 'Use my location as Start')}</button></div>
    {locationError && <p className="location-error" role="status">{locationError}</p>}
    <div className="departure-options" role="group" aria-label={copy(locale, '出發時間', 'Departure time options')}>
      {(['now', 'arrive', 'depart'] as const).map(mode => <button key={mode} type="button" aria-pressed={time.mode === mode}
        className={time.mode === mode ? 'departure-now' : ''}
        onClick={() => onTimeChange({ mode, value: time.value || hongKongInputValue(new Date(Date.now() + 3600000)) })}>
        {mode === 'now' ? copy(locale, '現在', 'Now') : mode === 'arrive' ? copy(locale, '抵達', 'Arrive') : copy(locale, '出發', 'Leave')}</button>)}
      {searching && <span className="planner-spinner" aria-label={copy(locale, '正在搜尋', 'Searching')} />}
      {time.mode === 'now' && <button type="submit" className="time-apply" disabled={!places.origin || !places.destination || searching}>{copy(locale, '搜尋', 'Go')}</button>}
    </div>
    {time.mode !== 'now' && <div className="journey-time-picker">
      <label htmlFor="journey-date-time">{time.mode === 'arrive' ? copy(locale, '最遲抵達', 'Arrive by') : copy(locale, '出發時間', 'Leave at')} <small>Hong Kong · UTC+8</small></label>
      <div><input id="journey-date-time" type="datetime-local" value={time.value} required
        onInput={event => onTimeChange({ ...time, value: event.currentTarget.value })} />
        <button type="submit" className="time-apply" disabled={!places.origin || !places.destination || searching || !time.value}>{copy(locale, '搜尋', 'Plan')}</button></div>
    </div>}
    <p className="adult-fare-basis">{copy(locale, '列出成人、九巴月票及學生價 · 最便宜排序使用上方所選票價', 'Adult, KMB pass and student prices · Cheapest uses the fare selected above')}</p>
  </form>;
}
