'use client';
import { useState } from 'react';
import { countries, regions, regionGroups, regionHref, matchingRegions, matchingRegionCity } from '../../domain/regions';
import { ChoiceDialog } from './ChoiceDialog';
import { PlannerIcon } from './PlannerIcon';

export function RegionSwitcher({ current, locale }: { current: string; locale: 'zh' | 'en' }) {
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'all' | 'countries' | 'regions'>('all');
  const en = locale === 'en', selected = regions.find(r => r.id === current) ?? regions[0];
  const matches = matchingRegions(search).filter(r => scope === 'all' || (scope === 'countries' ? r.unStatus !== 'other' : r.unStatus === 'other'));
  return <ChoiceDialog className="region-control" title={en ? 'Where are you going?' : '你想去哪裡？'} closeLabel={en ? 'Close regions' : '關閉地區選單'}
    label={<><span className="region-code">{selected.code}</span><span>{en ? selected.en : selected.zh}</span></>}>
    {close => <><label className="choice-search"><PlannerIcon name="pin" size={18} /><input autoFocus type="search" placeholder={en ? 'Country, region or city' : '搜尋國家、地區或城市'} aria-label={en ? 'Search regions' : '搜尋地區'} value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className="region-scopes" role="group" aria-label={en ? 'Browse places' : '瀏覽地點'}>
        <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>{en ? 'All' : '全部'}</button>
        <button type="button" aria-pressed={scope === 'countries'} onClick={() => setScope('countries')}>{en ? `${countries.length} countries` : `${countries.length} 個國家`}</button>
        <button type="button" aria-pressed={scope === 'regions'} onClick={() => setScope('regions')}>{en ? 'Other places' : '其他地區'}</button>
      </div>
      <p className="choice-caption">{en ? '193 UN members + Holy See (Vatican) and Palestine' : '193 個聯合國會員國＋教廷／梵蒂岡及巴勒斯坦'}</p>
      {regionGroups.map(([group, zh, english]) => {
        const items = matches.filter(r => r.group === group);
        return items.length ? <section className="region-group" key={group}><h3>{en ? english : zh}</h3><div>{items.map(r => { const city = !r.planner ? matchingRegionCity(r, search) : undefined; return <a className="region-option" key={r.id} href={regionHref(r, locale, city)} aria-current={r.id === current ? 'page' : undefined} onClick={close}>
          <span className="region-code">{r.code}</span><span><strong>{city ? (en ? city.en : city.name) : (en ? r.en : r.zh)}</strong><small>{city ? (en ? r.en : r.zh) : (en ? r.zh : r.en)}</small></span><PlannerIcon name={r.id === current ? 'check' : 'chevron'} size={17} />
        </a>; })}</div></section> : null;
      })}
      {!matches.length && <p role="status">{en ? 'No matching region. Try another name.' : '找不到相符地區，請試另一個名稱。'}</p>}
    </>}
  </ChoiceDialog>;
}
