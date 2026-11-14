'use client';

import { useEffect, useState } from 'react';
import { transportFetch } from '../../browser/transportClient';
import type { TravelMode, TravelOption } from '../../domain/travelOptions';
import { travelClock } from '../../domain/travelOptions';
import { hongKongTimeLabel, type JourneyTimeSelection } from '../../engine/journeyTime';
import { copy, type JourneyLocations, type PlannerLocale } from './plannerUi';
import { fareProfileLabel } from './FareProfileControl';
import type { FareProfile } from '../../domain/journeyFares';
import { PlannerIcon } from './PlannerIcon';
import { JourneyEndpoints } from './JourneyEndpoints';
import type { RoutePreferences } from '../../domain/routePreferences';

export const travelModeLabel = (mode: TravelMode, locale: PlannerLocale) => mode === 'walk' ? copy(locale, '步行', 'Walk')
  : mode === 'cycle' ? copy(locale, '單車', 'Cycle') : mode === 'drive' ? copy(locale, '駕駛', 'Driving') : copy(locale, '的士', 'Taxi');
const icon = (mode: TravelMode) => mode === 'taxi' || mode === 'drive' ? 'car' : mode;

export function useTravelOptions(places: JourneyLocations, modes: TravelMode[] = ['walk', 'cycle', 'taxi', 'drive'], preferences?: RoutePreferences) {
  const [state, setState] = useState<{ key: string; options: TravelOption[]; loading: boolean }>({ key: '', options: [], loading: false });
  const key = places.origin && places.destination && modes.length ? [places.origin.lat, places.origin.lng, places.destination.lat, places.destination.lng].join(',') + '|' + modes.join(',') + '|' + JSON.stringify(preferences ?? {}) : '';
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    setState({ key, options: [], loading: true });
    const [coordinates, selectedModes, selectedPreferences] = key.split('|');
    const values = coordinates.split(',');
    const params = new URLSearchParams(Object.fromEntries(['fromLat', 'fromLon', 'toLat', 'toLon'].map((name, i) => [name, values[i]])));
    params.set('modes', selectedModes);
    params.set('preferences', selectedPreferences);
    transportFetch('/api/travel-options?' + params, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Travel options unavailable');
      const payload = await response.json() as { data: TravelOption[] };
      if (!controller.signal.aborted) setState({ key, options: payload.data, loading: false });
    }).catch(() => { if (!controller.signal.aborted) setState({ key, options: [], loading: false }); });
    return () => controller.abort();
  }, [key]);
  return state.key === key ? state : { key, options: [], loading: Boolean(key) };
}

export function QuickTravelOptions({ options, loading, onChoose, locale, modes = ['walk', 'cycle', 'taxi', 'drive'] }: {
  options: TravelOption[]; loading: boolean; onChoose: (option: TravelOption) => void; locale: PlannerLocale; modes?: TravelMode[];
}) {
  return <div className="quick-modes" data-count={modes.length} style={{ gridTemplateColumns: `repeat(${modes.length}, minmax(0, 1fr))` }} aria-label={copy(locale, '步行、單車、的士及駕駛時間估算', 'Walking, cycling, taxi and driving time estimates')}>
    {modes.map(mode => {
      const option = options.find(o => o.mode === mode);
      return <button key={mode} type="button" disabled={!option?.available} onClick={() => { if (option?.available) onChoose(option); }}
        aria-label={travelModeLabel(mode, locale) + (option?.available ? ', ' + option.minutes + ' ' + copy(locale, '分鐘（估算）', 'minutes (estimated)') : ', ' + (loading ? copy(locale, '正在計算', 'calculating') : copy(locale, '未有可用路徑', 'route unavailable')))}>
        <PlannerIcon name={icon(mode)} size={25} /><span>{loading ? '…' : option?.available ? option.minutes : '—'}<small>{copy(locale, '分鐘', 'min')}</small></span>
        <strong>{travelModeLabel(mode, locale)}</strong><small>{loading ? copy(locale, '計算中', 'Loading') : option?.available ? copy(locale, '估算', 'Estimate') : copy(locale, '無路徑資料', 'Unavailable')}</small>
      </button>;
    })}
  </div>;
}

export function TravelOptionDetails({ option, places, locale, time, profile, onBack, onMap }: {
  option: TravelOption; places: JourneyLocations; locale: PlannerLocale; time: JourneyTimeSelection;
  profile: FareProfile; onBack: () => void; onMap: () => void;
}) {
  const [now] = useState(() => Date.now());
  const clock = travelClock(option, time.mode, time.value, now);
  return <section className="trip-panel" id="journey" aria-label={copy(locale, '行程詳情', 'Journey details')}>
    <div className="trip-heading"><button className="all-results-button" onClick={onBack}>{copy(locale, '所有行程結果', 'All journey results')}<PlannerIcon name="chevron" size={14} /></button>
      <JourneyEndpoints places={places} /></div>
    <div className="trip-summary"><PlannerIcon name={icon(option.mode)} size={28} /><strong>{travelModeLabel(option.mode, locale)}</strong><span className="route-duration">{option.minutes}<small>{copy(locale, '分鐘（估算）', 'min (estimated)')}</small></span></div>
    <div className="trip-fare-comparison">{option.mode === 'drive' ? <p className="driving-cost-note">{copy(locale, '油費、隧道費及泊車費另計；未有費用估算。', 'Fuel, tolls and parking are extra; no cost estimate is available.')}</p> : <div className="fare-comparison">{(['adult', 'selected'] as const).map(value => <span key={value} className={value === 'selected' ? 'fare-selected' : ''}><span>{value === 'selected' ? copy(locale, '所選付款', 'Selected payment') : fareProfileLabel('adult', locale)}</span>
      <strong>{option.mode === 'taxi' ? copy(locale, '按咪錶', 'Metered') : '$0.00'}</strong></span>)}</div>}</div>
    <button className="mobile-map-toggle" onClick={onMap}><PlannerIcon name="monitor" size={15} />{copy(locale, '顯示地圖', 'Show Map')}</button>
    <div className="route-details"><h4>{copy(locale, '路徑時間估算', 'Estimated route time')}</h4>
      {clock && <p className="journey-clock-summary">{hongKongTimeLabel(clock.departure)} → {hongKongTimeLabel(clock.arrival)} <small>Hong Kong time</small></p>}
      <p>{((option.distanceMetres ?? 0) / 1000).toFixed(1)} km · {option.minutes} {copy(locale, '分鐘', 'min')}</p>
      {option.mode === 'drive' && places.origin && places.destination && <p><a className="driving-directions-link" target="_blank" rel="noreferrer" href={'https://www.google.com/maps/dir/?' + new URLSearchParams({ api: '1', origin: `${places.origin.lat},${places.origin.lng}`, destination: `${places.destination.lat},${places.destination.lng}`, travelmode: 'driving' })}>{copy(locale, '開啟駕駛導航', 'Open driving directions')} ↗</a></p>}
      <p className="fare-explanation">{option.mode === 'drive'
        ? copy(locale, '私家車道路路徑及時間估算，並非即時交通或車道導航。未計塞車、泊車及油費；公共交通的公司、道路偏好及票價設定不適用。請按實際路牌及道路限制行駛。', 'Estimated private-car route and time, not live traffic or lane guidance. Congestion, parking and fuel are excluded. Public-transport company, road preference and fare settings do not apply. Follow actual road signs and restrictions.')
        : option.mode === 'taxi'
        ? copy(locale, '以道路行車路徑估算，並非即時交通或叫車服務；不包括候車、塞車及停站時間。車費按咪錶，另有隧道及其他附加費；月票及學生身分不提供的士折扣。', 'Road-route estimate, not live traffic or a taxi booking. Taxi waiting, congestion and stops are excluded. The meter, tolls and other charges determine the fare; the pass and student status do not discount taxis.')
        : option.mode === 'cycle' ? copy(locale, '以單車路徑及一般速度估算，假設自備單車，不包括租車或渡輪費用。出發前請確認道路限制、實際通行及可能的渡輪接駁。', 'Cycling-profile estimate assuming your own bicycle, excluding hire and ferry charges. Check access restrictions, conditions and any ferry connections before travelling.')
          : copy(locale, '以步行路徑及一般步速估算，並非無障礙認證；可能包括樓梯或渡輪，未包括休息及渡輪費用。', 'Footpath estimate at a typical walking pace, not a step-free guarantee. Routes may include stairs or ferries; breaks and ferry fares are excluded.')}</p>
      <p className="fare-explanation">© OpenStreetMap contributors · FOSSGIS / OSRM</p>
    </div>
  </section>;
}
