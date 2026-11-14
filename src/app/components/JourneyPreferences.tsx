import { allOperatorIds, selectableOperators } from '../../domain/operatorSelection';
import { corridorChoices, type RoutePreferences } from '../../domain/routePreferences';
import { copy, type PlannerLocale } from './plannerUi';
export type CompanyLevel = 'must' | 'normal' | 'ban';
export type CompanyPreferences = Record<string, CompanyLevel>;
export const defaultCompanies = (): CompanyPreferences => Object.fromEntries(allOperatorIds.map(id => [id, 'normal']));

export function JourneyPreferences({ companies, onCompanies, corridors, onCorridors, changeMinutes, onChangeMinutes, locale }: {
  companies: CompanyPreferences; onCompanies: (value: CompanyPreferences) => void;
  corridors: RoutePreferences; onCorridors: (value: RoutePreferences) => void;
  changeMinutes: number; onChangeMinutes: (value: number) => void; locale: PlannerLocale;
}) {
  const restricted = Object.values(companies).some(level => level !== 'normal');
  return <details className="journey-preferences"><summary>{copy(locale, '公司、隧道及轉乘設定', 'Companies, tunnels & changes')}{restricted && <small>{copy(locale, ' · 已篩選', ' · filtered')}</small>}</summary>
    <label className="corridor-select"><span>{copy(locale, '最少轉乘時間', 'Minimum time to change')}</span><select value={changeMinutes} onChange={event => onChangeMinutes(Number(event.target.value))}>
      {[3, 5, 10, 15, 20, 30].map(minutes => <option value={minutes} key={minutes}>{minutes} {copy(locale, '分鐘', 'minutes')}</option>)}</select></label>
    <p>{copy(locale, '保留實際轉乘步行，額外時間計入候車。修改後按「搜尋」重新計算。', 'Actual transfer walking stays unchanged; extra buffer counts as waiting. Press Go or Plan after changing these settings.')}</p>
    <h3>{copy(locale, '交通公司', 'Transport companies')}</h3>
    <div className="company-shortcuts"><button type="button" onClick={() => onCompanies(defaultCompanies())}>{copy(locale, '全部正常', 'All normal')}</button>
      <button type="button" onClick={() => onCompanies(Object.fromEntries(allOperatorIds.map(id => [id, id === 'KMB' ? 'must' : 'ban'])))}>{copy(locale, '只用九巴', 'KMB only')}</button>
      <button type="button" onClick={() => onCompanies(Object.fromEntries(allOperatorIds.map(id => [id, ['KMB', 'LWB'].includes(id) ? 'normal' : 'ban'])))}>{copy(locale, '只用九巴及龍運', 'KMB + Long Win only')}</button></div>
    <p>{copy(locale, '必須：行程包含該公司服務。正常：可使用。禁止：不參與計算。每間設為必須的公司都要出現。', 'Must: include this company. Normal: optional. Ban: exclude it from calculation. Every company set to Must must appear.')}</p>
    <div className="company-preferences">{selectableOperators.map(company => <label key={company.id}><span>{locale === 'en' ? company.nameEn : company.nameTc}</span>
      <select aria-label={(locale === 'en' ? company.nameEn : company.nameTc) + ' ' + copy(locale, '使用設定', 'company preference')}
        value={companies[company.id] ?? 'normal'} onChange={event => onCompanies({ ...companies, [company.id]: event.target.value as CompanyLevel })}>
        <option value="must">{copy(locale, '必須', 'Must')}</option><option value="normal">{copy(locale, '正常', 'Normal')}</option><option value="ban">{copy(locale, '禁止', 'Ban')}</option>
      </select></label>)}</div>
    <p>{copy(locale, '聯營路線須所有營辦商均未被禁止；實際車輛公司可能不同。只用九巴不包括龍運或九巴／城巴聯營線。', 'Joint routes require all their companies to be allowed; the actual bus company can vary. KMB only excludes Long Win and KMB/Citybus joint routes.')}</p>
    <h3>{copy(locale, '較喜歡的道路', 'Preferred road corridors')}</h3>
    {(Object.keys(corridorChoices) as (keyof RoutePreferences)[]).map(group => <label className="corridor-select" key={group}><span>{group === 'harbour' ? copy(locale, '過海', 'Cross-harbour') : group === 'shatin' ? copy(locale, '往返沙田', 'To/from Sha Tin') : copy(locale, '往返機場', 'To/from airport')}</span>
      <select value={corridors[group]} onChange={event => onCorridors({ ...corridors, [group]: event.target.value })}><option value="">{copy(locale, '不指定', 'No preference')}</option>
        {corridorChoices[group].map(([id, zh, en]) => <option value={id} key={id}>{locale === 'en' ? en : zh}</option>)}</select></label>)}
    <p>{copy(locale, '以已匯入道路線形辨認。偏好會於建議排序對其他已知同類道路加 15 分，不會封鎖替代路線；鐵路、渡輪及未辨認道路不變。', 'Detected from imported road alignments. Recommended sorting adds 15 points to other identified corridors in the same group. Alternatives remain available; rail, ferry and unclassified paths are unchanged.')}</p>
  </details>;
}
