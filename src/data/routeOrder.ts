/** Numeric route order, with deterministic company/variant ties across pages. */
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
export interface SortableRoute { id: string; number: string; operator: string; nameEn: string }
export function compareRouteNumbers(a: string, b: string) {
  if (!a.trim() || !b.trim()) return Number(!a.trim()) - Number(!b.trim());
  // Number-led routes first; then A, B, E, N, NR, etc., each numerically.
  const prefixA = a.match(/^\D*/)?.[0] ?? '', prefixB = b.match(/^\D*/)?.[0] ?? '';
  return collator.compare(prefixA, prefixB) || collator.compare(a, b) || a.localeCompare(b);
}
export function compareRouteResults(a: SortableRoute, b: SortableRoute) {
  return compareRouteNumbers(a.number, b.number) || collator.compare(a.operator, b.operator)
    || collator.compare(a.nameEn, b.nameEn) || collator.compare(a.id, b.id);
}
