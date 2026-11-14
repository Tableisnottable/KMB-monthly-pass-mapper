import { copy, type PlannerLocale } from './plannerUi';

export function PreferenceToggle<T extends string>({ label, value, onChange, positive, locale }: {
  label: string; value: T; onChange: (value: T) => void; positive: T; locale: PlannerLocale;
}) {
  const choices = [
    { value: 'ban', symbol: '×', name: copy(locale, '禁止', 'Ban') },
    { value: 'normal', symbol: '／', name: copy(locale, '正常', 'Normal') },
    { value: positive, symbol: '✓', name: positive === 'must' ? copy(locale, '必須', 'Must') : copy(locale, '較喜歡', 'Prefer') },
  ];
  return <div className="preference-row"><span>{label}</span><div className="preference-toggle" role="group" aria-label={label}>
    {choices.map(choice => <button type="button" key={choice.value} data-level={choice.value} aria-pressed={value === choice.value}
      title={choice.name} aria-label={label + ': ' + choice.name} onClick={() => onChange(choice.value as T)}>{choice.symbol}</button>)}
  </div></div>;
}
