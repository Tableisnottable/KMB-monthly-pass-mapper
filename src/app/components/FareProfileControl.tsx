import type { FareProfile } from '../../domain/journeyFares';
import { copy, type PlannerLocale } from './plannerUi';

export const fareProfileLabel = (profile: FareProfile, locale: PlannerLocale) => profile === 'adult'
  ? copy(locale, '普通成人', 'Normal adult') : profile === 'pass' ? copy(locale, '九巴月票', 'KMB pass') : profile === 'student' ? copy(locale, '學生', 'Student') : copy(locale, '所選付款方式', 'Selected payment');

export function FareProfileControl({ value, onChange, locale }: {
  value: FareProfile; onChange: (value: FareProfile) => void; locale: PlannerLocale;
}) {
  return <label className="fare-profile-control"><span className="sr-only">{copy(locale, '選擇票價', 'Choose your fare')}</span>
    <select value={value} onChange={event => onChange(event.target.value as FareProfile)}>
      {(['adult', 'pass', 'student'] as const).map(profile => <option key={profile} value={profile}>{fareProfileLabel(profile, locale)}</option>)}
    </select>
  </label>;
}
