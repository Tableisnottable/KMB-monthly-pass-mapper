'use client';
import { useState } from 'react';
import { passCatalog } from '../../domain/passCatalog';
import type { OwnedPass } from '../../domain/payment';
import { regions, matchingRegions } from '../../domain/regions';
import { PlannerIcon } from './PlannerIcon';
import { ChoiceDialog } from './ChoiceDialog';

export function PassCatalog({ passes, onAdd, locale, initialRegion = 'all' }: { passes: OwnedPass[]; onAdd: (pass: OwnedPass) => void; locale: 'zh' | 'en'; initialRegion?: string }) {
  const [region, setRegion] = useState(initialRegion), [search, setSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const en = locale === 'en', query = search.trim().toLowerCase();
  const places = regions.filter(r => r.id === initialRegion || passCatalog.some(p => p.region === r.id));
  const matches = passCatalog.filter(p => (region === 'all' || p.region === region) && [p.zh, p.en, regions.find(r => r.id === p.region)?.zh, regions.find(r => r.id === p.region)?.en].join(' ').toLowerCase().includes(query));
  return <section className="pass-catalog"><h3>{en ? 'Passes & travel cards' : '月票、日票及交通卡'} <span className="pass-catalog-count">{passCatalog.length}</span></h3>
    <label className="choice-search"><PlannerIcon name="pin" size={17} /><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={en ? 'Pass name or region' : '搜尋票券或地區'} aria-label={en ? 'Search passes' : '搜尋月票及通行證'} /></label>
    <ChoiceDialog title={en ? 'Pass country / region' : '票券國家／地區'} closeLabel={en ? 'Close pass countries' : '關閉票券地區'} label={<span>{region === 'all' ? (en ? 'All countries / regions' : '所有國家／地區') : regions.find(r => r.id === region)?.[en ? 'en' : 'zh']}</span>}>
      {close => <><label className="choice-search"><input type="search" aria-label={en ? 'Search pass countries' : '搜尋票券國家'} placeholder={en ? 'Country or region' : '搜尋國家／地區'} value={countrySearch} onChange={e => setCountrySearch(e.target.value)} /></label><div className="payment-options">
        {(!countrySearch.trim() ? [{ id: 'all', zh: '所有國家／地區', en: 'All countries / regions' }, ...matchingRegions(countrySearch)] : matchingRegions(countrySearch)).map(r => <button className="payment-option" type="button" key={r.id} aria-pressed={region === r.id} onClick={() => { setRegion(r.id); close(); }}>{en ? r.en : r.zh}</button>)}
      </div></>}
    </ChoiceDialog>
    <p>{en ? 'KMB fare rules supported; other tickets are record only. Stored-value cards are not unlimited passes. Check eligibility and sales in Official details.' : '九巴支援計價，其餘只作記錄。儲值卡並非任搭票；適用資格及發售情況請看官方資料。'}</p>
    <p role="status">{en ? `${matches.length} matching products` : `${matches.length} 款相符票券`}</p>
    {places.map(place => {
      const items = matches.filter(p => p.region === place.id);
      return items.length ? <details className="pass-catalog-region" key={place.id} open={region !== 'all' || Boolean(query) || place.id === 'hong-kong'}>
        <summary>{en ? place.en : place.zh}<span>{items.length}</span></summary>
        {items.map(p => { const owned = passes.some(item => item.id === p.id); return <article className="pass-catalog-item" key={p.id}>
          <div><strong>{en ? p.en : p.zh}</strong><small>{p.kind === 'card' ? (en ? 'Stored-value card · ' : '儲值卡 · ') : ''}{p.pricing ? (en ? 'Fare rules supported' : '支援車費計算') : (en ? 'Record only' : '只作記錄')}</small><a href={p.source} target="_blank" rel="noreferrer">{en ? 'Official details' : '官方資料'} ↗</a></div>
          <button type="button" disabled={owned || passes.length >= 20} onClick={() => onAdd({ id: p.id, name: p.en })}>{owned ? (en ? 'Added' : '已加入') : (en ? '+ Add' : '＋加入')}</button>
        </article>; })}
      </details> : null;
    })}
    {!matches.length && <p>{en ? 'No verified product in this list. You can add its name manually.' : '此清單暫無相符票券，可自行輸入名稱。'}</p>}
  </section>;
}
