'use client';

import { useMemo, useState } from 'react';
import { PlaceAutocomplete, type PlaceResult } from './PlaceAutocomplete';

const savedPlaces: Array<{ id: string; label: string; address: string }> = [];

function toCalendarDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function CalendarAndPlaces() {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [selectedPlace, setSelectedPlace] = useState('');
  const [originPlace, setOriginPlace] = useState<PlaceResult | null>(null);
  const [destinationPlace, setDestinationPlace] = useState<PlaceResult | null>(null);

  const calendarUrl = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(8, 0, 0, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 45);
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: `香港交通行程：${origin} → ${destination}`,
      dates: `${toCalendarDate(start)}/${toCalendarDate(end)}`,
      location: destination,
      details: '由 Transit Compass HK 建立的行程提醒。',
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }, [destination, origin]);

  return (
    <div id="places" className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-cm-line sm:p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-cm-greenDark">
            已儲存地點
          </p>
          <h3 className="mt-1 text-xl font-extrabold">下一個行程</h3>
        </div>
        <span className="rounded-full bg-cm-green/10 px-3 py-1 text-xs font-extrabold text-cm-greenDark">
          繁中（香港）
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {savedPlaces.length > 0 ? savedPlaces.map((place) => (
          <button
            className={`rounded-2xl p-3 text-left transition ${
              selectedPlace === place.id
                ? 'bg-cm-green text-white'
                : 'bg-cm-paper text-cm-ink hover:bg-cm-green/10'
            }`}
            key={place.id}
            onClick={() => {
              setSelectedPlace(place.id);
              setDestination(place.address);
            }}
            type="button"
          >
            <div className="text-sm font-extrabold">{place.label}</div>
            <div className={`mt-1 truncate text-xs ${
              selectedPlace === place.id ? 'text-white/80' : 'text-cm-muted'
            }`}>
              {place.address}
            </div>
          </button>
        )) : (
          <p className="col-span-3 rounded-2xl bg-cm-paper p-3 text-sm text-cm-muted">
            尚未儲存地點；完成搜尋後可在此加入。
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
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
        <PlaceAutocomplete
          colorClass="bg-cm-lwb"
          label="終點"
          onChange={(value) => {
            setDestination(value);
            setDestinationPlace(null);
          }}
          onSelect={setDestinationPlace}
          value={destination}
        />
      </div>

      {(originPlace || destinationPlace) && (
        <div className="mt-3 rounded-xl bg-cm-green/10 px-3 py-2 text-xs text-cm-ink">
          {originPlace && `起點座標：${originPlace.lat.toFixed(5)}, ${originPlace.lng.toFixed(5)}`}
          {originPlace && destinationPlace && ' · '}
          {destinationPlace && `終點座標：${destinationPlace.lat.toFixed(5)}, ${destinationPlace.lng.toFixed(5)}`}
        </div>
      )}
      <a
        className="mt-4 flex items-center justify-center rounded-2xl bg-cm-green px-4 py-3 text-sm font-extrabold text-white transition hover:bg-cm-greenDark"
        href={calendarUrl}
        rel="noreferrer"
        target="_blank"
      >
        加入 Google Calendar（明日 08:00）
      </a>
      {(originPlace || destinationPlace) && (
        <div className="mt-2 flex gap-2">
          {[originPlace, destinationPlace].filter((place): place is PlaceResult => Boolean(place)).map((place) => (
            <a
              className="flex-1 rounded-xl bg-cm-paper px-3 py-2 text-center text-xs font-bold text-cm-ink hover:bg-cm-green/10"
              href={place.googleMapsUrl}
              key={place.id}
              rel="noreferrer"
              target="_blank"
            >
              在 Google Maps 開啟{place.name}
            </a>
          ))}
        </div>
      )}
      <p className="mt-2 text-center text-xs text-cm-muted">
        會預填起點、終點、地點和下一個工作日行程。
      </p>
    </div>
  );
}
