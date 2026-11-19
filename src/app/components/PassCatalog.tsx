'use client';
import { useState } from 'react';
import { passCatalog } from '../../domain/passCatalog';
import type { OwnedPass } from '../../domain/payment';
import { regions } from '../../domain/regions';
import { PlannerIcon } from './PlannerIcon';

export function PassCatalog({ passes, onAdd, locale, initialRegion = 'all' }: { passes: OwnedPass[]; onAdd: (pass: OwnedPass) => void; locale: 'zh' | 'en'; initialRegion?: string }) {
  const [region, setRegion] = useState(initialRegion), [search, setSearch] = useState('');
  const en = locale === 'en', query = search.trim().toLowerCase();
  const places = regions.filter(r => r.id === initialRegion || passCatalog.some(p => p.region === r.id));
  const matches = passCatalog.filter(p => (region === 'all' || p.region === region) && [p.zh, p.en, regions.find(r => r.id === p.region)?.zh, regions.find(r => r.id === p.region)?.en].join(' ').toLowerCase().includes(query));
  return <section className="pass-catalog"><h3>{en ? 'Find a pass' : '尋找月票及通行證'}</h3>
    <label className="choice-search"><PlannerIcon name="pin" size={17} /><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={en ? 'Pass name or region' : '搜尋票券或地區'} aria-label={en ? 'Search passes' : '搜尋月票及通行證'} /></label>
    <div className="road-categories" role="group" aria-label={en ? 'Pass region' : '票券地區'}>{[{ id: 'all', zh: '全部', en: 'All' }, ...places].map(r => <button type="button" key={r.id} aria-pressed={region === r.id} onClick={() => setRegion(r.id)}>{en ? r.en : r.zh}</button>)}</div>
    <p>{en ? 'Known products with public operator links. Other than KMB, adding a pass records ownership only; fares are not discounted.' : '收錄附官方連結的已知票券。除九巴外，加入只作持有記錄，不會自動減價。'}</p>
    {matches.map(p => { const owned = passes.some(item => item.id === p.id); return <article className="pass-catalog-item" key={p.id}>
      <div><strong>{en ? p.en : p.zh}</strong><small>{en ? regions.find(r => r.id === p.region)?.en : regions.find(r => r.id === p.region)?.zh} · {p.pricing ? (en ? 'Fare rules supported' : '支援車費計算') : (en ? 'Record only' : '只作記錄')}</small><a href={p.source} target="_blank" rel="noreferrer">{en ? 'Official details' : '官方資料'} ↗</a></div>
      <button type="button" disabled={owned || passes.length >= 20} onClick={() => onAdd({ id: p.id, name: p.en })}>{owned ? (en ? 'Added' : '已加入') : (en ? '+ Add' : '＋加入')}</button>
    </article>; })}
    {!matches.length && <p>{en ? 'No verified product in this list. You can add its name manually.' : '此清單暫無相符票券，可自行輸入名稱。'}</p>}
  </section>;
}
