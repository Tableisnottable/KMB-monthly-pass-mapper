import { allOperatorIds, selectableOperators } from '../../domain/operatorSelection';
import { corridorChoices, roadLevel, type CorridorGroup, type RoutePreferences } from '../../domain/routePreferences';
import { PreferenceToggle } from './PreferenceToggle';
import { copy, type PlannerLocale } from './plannerUi';
import { changeMinuteChoices, comparisonTypes, transitTypes, type ComparisonPreferences, type TransportPreferences } from '../../domain/transportSelection';
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

export function JourneyPreferences({ section, companies, onCompanies, transport, onTransport, comparisons, onComparisons, corridors, onCorridors, changeMinutes, onChangeMinutes, locale }: {
  section: SettingsSection; companies: CompanyPreferences; onCompanies: (value: CompanyPreferences) => void;
  transport: TransportPreferences; onTransport: (value: TransportPreferences) => void;
  comparisons: ComparisonPreferences; onComparisons: (value: ComparisonPreferences) => void;
  corridors: RoutePreferences; onCorridors: (value: RoutePreferences) => void;
  changeMinutes: number; onChangeMinutes: (value: number) => void; locale: PlannerLocale;
}) {
  return <section className="journey-preferences">
    {section === 'changes' && <><h3>{copy(locale, '預留多少轉乘時間？', 'How much time to change?')}</h3>
      <label className="corridor-select"><span>{copy(locale, '最少轉乘時間（0–60 分鐘）', 'Minimum time to change (0–60 minutes)')}</span><select value={changeMinutes} onChange={event => onChangeMinutes(Number(event.target.value))}>
        {changeMinuteChoices.map(minutes => <option value={minutes} key={minutes}>{minutes} {copy(locale, '分鐘', 'minutes')}</option>)}</select></label>
      <p>{copy(locale, '可選 0–60 分鐘，每次 1 分鐘。0 分鐘不加額外緩衝，仍保留實際轉乘步行；額外緩衝計入候車。較長時間可能排除緊接班次，並改變推薦結果。', 'Choose 0–60 minutes in 1-minute steps. Zero adds no extra buffer; actual transfer walking stays unchanged. Extra buffer counts as waiting. Longer buffers can rule out tight connections and change recommendations.')}</p></>}
    {section === 'companies' && <><h3>{copy(locale, '交通方式及公司', 'Transport types & companies')}</h3>
      <details className="transport-settings-group" open><summary>{copy(locale, '公共交通種類', 'Public transport types')}</summary>
        <p>{copy(locale, '× 禁止 · ／ 正常 · ✓ 必須。每種設為必須的交通方式都要出現；公司設定也會同時生效。', '× Ban · ／ Normal · ✓ Must. Every required transport type must appear. Company rules also apply.')}</p>
        {transitTypes.map(type => <PreferenceToggle key={type.id} label={locale === 'en' ? type.nameEn : type.nameTc} locale={locale}
          value={transport[type.id]} positive="must" onChange={level => onTransport({ ...transport, [type.id]: level })} />)}
      </details>
      <details className="transport-settings-group"><summary>{copy(locale, '步行、單車及的士', 'Walking, cycling & taxi')}</summary>
        <p>{copy(locale, '選擇顯示及計算哪些獨立行程估算。關閉全程步行不會移除公共交通行程所需的接駁步行。', 'Choose which separate journey estimates to calculate and show. Hiding walking comparisons keeps the walking needed to reach and change public transport.')}</p>
        {comparisonTypes.map(type => <label className="comparison-preference" key={type.id}><span>{locale === 'en' ? type.nameEn : type.nameTc}</span>
          <input type="checkbox" checked={comparisons[type.id]} onChange={event => onComparisons({ ...comparisons, [type.id]: event.target.checked })} /></label>)}
        <p>{copy(locale, '的士時間為道路估算，車費按咪錶；單車路徑不保證可安全通行。', 'Taxi times are road estimates and fares are metered. Cycling paths are not verified for safety.')}</p>
      </details>
      <details className="transport-settings-group"><summary>{copy(locale, '交通公司', 'Transport companies')}</summary>
      <p>{copy(locale, '× 禁止 · ／ 正常 · ✓ 必須。每間設為必須的公司都要出現。', '× Ban · ／ Normal · ✓ Must. Every company set to Must must appear.')}</p>
      <div className="company-shortcuts"><button type="button" onClick={() => onCompanies(defaultCompanies())}>{copy(locale, '全部正常', 'All normal')}</button>
        <button type="button" onClick={() => onCompanies(Object.fromEntries(allOperatorIds.map(id => [id, id === 'KMB' ? 'must' : 'ban'])))}>{copy(locale, '只用九巴', 'KMB only')}</button>
        <button type="button" onClick={() => onCompanies(Object.fromEntries(allOperatorIds.map(id => [id, ['KMB', 'LWB'].includes(id) ? 'normal' : 'ban'])))}>{copy(locale, '九巴及龍運', 'KMB + Long Win')}</button></div>
      <div className="company-preferences">{companiesInOrder.map(company => <PreferenceToggle key={company.id} label={locale === 'en' ? company.nameEn : company.nameTc}
        value={companies[company.id] ?? 'normal'} positive="must" locale={locale} onChange={level => onCompanies({ ...companies, [company.id]: level })} />)}</div>
      <p>{copy(locale, '聯營路線須所有營辦商均未被禁止。只用九巴不包括龍運或九巴／城巴聯營線。', 'Joint routes require all their companies to be allowed. KMB only excludes Long Win and KMB/Citybus joint routes.')}</p></details>
      <details className="transport-settings-group"><summary>{copy(locale, '其他服務及資料涵蓋', 'Other services & coverage')}</summary>
        <p>{copy(locale, 'NR／HR／KR 居民巴士目前只提供官方路線文件，未納入行程計算。紅色小巴及昂坪360尚未有可用路線資料；不會編造班次或路徑。', 'NR / HR / KR residents’ services currently have official route documents only and are not used in journey calculations. Red minibus and Ngong Ping 360 routing data is unavailable; schedules and paths are not invented.')}</p>
        <a className="transport-coverage-link" href={'/timetables?operator=RESIDENTS&lang=' + locale}>{copy(locale, '查看居民巴士路線', 'View residents’ bus routes')}</a>
        <a className="transport-coverage-link" href="/coverage">{copy(locale, '查看全部資料涵蓋範圍', 'View full data coverage')}</a>
      </details></>}
    {section === 'roads' && <><h3>{copy(locale, '選擇道路', 'Choose road corridors')}</h3>
      <p>{copy(locale, '× 禁止 · ／ 正常 · ✓ 較喜歡。可選多條偏好道路，並非強制必經。', '× Ban · ／ Normal · ✓ Prefer. You can prefer several alternatives; preference is not a requirement.')}</p>
      {(Object.keys(corridorChoices) as CorridorGroup[]).map(group => <fieldset className="road-preferences-group" key={group}><legend>{copy(locale, ...groupLabels[group])}</legend>
        {corridorChoices[group].map(([id, zh, en]) => <PreferenceToggle key={id} label={copy(locale, zh, en)} locale={locale} positive="prefer" value={roadLevel(corridors, id)}
          onChange={level => onCorridors({ ...corridors, roads: { ...corridors.roads, [id]: level } })} />)}</fieldset>)}
      <p>{copy(locale, '只適用於已辨認的公共交通道路路段。偏好為同組其他道路加 15 分；禁止於搜尋時排除該路段。鐵路、渡輪、未辨認道路及獨立步行／單車／的士估算不受影響，並非涵蓋全港所有道路。', 'Applies to identified transit road segments. Prefer adds 15 points to other roads in the same group; Ban excludes the travelled segment during search. Rail, ferries, unclassified roads and separate walk/cycle/taxi estimates are unaffected. This does not cover every Hong Kong road.')}</p></>}
  </section>;
}
