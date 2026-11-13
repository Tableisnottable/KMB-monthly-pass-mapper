'use client';

import { useEffect, useState } from 'react';
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
  useEffect(() => { if (places.origin) setOrigin(places.origin.name); }, [places.origin]);
  useEffect(() => { if (places.destination) setDestination(places.destination.name); }, [places.destination]);

  return <form className="journey-search" onSubmit={event => {
    event.preventDefault();
    if (places.origin && places.destination && !searching) onSearch();
  }}>
    <div className="search-fields">
      <PlaceAutocomplete label={copy(locale, '起點', 'Start')} colorClass="origin-label" locale={locale}
        value={origin} selectedPlace={places.origin}
        onFocus={() => onFocus('origin')} onChange={value => { setOrigin(value); onInput('origin'); }}
        onSelect={place => onSelect('origin', place)} />
      <PlaceAutocomplete label={copy(locale, '目的地', 'End')} colorClass="destination-label" locale={locale}
        value={destination} selectedPlace={places.destination}
        onFocus={() => onFocus('destination')} onChange={value => { setDestination(value); onInput('destination'); }}
        onSelect={place => onSelect('destination', place)} />
      <button type="button" className="swap-button" aria-label={copy(locale, '交換起點及目的地', 'Swap start and destination')}
        onClick={() => { setOrigin(destination); setDestination(origin); onSwap(); }}><PlannerIcon name="swap" size={17} /></button>
    </div>
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
    <p className="adult-fare-basis">{copy(locale, '普通成人票價 · 港鐵使用成人八達通', 'Normal adult fares · Adult Octopus for rail')}</p>
  </form>;
}
