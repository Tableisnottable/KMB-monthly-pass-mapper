'use client';

import { useState } from 'react';
import { PlaceAutocomplete, type PlaceResult } from './PlaceAutocomplete';

export function JourneyPlaceSearch({
  onSearch,
  searching = false,
}: {
  onSearch?: (origin: PlaceResult, destination: PlaceResult) => void;
  searching?: boolean;
}) {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [originPlace, setOriginPlace] = useState<PlaceResult | null>(null);
  const [destinationPlace, setDestinationPlace] = useState<PlaceResult | null>(null);

  function swap() {
    setOrigin(destination);
    setDestination(origin);
    setOriginPlace(destinationPlace);
    setDestinationPlace(originPlace);
  }

  const canSearch = originPlace !== null && destinationPlace !== null && !searching;

  return (
    <section className="mb-5 rounded-3xl bg-white p-4 shadow-card ring-1 ring-cm-line">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-cm-greenDark">帶我去目的地</p>
          <p className="mt-1 text-sm text-cm-muted">輸入任何地標、商場、屋苑或地址，不需要使用已儲存名稱</p>
        </div>
        <span className="rounded-full bg-cm-green/10 px-3 py-1 text-xs font-extrabold text-cm-greenDark">Hong Kong</span>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <PlaceAutocomplete
          colorClass="bg-cm-green"
          label="起點"
          onChange={(value) => {
            setOrigin(value);
            setOriginPlace(null);
          }}
          onSelect={setOriginPlace}
          value={origin}
        />
        <button
          aria-label="交換起點及目的地"
          className="flex h-10 w-10 items-center justify-center self-center rounded-full border border-cm-line bg-white text-xl text-cm-muted transition hover:border-cm-green hover:text-cm-greenDark"
          onClick={swap}
          type="button"
        >
          ⇅
        </button>
        <PlaceAutocomplete
          colorClass="bg-cm-lwb"
          label="目的地"
          onChange={(value) => {
            setDestination(value);
            setDestinationPlace(null);
          }}
          onSelect={setDestinationPlace}
          value={destination}
        />
        <button
          className="rounded-2xl bg-cm-green px-6 py-3 text-center text-sm font-extrabold text-white transition hover:bg-cm-greenDark disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canSearch}
          onClick={() => {
            if (originPlace && destinationPlace) onSearch?.(originPlace, destinationPlace);
          }}
          type="button"
        >
          {searching ? '搜尋中…' : '搜尋'}
        </button>
      </div>
      {(originPlace || destinationPlace) && (
        <p className="mt-3 text-xs text-cm-muted">
          已選地點會使用實際座標：{originPlace ? originPlace.name : origin} → {destinationPlace ? destinationPlace.name : destination}
        </p>
      )}
      <div className="mt-4">
        <p className="mb-2 text-xs text-cm-muted">下一步可在官方交通資料中配對附近站點和路線。</p>
      </div>
    </section>
  );
}
