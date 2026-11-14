import type { FareProfile } from '../../domain/journeyFares';
import { copy, type PlannerLocale } from './plannerUi';

export const fareProfileLabel = (profile: FareProfile, locale: PlannerLocale) => profile === 'adult'
  ? copy(locale, '普通成人', 'Normal adult') : profile === 'pass' ? copy(locale, '九巴月票', 'KMB pass') : copy(locale, '學生', 'Student');

export function FareProfileControl({ value, onChange, locale }: {
  value: FareProfile; onChange: (value: FareProfile) => void; locale: PlannerLocale;
}) {
  return <fieldset className="fare-profile-control"><legend>{copy(locale, '選擇票價', 'Choose your fare')}</legend>
    <div>{(['adult', 'pass', 'student'] as const).map(profile => <button type="button" key={profile}
      aria-pressed={value === profile} onClick={() => onChange(profile)}>{fareProfileLabel(profile, locale)}</button>)}</div>
    <p>{copy(locale, '列出全部票價；選擇會標示對應價格及套用於「最便宜」排序。', 'All prices stay visible. Your choice highlights a fare and controls Cheapest sorting.')}</p>
  </fieldset>;
}
