'use client';
import { useState } from 'react';
import { countries, regions, regionGroups, regionHref, matchingRegions, matchingRegionCity, type BrowseRegion } from '../../domain/regions';
import { ChoiceDialog } from './ChoiceDialog';
import { PlannerIcon } from './PlannerIcon';
import styles from './RegionSwitcher.module.css';

const shortcuts = ['HK', 'MO', 'TW', 'JP', 'KR'].flatMap(code => regions.filter(region => region.code === code));

export function RegionSwitcher({ current, locale }: { current: string; locale: 'zh' | 'en' }) {
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const en = locale === 'en', selected = regions.find(r => r.id === current) ?? regions[0];
  const t = (zh: string, english: string) => en ? english : zh;
  const searching = !!search.trim();
  const matches = matchingRegions(search).filter(region => searching || !group || region.group === group);
  function option(region: BrowseRegion, close: () => void) {
    const city = !region.planner ? matchingRegionCity(region, search) : undefined;
    return <a className="region-option" key={region.id} href={regionHref(region, locale, city)}
      aria-current={region.id === current ? 'page' : undefined} onClick={close}>
      <span className="region-code">{region.code}</span>
      <span><strong>{city ? t(city.name, city.en) : t(region.zh, region.en)}</strong>
        <small>{city ? t(region.zh, region.en) : t(region.en, region.zh)}</small></span>
      <PlannerIcon name={region.id === current ? 'check' : 'chevron'} size={17} />
    </a>;
  }
  return <ChoiceDialog className={`region-control ${styles.control}`} title={t('選擇地區', 'Choose a place')} closeLabel={t('關閉地區選單', 'Close regions')}
    label={<><span className="region-code">{selected.code}</span><span>{en ? selected.en : selected.zh}</span></>}>
    {close => <>
      <div className={styles.search}>
        <label className="choice-search"><PlannerIcon name="pin" size={18} /><input type="search"
          placeholder={t('搜尋國家、地區或城市', 'Country, region or city')}
          aria-label={t('搜尋地區', 'Search regions')} value={search} onChange={event => setSearch(event.target.value)} /></label>
      </div>
      {!searching && <>
        <section className={styles.shortcuts}>
          <h3>{t('快速選擇', 'Quick picks')}</h3>
          <div>{shortcuts.map(region => <a key={region.id} href={regionHref(region, locale)}
            aria-current={region.id === current ? 'page' : undefined} onClick={close}>{t(region.zh, region.en)}</a>)}</div>
        </section>
        <label className={styles.browse}>
          <span>{t(`全球地圖 · ${countries.length} 個國家`, `World map · ${countries.length} countries`)}</span>
          <select aria-label={t('按地理區域瀏覽', 'Browse by region')} value={group} onChange={event => setGroup(event.target.value)}>
            <option value="">{t('所有地區', 'All regions')}</option>
            {regionGroups.map(([id, zh, english]) => <option key={id} value={id}>{t(zh, english)}</option>)}
          </select>
        </label>
      </>}
      {regionGroups.map(([id, zh, english]) => {
        const items = matches.filter(region => region.group === id);
        return items.length ? <section className={`region-group ${styles.group}`} key={id}>
          <h3>{t(zh, english)}</h3><div>{items.map(region => option(region, close))}</div>
        </section> : null;
      })}
      {!matches.length && <p role="status">{t('找不到相符地區。', 'No matching places.')}</p>}
    </>}
  </ChoiceDialog>;
}
