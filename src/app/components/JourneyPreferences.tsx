import { allOperatorIds, selectableOperators } from '../../domain/operatorSelection';
import { corridorChoices, roadLevel, type CorridorGroup, type RoutePreferences } from '../../domain/routePreferences';
import { PreferenceToggle } from './PreferenceToggle';
import { copy, type PlannerLocale } from './plannerUi';
export type CompanyLevel = 'must' | 'normal' | 'ban';
export type CompanyPreferences = Record<string, CompanyLevel>;
export const defaultCompanies = (): CompanyPreferences => Object.fromEntries(allOperatorIds.map(id => [id, 'normal']));
export type SettingsSection = 'companies' | 'roads' | 'changes' | 'importance';
const companyOrder = ['KMB', 'LWB', 'CTB', 'MTR', 'LRT', 'LRTFeeder', 'GMB', 'NLB', 'TRAM', 'FERRY', 'PTRAM', 'DB', 'PI', 'XB'];
const companiesInOrder = [...selectableOperators].sort((a, b) => companyOrder.indexOf(a.id) - companyOrder.indexOf(b.id));
const groupLabels: Record<CorridorGroup, [string, string]> = {
  harbour: ['過海', 'Cross-harbour'], shatin: ['往返沙田', 'To/from Sha Tin'], airport: ['往返機場', 'To/from airport'],
  northwest: ['新界西北', 'Northwest New Territories'], tko: ['往返將軍澳', 'To/from Tseung Kwan O'], south: ['港島南', 'South Hong Kong Island'],
};

export function JourneyPreferences({ section, companies, onCompanies, corridors, onCorridors, changeMinutes, onChangeMinutes, locale }: {
  section: SettingsSection; companies: CompanyPreferences; onCompanies: (value: CompanyPreferences) => void;
  corridors: RoutePreferences; onCorridors: (value: RoutePreferences) => void;
  changeMinutes: number; onChangeMinutes: (value: number) => void; locale: PlannerLocale;
}) {
  return <section className="journey-preferences">
    {section === 'changes' && <><h3>{copy(locale, '預留多少轉乘時間？', 'How much time to change?')}</h3>
      <label className="corridor-select"><span>{copy(locale, '最少轉乘時間', 'Minimum time to change')}</span><select value={changeMinutes} onChange={event => onChangeMinutes(Number(event.target.value))}>
        {[3, 5, 10, 15, 20, 30].map(minutes => <option value={minutes} key={minutes}>{minutes} {copy(locale, '分鐘', 'minutes')}</option>)}</select></label>
      <p>{copy(locale, '保留實際轉乘步行，額外緩衝計入候車。較長時間可能排除緊接班次，並改變推薦結果。', 'Actual transfer walking stays unchanged; extra buffer counts as waiting. A longer buffer can rule out tight connections and change recommendations.')}</p></>}
    {section === 'companies' && <><h3>{copy(locale, '選擇交通公司', 'Choose transport companies')}</h3>
      <p>{copy(locale, '× 禁止 · ／ 正常 · ✓ 必須。每間設為必須的公司都要出現。', '× Ban · ／ Normal · ✓ Must. Every company set to Must must appear.')}</p>
      <div className="company-shortcuts"><button type="button" onClick={() => onCompanies(defaultCompanies())}>{copy(locale, '全部正常', 'All normal')}</button>
        <button type="button" onClick={() => onCompanies(Object.fromEntries(allOperatorIds.map(id => [id, id === 'KMB' ? 'must' : 'ban'])))}>{copy(locale, '只用九巴', 'KMB only')}</button>
        <button type="button" onClick={() => onCompanies(Object.fromEntries(allOperatorIds.map(id => [id, ['KMB', 'LWB'].includes(id) ? 'normal' : 'ban'])))}>{copy(locale, '九巴及龍運', 'KMB + Long Win')}</button></div>
      <div className="company-preferences">{companiesInOrder.map(company => <PreferenceToggle key={company.id} label={locale === 'en' ? company.nameEn : company.nameTc}
        value={companies[company.id] ?? 'normal'} positive="must" locale={locale} onChange={level => onCompanies({ ...companies, [company.id]: level })} />)}</div>
      <p>{copy(locale, '聯營路線須所有營辦商均未被禁止。只用九巴不包括龍運或九巴／城巴聯營線。', 'Joint routes require all their companies to be allowed. KMB only excludes Long Win and KMB/Citybus joint routes.')}</p></>}
    {section === 'roads' && <><h3>{copy(locale, '選擇道路', 'Choose road corridors')}</h3>
      <p>{copy(locale, '× 禁止 · ／ 正常 · ✓ 較喜歡。可選多條偏好道路，並非強制必經。', '× Ban · ／ Normal · ✓ Prefer. You can prefer several alternatives; preference is not a requirement.')}</p>
      {(Object.keys(corridorChoices) as CorridorGroup[]).map(group => <fieldset className="road-preferences-group" key={group}><legend>{copy(locale, ...groupLabels[group])}</legend>
        {corridorChoices[group].map(([id, zh, en]) => <PreferenceToggle key={id} label={copy(locale, zh, en)} locale={locale} positive="prefer" value={roadLevel(corridors, id)}
          onChange={level => onCorridors({ ...corridors, roads: { ...corridors.roads, [id]: level } })} />)}</fieldset>)}
      <p>{copy(locale, '只適用於已辨認的公共交通道路路段。偏好為同組其他道路加 15 分；禁止於搜尋時排除該路段。鐵路、渡輪、未辨認道路及獨立步行／單車／的士估算不受影響，並非涵蓋全港所有道路。', 'Applies to identified transit road segments. Prefer adds 15 points to other roads in the same group; Ban excludes the travelled segment during search. Rail, ferries, unclassified roads and separate walk/cycle/taxi estimates are unaffected. This does not cover every Hong Kong road.')}</p></>}
  </section>;
}
