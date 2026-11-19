'use client';
import { useState } from 'react';
import { regions, regionGroups, regionHref } from '../../domain/regions';
import { ChoiceDialog } from './ChoiceDialog';
import { PlannerIcon } from './PlannerIcon';

export function RegionSwitcher({ current, locale }: { current: string; locale: 'zh' | 'en' }) {
  const [search, setSearch] = useState('');
  const en = locale === 'en', selected = regions.find(r => r.id === current) ?? regions[0];
  const query = search.trim().toLocaleLowerCase();
  const matches = regions.filter(r => [r.zh, r.en, r.code, ...r.cities.flatMap(c => [c.name, c.en])].join(' ').toLocaleLowerCase().includes(query));
  return <ChoiceDialog className="region-control" title={en ? 'Where are you going?' : '你想去哪裡？'} closeLabel={en ? 'Close regions' : '關閉地區選單'}
    label={<><span className="region-code">{selected.code}</span><span>{en ? selected.en : selected.zh}</span></>}>
    {close => <><label className="choice-search"><PlannerIcon name="pin" size={18} /><input type="search" placeholder={en ? 'Country, region or city' : '搜尋國家、地區或城市'} aria-label={en ? 'Search regions' : '搜尋地區'} value={search} onChange={event => setSearch(event.target.value)} /></label>
      <p className="choice-caption">{en ? 'Hong Kong & Macao: planner · Other regions: open map directory' : '香港、澳門可規劃行程 · 其他地區提供開放地圖查閱'}</p>
      {regionGroups.map(([group, zh, english]) => {
        const items = matches.filter(r => r.group === group);
        return items.length ? <section className="region-group" key={group}><h3>{en ? english : zh}</h3><div>{items.map(r => <a className="region-option" key={r.id} href={regionHref(r, locale)} aria-current={r.id === current ? 'page' : undefined} onClick={close}>
          <span className="region-code">{r.code}</span><span><strong>{en ? r.en : r.zh}</strong><small>{en ? r.zh : r.en}</small></span><PlannerIcon name={r.id === current ? 'check' : 'chevron'} size={17} />
        </a>)}</div></section> : null;
      })}
      {!matches.length && <p role="status">{en ? 'No matching region. Try another name.' : '找不到相符地區，請試另一個名稱。'}</p>}
    </>}
  </ChoiceDialog>;
}
