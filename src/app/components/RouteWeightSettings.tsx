'use client';
import { DEFAULT_WEIGHTS, WEIGHT_LIMITS, customWeights, weightPercent, weightFromPercent, type ImportanceKey, type RouteWeights } from '../../engine/routeWeights';
import { copy, type PlannerLocale } from './plannerUi';
const main: [keyof RouteWeights, string, string][] = [
  ['ride', '乘車時間', 'Travel time'], ['wait', '候車時間', 'Waiting'], ['walk', '步行', 'Walking'],
  ['transfer', '轉乘次數', 'Transfers'], ['fare', '普通成人票價', 'Normal adult fare'], ['unverified', '服務未核實', 'Unverified services'],
];
const advanced: [keyof RouteWeights, string, string][] = [['waitPeak', '繁忙候車倍率', 'Peak waiting multiplier'], ['waitOffPeak', '非繁忙候車倍率', 'Off-peak waiting multiplier'],
  ['waitNight', '深夜候車倍率', 'Overnight waiting multiplier'], ['kmb', '九巴調整', 'KMB adjustment'], ['lwb', '龍運調整', 'Long Win adjustment'], ['mtr', '港鐵調整', 'MTR adjustment'], ['ctb', '城巴調整', 'Citybus adjustment']];

export function RouteWeightSettings({ value: draft, onChange: setDraft, locale, companyAdjustments = true }: { value: RouteWeights; onChange: (value: RouteWeights) => void; locale: PlannerLocale; companyAdjustments?: boolean }) {
  function input([key, zh, en]: typeof main[number], percent = false) {
    const [min, max] = WEIGHT_LIMITS[key];
    const displayValue = percent ? weightPercent(key as ImportanceKey, draft[key]) : draft[key];
    return <label className="weight-slider" key={key}><span>{copy(locale, zh, en)}<output>{percent ? Math.round(displayValue) + '%' : draft[key].toFixed(2)}</output></span>
      <input type="range" aria-label={copy(locale, zh + '重要性', en + ' importance')} min={percent ? 0 : min} max={percent ? 200 : max} step={percent ? 1 : .01} value={displayValue}
        aria-valuetext={percent ? Math.round(displayValue) + '%' : draft[key].toFixed(2)}
        onChange={event => setDraft({ ...draft, [key]: percent ? weightFromPercent(key as ImportanceKey, Number(event.target.value)) : Number(event.target.value) })} /><small>{min < 0 ? copy(locale, '較喜歡 ← → 較避免', 'Prefer ← → Avoid') : percent ? copy(locale, '0% 不計入 · 100% 正常 · 200% 雙倍', '0% Off · 100% Normal · 200% Double') : copy(locale, '較低 ← 重要性 → 較高', 'Lower ← Importance → Higher')}</small></label>;
  }
  return <section className="route-weight-settings" aria-label={copy(locale, '路線重要性設定', 'Route importance settings')}>
    <h3>{copy(locale, '你最在意什麼？', 'What matters to you?')}</h3>
    <p className="weight-warning" role="note">{copy(locale, '調整會改變路線排序，可能增加車費、步行或轉乘。', 'Changes can favour journeys with higher fares, more walking or more transfers.')}</p>
    <p>{copy(locale, '每項獨立設定：100% 正常，0% 不計，200% 雙倍。', 'Set each independently: 100% Normal, 0% Off, 200% Double.')}</p>
    <div className="weight-grid">{main.map(row => input(row, true))}</div>
    <details><summary>{companyAdjustments ? copy(locale, '進階倍率及公司調整（原始數值）', 'Advanced multipliers & company adjustments (raw values)') : copy(locale, '進階候車倍率', 'Advanced waiting multipliers')}</summary>{advanced.filter(([key]) => companyAdjustments || key.startsWith('wait')).map(row => input(row))}</details>
    <p>{copy(locale, '公司必須／正常／禁止於行程搜尋設定選擇。權重只影響已允許公司的排序。', 'Choose Must / Normal / Ban in the journey search settings. Weights only rank services from allowed companies.')}</p>
    <div className="weight-actions"><button type="button" onClick={() => setDraft({ ...DEFAULT_WEIGHTS })}>{copy(locale, '還原重要性', 'Reset importance')}</button></div>
    <p role="status">{customWeights(draft) ? copy(locale, '自訂重要性，套用後生效。', 'Custom importance. Apply settings to use it.') : copy(locale, '預設重要性。', 'Default importance.')}</p>
  </section>;
}
