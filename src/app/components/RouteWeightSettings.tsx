'use client';
import { DEFAULT_WEIGHTS, WEIGHT_LIMITS, customWeights, weightPercent, weightFromPercent, type RouteWeights } from '../../engine/routeWeights';
import { copy, type PlannerLocale } from './plannerUi';
const main: [keyof RouteWeights, string, string][] = [
  ['ride', '乘車時間', 'Travel time'], ['wait', '候車時間', 'Waiting'], ['walk', '步行', 'Walking'],
  ['transfer', '轉乘次數', 'Transfers'], ['fare', '普通成人票價', 'Normal adult fare'], ['unverified', '服務未核實', 'Unverified services'],
];
const advanced: [keyof RouteWeights, string, string][] = [['waitPeak', '繁忙候車倍率', 'Peak waiting multiplier'], ['waitOffPeak', '非繁忙候車倍率', 'Off-peak waiting multiplier'],
  ['waitNight', '深夜候車倍率', 'Overnight waiting multiplier'], ['kmb', '九巴調整', 'KMB adjustment'], ['lwb', '龍運調整', 'Long Win adjustment'], ['mtr', '港鐵調整', 'MTR adjustment'], ['ctb', '城巴調整', 'Citybus adjustment']];

export function RouteWeightSettings({ value: draft, onChange: setDraft, locale }: { value: RouteWeights; onChange: (value: RouteWeights) => void; locale: PlannerLocale }) {
  function input([key, zh, en]: typeof main[number], percent = false) {
    const [min, max] = WEIGHT_LIMITS[key];
    const displayValue = percent ? weightPercent(key, draft[key]) : draft[key];
    return <label className="weight-slider" key={key}><span>{copy(locale, zh, en)}<output>{percent ? Math.round(displayValue) + '%' : draft[key].toFixed(2)}</output></span>
      <input type="range" aria-label={copy(locale, zh + '重要性', en + ' importance')} min={percent ? 0 : min} max={percent ? 100 : max} step={percent ? 1 : .01} value={displayValue}
        aria-valuetext={percent ? Math.round(displayValue) + '%' : draft[key].toFixed(2)}
        onChange={event => setDraft({ ...draft, [key]: percent ? weightFromPercent(key, Number(event.target.value)) : Number(event.target.value) })} /><small>{min < 0 ? copy(locale, '較喜歡 ← → 較避免', 'Prefer ← → Avoid') : percent ? copy(locale, '0% 最低 ← → 100% 最高', '0% Lowest ← → 100% Highest') : copy(locale, '較低 ← 重要性 → 較高', 'Lower ← Importance → Higher')}</small></label>;
  }
  return <section className="route-weight-settings" aria-label={copy(locale, '路線重要性設定', 'Route importance settings')}>
    <h3>{copy(locale, '各部分重要性', 'Importance of each part')}</h3>
    <p className="weight-warning" role="note">{copy(locale, '注意：調整權重會改變推薦結果，可能推薦較慢、較貴、步行更多或轉乘較多的行程。分數不是行程分鐘；票價及時間本身不會因此改變。', 'Warning: changing importance changes recommendations and may favour slower, more expensive journeys with more walking or transfers. Scores are not journey minutes; actual fare and time estimates do not change.')}</p>
    <p>{copy(locale, '每項獨立由 0%（最低容許值）至 100%（最高容許值），不是比例分配，總和毋須為 100%。未調整項目保留原有精確權重。', 'Each scale runs independently from 0% (lowest allowed) to 100% (highest allowed). They do not need to total 100%. Untouched controls keep their exact original weights.')}</p>
    {main.map(row => input(row, true))}
    <details><summary>{copy(locale, '進階倍率及公司調整（原始數值）', 'Advanced multipliers & company adjustments (raw values)')}</summary>{advanced.map(row => input(row))}</details>
    <p>{copy(locale, '公司必須／正常／禁止於行程搜尋設定選擇。權重只影響已允許公司的排序。', 'Choose Must / Normal / Ban in the journey search settings. Weights only rank services from allowed companies.')}</p>
    <div className="weight-actions"><button type="button" onClick={() => setDraft({ ...DEFAULT_WEIGHTS })}>{copy(locale, '還原重要性', 'Reset importance')}</button></div>
    <p role="status">{customWeights(draft) ? copy(locale, '自訂重要性，套用後生效。', 'Custom importance. Apply settings to use it.') : copy(locale, '預設重要性。', 'Default importance.')}</p>
  </section>;
}
