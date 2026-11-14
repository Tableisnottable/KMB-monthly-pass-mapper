import { allOperatorIds, selectableOperators } from '../../domain/operatorSelection';
import { corridorChoices, strategicRouteDetails, visibleCorridorGroups, roadLevel, type CorridorGroup, type RoutePreferences } from '../../domain/routePreferences';
import { PreferenceToggle } from './PreferenceToggle';
import { copy, type PlannerLocale } from './plannerUi';
import { comparisonTypes, transitTypes, type ComparisonPreferences, type TransportPreferences } from '../../domain/transportSelection';
import { type JourneyLimits } from '../../domain/journeyLimits';
export type CompanyLevel = 'must' | 'normal' | 'ban';
export type CompanyPreferences = Record<string, CompanyLevel>;
export const defaultCompanies = (): CompanyPreferences => Object.fromEntries(allOperatorIds.map(id => [id, 'normal']));
export type SettingsSection = 'companies' | 'roads' | 'changes' | 'importance';
const changeTimeShortcuts = [0, 5, 10, 15, 30, 60];
const companyOrder = ['KMB', 'LWB', 'CTB', 'MTR', 'LRT', 'LRTFeeder', 'GMB', 'NLB', 'TRAM', 'FERRY', 'PTRAM', 'DB', 'PI', 'XB'];
const companiesInOrder = [...selectableOperators].sort((a, b) => companyOrder.indexOf(a.id) - companyOrder.indexOf(b.id));
const groupLabels: Record<CorridorGroup, [string, string]> = {
  strategic: ['香港主要幹線', 'Hong Kong strategic routes'], harbour: ['過海', 'Cross-harbour'], shatin: ['往返沙田', 'To/from Sha Tin'], airport: ['往返機場', 'To/from airport'],
  northwest: ['新界西北', 'Northwest New Territories'], tko: ['往返將軍澳', 'To/from Tseung Kwan O'], south: ['港島主要道路', 'Hong Kong Island roads'],
  kowloon: ['九龍主要道路', 'Kowloon roads'], northeast: ['新界東北', 'Northeast New Territories'], saikung: ['西貢及清水灣', 'Sai Kung & Clear Water Bay'], lantau: ['大嶼山', 'Lantau Island'],
};

export function JourneyPreferences({ section, companies, onCompanies, transport, onTransport, comparisons, onComparisons, corridors, onCorridors, changeMinutes, onChangeMinutes, limits, onLimits, locale }: {
  section: SettingsSection; companies: CompanyPreferences; onCompanies: (value: CompanyPreferences) => void;
  transport: TransportPreferences; onTransport: (value: TransportPreferences) => void;
  comparisons: ComparisonPreferences; onComparisons: (value: ComparisonPreferences) => void;
  corridors: RoutePreferences; onCorridors: (value: RoutePreferences) => void;
  changeMinutes: number; onChangeMinutes: (value: number) => void; locale: PlannerLocale;
  limits: JourneyLimits; onLimits: (value: JourneyLimits) => void;
}) {
  return <section className="journey-preferences">
    {section === 'changes' && <><h3>{copy(locale, '預留多少轉乘時間？', 'How much time to change?')}</h3>
      <div className="change-time-control">
        <div className="change-time-value"><label htmlFor="minimum-change-time">{copy(locale, '最少轉乘時間', 'Minimum change time')}</label>
          <div className="change-time-number"><input id="minimum-change-time" type="number" inputMode="numeric" min="0" max="60" step="1" value={changeMinutes}
            aria-label={copy(locale, '最少轉乘時間（分鐘）', 'Minimum change time in minutes')}
            onChange={event => { const value = event.currentTarget.valueAsNumber; if (Number.isFinite(value)) onChangeMinutes(Math.min(60, Math.max(0, Math.round(value)))); }} />
            <span>{copy(locale, '分鐘', 'min')}</span></div></div>
        <input className="change-time-slider" type="range" min="0" max="60" step="1" value={changeMinutes}
          aria-label={copy(locale, '最少轉乘時間滑桿', 'Minimum change time slider')}
          onChange={event => onChangeMinutes(Number(event.currentTarget.value))} />
        <div className="change-time-shortcuts" aria-label={copy(locale, '快速選擇轉乘時間', 'Quick change time choices')}>
          {changeTimeShortcuts.map(minutes => <button type="button" key={minutes} aria-pressed={changeMinutes === minutes}
            aria-label={`${minutes} ${copy(locale, '分鐘', 'minutes')}`} onClick={() => onChangeMinutes(minutes)}>{minutes}</button>)}
          <span>{copy(locale, '分鐘', 'min')}</span>
        </div>
      </div>
      <p>{copy(locale, '可選 0–60 分鐘，每次 1 分鐘。0 分鐘不加額外緩衝，仍保留實際轉乘步行；額外緩衝計入候車。較長時間可能排除緊接班次，並改變推薦結果。', 'Choose 0–60 minutes in 1-minute steps. Zero adds no extra buffer; actual transfer walking stays unchanged. Extra buffer counts as waiting. Longer buffers can rule out tight connections and change recommendations.')}</p>
      <h3>{copy(locale, '行程上限（可留空）', 'Journey maximums (optional)')}</h3>
      {([['transfers', '最多轉乘次數', 'Maximum transfers'], ['change', '每次轉乘最多時間（分鐘）', 'Maximum time per change (minutes)'], ['walk', '全程最多步行時間（分鐘）', 'Maximum total walking (minutes)'], ['wait', '每次上車最多候車時間（分鐘）', 'Maximum waiting per boarding (minutes)'], ['ride', '全程最多乘車時間（分鐘）', 'Maximum total riding (minutes)']] as const).map(([key, zh, en]) => (
        <label className="journey-limit-input" key={key}>
          <span>{copy(locale, zh, en)}</span>
          <input type="number" inputMode="numeric" min="0" step="1" placeholder={copy(locale, '不限', 'No limit')}
            value={limits[key] ?? ''} onChange={event => {
              const raw = event.target.value;
              const value = raw === '' ? null : Number(raw);
              if (value === null || Number.isSafeInteger(value) && value >= 0) onLimits({ ...limits, [key]: value });
            }} />
        </label>
      ))}
      <p>{copy(locale, '全部留空即不限。轉乘時間包括轉站步行及候車；全程步行包括起點及終點接駁。', 'Leave a field blank for no limit. Change time includes transfer walking and waiting; total walking includes access and exit walks.')}</p>
      {limits.change !== null && limits.change < changeMinutes && <p className="weight-warning" role="alert">{copy(locale, '最多轉乘時間不可少於最少轉乘時間。', 'Maximum change time cannot be below the minimum change time.')}</p>}
    </>}
    {section === 'companies' && <><h3>{copy(locale, '交通方式及公司', 'Transport types & companies')}</h3>
      <details className="transport-settings-group" open><summary>{copy(locale, '公共交通種類', 'Public transport types')}</summary>
        <p>{copy(locale, '× 禁止 · ／ 正常 · ✓ 必須。每種設為必須的交通方式都要出現；公司設定也會同時生效。', '× Ban · ／ Normal · ✓ Must. Every required transport type must appear. Company rules also apply.')}</p>
        {transitTypes.map(type => <PreferenceToggle key={type.id} label={locale === 'en' ? type.nameEn : type.nameTc} locale={locale}
          value={transport[type.id]} positive="must" onChange={level => onTransport({ ...transport, [type.id]: level })} />)}
      </details>
      <details className="transport-settings-group"><summary>{copy(locale, '步行、單車、的士及駕駛', 'Walk, cycle, taxi & driving')}</summary>
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
      <p>{copy(locale, '× 禁止 · ／ 正常 · ✓ 必須。同一組有多條必須道路時，行程經過其中一條即可；不同組別的必須道路則都要經過。', '× Ban · ／ Normal · ✓ Must. If several roads in one group are Must, a route may use any one of them. Must roads in separate groups are all required.')}</p>
      {visibleCorridorGroups.map(group => <fieldset className="road-preferences-group" key={group}><legend>{copy(locale, ...groupLabels[group])}</legend>
        {group === 'strategic' ? <div className="strategic-route-grid">{strategicRouteDetails.map((route, index) => <article className="strategic-route-item" key={route.id}>
          <div className="strategic-route-title"><span className="strategic-route-number" style={{ backgroundColor: route.color }}>{index + 1}</span>
            <strong>{copy(locale, route.ends[0], route.ends[1])}</strong></div>
          <p>{(locale === 'en' ? route.pathEn : route.path).join(' · ')}</p>
          <PreferenceToggle label={copy(locale, route.ends[0], route.ends[1])} locale={locale} positive="must" value={roadLevel(corridors, route.id)}
            onChange={level => onCorridors({ ...corridors, roads: { ...corridors.roads, [route.id]: level } })} />
        </article>)}</div> : corridorChoices[group].map(([id, zh, en]) => <PreferenceToggle key={id} label={copy(locale, zh, en)} locale={locale} positive="must" value={roadLevel(corridors, id)}
          onChange={level => onCorridors({ ...corridors, roads: { ...corridors.roads, [id]: level } })} />)}</fieldset>)}
      <p>{copy(locale, '必須及禁止道路規則會套用於公共交通及步行、單車、的士和駕駛估算；偏好道路會影響可選路徑排序。道路比對依賴已收錄的路線幾何，資料未涵蓋全港，未匹配到的道路不能可靠判斷；單車及步行通行限制亦請以現場標誌為準。', 'Must and Ban apply to public-transport journeys and walk, cycle, taxi and driving estimates; Prefer ranks matching alternatives. Matching depends on mapped corridor geometry and coverage is incomplete, so unmapped roads cannot be checked reliably. Follow access signs for walking and cycling.')}</p></>}
  </section>;
}
