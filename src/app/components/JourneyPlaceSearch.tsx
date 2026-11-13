'use client';

import { useEffect, useState } from 'react';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { PlannerIcon } from './PlannerIcon';
import { copy, type JourneyField, type JourneyLocations, type PlannerLocale } from './plannerUi';
import type { PlaceResult } from './PlaceAutocomplete';

export function JourneyPlaceSearch({ places, onInput, onSelect, onSwap, onFocus, onSearch, searching, locale }: {
  places: JourneyLocations;
  onInput: (field: JourneyField) => void;
  onSelect: (field: JourneyField, place: PlaceResult) => void;
  onSwap: () => void;
  onFocus: (field: JourneyField) => void;
  onSearch: () => void;
  searching: boolean;
  locale: PlannerLocale;
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
      <button type="submit" className="departure-now" disabled={!places.origin || !places.destination || searching}
        title={copy(locale, '使用現在出發的班次', 'Plan using current departures')}>{copy(locale, '現在', 'Now')}</button>
      <button type="button" disabled title={copy(locale, '目前只支援現在出發', 'Currently supports leaving now only')}>{copy(locale, '抵達', 'Arrive')}</button>
      <button type="button" disabled title={copy(locale, '目前只支援現在出發', 'Currently supports leaving now only')}>{copy(locale, '出發', 'Leave')}</button>
      {searching && <span className="planner-spinner" aria-label={copy(locale, '正在搜尋', 'Searching')} />}
    </div>
  </form>;
}
