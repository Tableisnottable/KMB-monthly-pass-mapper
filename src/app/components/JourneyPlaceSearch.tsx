'use client';

import { useState } from 'react';
import { PlaceAutocomplete, type PlaceResult } from './PlaceAutocomplete';
import { PlannerIcon } from './PlannerIcon';
import { copy, type PlannerLocale } from './plannerUi';

export function JourneyPlaceSearch({ onSearch, onEdit, searching = false, locale = 'zh' }: {
  onSearch?: (origin: PlaceResult, destination: PlaceResult) => void;
  onEdit?: () => void;
  searching?: boolean;
  locale?: PlannerLocale;
}) {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [originPlace, setOriginPlace] = useState<PlaceResult | null>(null);
  const [destinationPlace, setDestinationPlace] = useState<PlaceResult | null>(null);

  return (
    <form className="journey-search" onSubmit={event => {
      event.preventDefault();
      if (originPlace && destinationPlace && !searching) onSearch?.(originPlace, destinationPlace);
    }}>
      <div className="search-fields">
        <PlaceAutocomplete locale={locale} colorClass="origin-dot" label={copy(locale, '起點', 'From')}
          value={origin} onChange={value => { setOrigin(value); setOriginPlace(null); onEdit?.(); }} onSelect={setOriginPlace} />
        <PlaceAutocomplete locale={locale} colorClass="destination-dot" label={copy(locale, '目的地', 'To')}
          value={destination} onChange={value => { setDestination(value); setDestinationPlace(null); onEdit?.(); }} onSelect={setDestinationPlace} />
        <button type="button" className="swap-button" aria-label={copy(locale, '交換起點及目的地', 'Swap origin and destination')}
          disabled={searching} onClick={() => {
            setOrigin(destination); setDestination(origin); setOriginPlace(destinationPlace); setDestinationPlace(originPlace);
            onEdit?.();
          }}><PlannerIcon name="swap" size={16} /></button>
      </div>
      <div className="departure-note"><PlannerIcon name="clock" size={15} /><span>{copy(locale, '現在出發', 'Leave now')}</span><span className="departure-zone">HONG KONG · UTC+8</span></div>
      <button type="submit" className="search-button" disabled={!originPlace || !destinationPlace || searching}>
        {searching ? <span className="planner-spinner" /> : <PlannerIcon name="arrow" size={19} />}
        {copy(locale, searching ? '正在搜尋路線…' : '搜尋路線', searching ? 'Finding your routes…' : 'Find my way')}
      </button>
      <p className="search-help">{copy(locale, '從搜尋建議中選擇起點及目的地。', 'Choose your start and destination from the suggestions.')}</p>
    </form>
  );
}
