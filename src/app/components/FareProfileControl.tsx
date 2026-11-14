import type { FareProfile } from '../../domain/journeyFares';
import { copy, type PlannerLocale } from './plannerUi';

export const fareProfileLabel = (profile: FareProfile, locale: PlannerLocale) => profile === 'adult'
  ? copy(locale, '普通成人', 'Normal adult') : profile === 'pass' ? copy(locale, '九巴月票', 'KMB pass') : copy(locale, '學生', 'Student');

export function FareProfileControl({ value, onChange, locale }: {
  value: FareProfile; onChange: (value: FareProfile) => void; locale: PlannerLocale;
}) {
  return <fieldset className="fare-profile-control"><legend className="sr-only">{copy(locale, '選擇票價', 'Choose your fare')}</legend>
    <div>{(['adult', 'pass', 'student'] as const).map(profile => <button type="button" key={profile}
      aria-pressed={value === profile} onClick={() => onChange(profile)}>{fareProfileLabel(profile, locale)}</button>)}</div>
  </fieldset>;
}
