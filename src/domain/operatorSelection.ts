import { transportOperators } from '../data/transportOperators';
export const selectableOperators = transportOperators.filter(operator => !operator.id.includes('+'));
export const allOperatorIds = selectableOperators.map(operator => operator.id);
/** A joint service must not silently reintroduce a disabled company. */
export function operatorAllowed(operator: string, selected?: readonly string[]) {
  return selected === undefined || operator.split('+').every(member => selected.includes(member));
}
export function parseOperatorSelection(value: string | null): string[] | undefined {
  if (value === null) return undefined;
  const ids = Array.from(new Set(value.split(',').filter(Boolean)));
  if (ids.some(id => !allOperatorIds.includes(id))) throw new Error('Unknown transport company.');
  return ids;
}
