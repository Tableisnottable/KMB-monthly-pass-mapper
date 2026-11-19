'use client';
import { allOperatorIds, selectableOperators } from '../../domain/operatorSelection';
import type { RoutePreferences } from '../../domain/routePreferences';
import { RoadPreferences } from './RoadPreferences';
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
      <p>{copy(locale, '0 分鐘不加緩衝，仍會計算轉站步行。預留越多時間，可選班次可能越少。', 'Zero adds no buffer; actual transfer walking stays unchanged. Longer buffers may reduce available connections.')}</p>
      <h3>{copy(locale, '行程上限（可留空）', 'Journey maximums (optional)')}</h3>
      {([['transfers', '最多轉乘次數', 'Maximum transfers'], ['change', '每次轉乘（分鐘）', 'Maximum time per change (minutes)'], ['walk', '全程步行（分鐘）', 'Maximum total walking (minutes)'], ['wait', '每次候車（分鐘）', 'Maximum waiting per boarding (minutes)'], ['ride', '全程乘車（分鐘）', 'Maximum total riding (minutes)']] as const).map(([key, zh, en]) => (
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
      <section className="transport-settings-group"><h4>{copy(locale, '公共交通種類', 'Public transport types')}</h4>
        <p>{copy(locale, '必須：行程須包含該方式。禁用：不計算該方式。', 'Must includes this mode. Ban excludes it.')}</p>
        {transitTypes.map(type => <PreferenceToggle key={type.id} label={locale === 'en' ? type.nameEn : type.nameTc} locale={locale}
          displayLabel={type.id === 'BUS' ? copy(locale, '巴士', 'Bus') : type.id === 'SUBWAY' ? copy(locale, '港鐵及機場快綫', 'MTR / Airport Express') : undefined}
          value={transport[type.id]} positive="must" onChange={level => onTransport({ ...transport, [type.id]: level })} />)}
      </section>
      <section className="transport-settings-group"><h4>{copy(locale, '步行、單車、的士及駕駛', 'Walk, cycle, taxi & driving')}</h4>
        <p>{copy(locale, '選擇顯示及計算哪些獨立行程估算。關閉全程步行不會移除公共交通行程所需的接駁步行。', 'Choose which separate journey estimates to calculate and show. Hiding walking comparisons keeps the walking needed to reach and change public transport.')}</p>
        {comparisonTypes.map(type => <label className="comparison-preference" key={type.id}><span>{locale === 'en' ? type.nameEn : type.nameTc}</span>
          <input type="checkbox" checked={comparisons[type.id]} onChange={event => onComparisons({ ...comparisons, [type.id]: event.target.checked })} /></label>)}
        <p>{copy(locale, '的士時間為道路估算，車費按咪錶；單車路徑不保證可安全通行。', 'Taxi times are road estimates and fares are metered. Cycling paths are not verified for safety.')}</p>
      </section>
      <section className="transport-settings-group"><h4>{copy(locale, '交通公司', 'Transport companies')}</h4>
      <p>{copy(locale, '必須：行程須包含該公司。禁用：排除該公司及其聯營線。', 'Must includes this company. Ban also excludes its joint routes.')}</p>
      <div className="company-shortcuts"><button type="button" onClick={() => onCompanies(defaultCompanies())}>{copy(locale, '全部正常', 'All normal')}</button>
        <button type="button" onClick={() => onCompanies(Object.fromEntries(allOperatorIds.map(id => [id, id === 'KMB' ? 'must' : 'ban'])))}>{copy(locale, '只用九巴', 'KMB only')}</button>
        <button type="button" onClick={() => onCompanies(Object.fromEntries(allOperatorIds.map(id => [id, ['KMB', 'LWB'].includes(id) ? 'normal' : 'ban'])))}>{copy(locale, '九巴及龍運', 'KMB + Long Win')}</button></div>
      <div className="company-preferences">{companiesInOrder.map(company => <PreferenceToggle key={company.id} label={locale === 'en' ? company.nameEn : company.nameTc}
        value={companies[company.id] ?? 'normal'} positive="must" locale={locale} onChange={level => onCompanies({ ...companies, [company.id]: level })} />)}</div>
      <p>{copy(locale, '聯營路線須所有營辦商均未被禁止。只用九巴不包括龍運或九巴／城巴聯營線。', 'Joint routes require all their companies to be allowed. KMB only excludes Long Win and KMB/Citybus joint routes.')}</p></section>
      <section className="transport-settings-group"><h4>{copy(locale, '其他服務及資料涵蓋', 'Other services & coverage')}</h4>
        <p>{copy(locale, 'NR／HR／KR 居民巴士目前只提供官方路線文件，未納入行程計算。紅色小巴及昂坪360尚未有可用路線資料；不會編造班次或路徑。', 'NR / HR / KR residents’ services currently have official route documents only and are not used in journey calculations. Red minibus and Ngong Ping 360 routing data is unavailable; schedules and paths are not invented.')}</p>
        <a className="transport-coverage-link" href={'/timetables?operator=RESIDENTS&lang=' + locale}>{copy(locale, '查看居民巴士路線', 'View residents’ bus routes')}</a>
        <a className="transport-coverage-link" href="/coverage">{copy(locale, '查看全部資料涵蓋範圍', 'View full data coverage')}</a>
      </section></>}
    {section === 'roads' && <RoadPreferences value={corridors} onChange={onCorridors} locale={locale} />}
  </section>;
}
