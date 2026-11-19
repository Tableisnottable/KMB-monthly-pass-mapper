'use client';
import { useState } from 'react';
import { corridorChoices, strategicRouteDetails, roadLevel, type RoutePreferences, type CorridorGroup } from '../../domain/routePreferences';
import { PreferenceToggle } from './PreferenceToggle';
import { PlannerIcon } from './PlannerIcon';

const categories = [['all', '全部', 'All'], ['tunnel', '隧道', 'Tunnels'], ['bridge', '橋樑', 'Bridges'], ['road', '主要道路', 'Main roads'], ['strategic', '幹線', 'Routes']] as const;
const areas: Record<CorridorGroup, [string, string]> = {
  strategic: ['幹線', 'Strategic routes'], harbour: ['過海', 'Cross-harbour'], shatin: ['沙田', 'Sha Tin'], airport: ['機場、青衣', 'Airport / Tsing Yi'],
  northwest: ['新界西北', 'Northwest NT'], tko: ['將軍澳', 'Tseung Kwan O'], south: ['港島', 'Hong Kong Island'], kowloon: ['九龍', 'Kowloon'],
  northeast: ['新界東北', 'Northeast NT'], saikung: ['西貢', 'Sai Kung'], lantau: ['大嶼山', 'Lantau'],
};
const rows = (Object.keys(corridorChoices) as CorridorGroup[]).flatMap(group => corridorChoices[group].map(([id, zh, en]) => ({
  id, group, zh: id === 'eaglesnest' ? '尖山隧道' : zh, en,
  category: group === 'strategic' ? 'strategic' : /隧道/.test(zh) ? 'tunnel' : /橋/.test(zh) || id === 'lantau' ? 'bridge' : 'road',
}))).sort((a, b) => ['tunnel', 'bridge', 'road', 'strategic'].indexOf(a.category) - ['tunnel', 'bridge', 'road', 'strategic'].indexOf(b.category));

export function RoadPreferences({ value, onChange, locale }: { value: RoutePreferences; onChange: (value: RoutePreferences) => void; locale: 'zh' | 'en' }) {
  const [search, setSearch] = useState(''), [category, setCategory] = useState('all');
  const en = locale === 'en', query = search.trim().toLowerCase();
  const set = (id: string, level: 'normal' | 'must' | 'ban' | 'prefer') => onChange({ ...value, roads: { ...value.roads, [id]: level },
    // Clear an old single-choice preference when resetting that same corridor.
    ...Object.fromEntries((['harbour', 'shatin', 'airport'] as const).filter(group => value[group] === id).map(group => [group, ''])) });
  const selected = rows.filter(row => roadLevel(value, row.id) !== 'normal');
  const filtered = rows.filter(row => (category === 'all' || category === row.category) && [row.zh, row.en, row.id, ...areas[row.group],
    ...(strategicRouteDetails.find(r => r.id === row.id)?.path ?? []), ...(strategicRouteDetails.find(r => r.id === row.id)?.pathEn ?? [])].join(' ').toLowerCase().includes(query));
  return <section className="road-picker">
    <div className="settings-section-intro"><h3>{en ? 'Which roads?' : '想經過或避開哪些道路？'}</h3><p>{en ? 'Ban excludes it. Must requires a matching corridor; roads within the same area group are alternatives.' : '禁用會排除該道路。必須會限制途經道路；同一地區的多個必須項目擇一即可。'}</p></div>
    {!!selected.length && <div className="road-selected"><div><strong>{en ? 'Your choices' : '已選道路'} <small>{selected.length}</small></strong><button type="button" onClick={() => onChange({ harbour: '', shatin: '', airport: '', roads: {} })}>{en ? 'Clear roads' : '清除道路設定'}</button></div>
      <div className="road-selected-tags">{selected.map(row => <button type="button" key={row.id} data-level={roadLevel(value, row.id)} onClick={() => set(row.id, 'normal')} aria-label={(en ? 'Clear ' : '清除') + (en ? row.en : row.zh)}>{roadLevel(value, row.id) === 'ban' ? (en ? 'Ban' : '禁用') : roadLevel(value, row.id) === 'must' ? (en ? 'Must' : '必須') : (en ? 'Prefer' : '偏好')} · {en ? row.en : row.zh}<PlannerIcon name="close" size={13} /></button>)}</div>
    </div>}
    <label className="choice-search road-search"><PlannerIcon name="pin" size={18} /><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={en ? 'Road, tunnel, bridge or area' : '搜尋道路、隧道、橋樑或地區'} aria-label={en ? 'Search road list' : '搜尋道路清單'} /></label>
    <div className="road-categories" role="group" aria-label={en ? 'Road categories' : '道路分類'}>{categories.map(([id, zh, english]) => <button type="button" key={id} aria-pressed={category === id} onClick={() => setCategory(id)}>{en ? english : zh}</button>)}</div>
    <p className="road-result-count" role="status">{filtered.length} {en ? 'roads' : '項道路'}</p>
    <div className="road-list">{filtered.map(row => {
      const route = strategicRouteDetails.find(r => r.id === row.id);
      return <article className="road-list-item" key={row.id}>
        <small>{en ? areas[row.group][1] : areas[row.group][0]}</small>
        <PreferenceToggle label={en ? row.en : row.zh} value={roadLevel(value, row.id)} positive="must" locale={locale} onChange={level => set(row.id, level)} />
        {row.id === 'lantau' && <small>{en ? 'Tsing Ma Bridge + Kap Shui Mun Bridge' : '青馬大橋、汲水門大橋（整段選擇）'}</small>}
        {route && <details className="road-route-detail"><summary><span className="strategic-route-number" style={{ backgroundColor: route.color }}>{row.id.replace('route', '')}</span>{en ? route.ends[1] : route.ends[0]}<PlannerIcon name="chevron" size={12} /></summary><p>{(en ? route.pathEn : route.path).join(' · ')}</p></details>}
      </article>;
    })}</div>
    {!filtered.length && <p role="status">{en ? 'No match. Try another road or clear the category.' : '找不到相符道路，請試其他名稱或選「全部」。'}</p>}
    <p className="settings-inline-note">{en ? 'Applies to all journey types. Walking and cycling still follow access restrictions.' : '適用於所有行程類型；步行及單車仍須遵守通行限制。'}</p>
  </section>;
}
