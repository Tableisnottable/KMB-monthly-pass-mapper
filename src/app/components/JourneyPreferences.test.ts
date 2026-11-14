import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JourneyPreferences, defaultCompanies, type SettingsSection } from './JourneyPreferences';
import { DEFAULT_PREFERENCES } from '../../domain/routePreferences';
import { comparisonTypes, defaultComparisons, defaultTransport, transitTypes } from '../../domain/transportSelection';
import { selectableOperators } from '../../domain/operatorSelection';
import { DEFAULT_LIMITS } from '../../domain/journeyLimits';

function render(section: SettingsSection, changeMinutes = 3, locale: 'en' | 'zh' = 'en') {
  return renderToStaticMarkup(createElement(JourneyPreferences, {
    section, changeMinutes, locale, companies: defaultCompanies(), transport: defaultTransport(), comparisons: defaultComparisons(),
    corridors: DEFAULT_PREFERENCES, limits: DEFAULT_LIMITS, onLimits() {}, onCompanies() {}, onTransport() {}, onComparisons() {}, onCorridors() {}, onChangeMinutes() {},
  }));
}
describe('Journey settings controls', () => {
  it.each([0, 3, 31, 60])('renders every minute and preserves the selected value %i', minutes => {
    const html = render('changes', minutes);
    expect(html.match(/<option /g)).toHaveLength(61);
    expect(html).toContain(`<option value="${minutes}" selected="">`);
    expect(html).toContain('actual transfer walking stays unchanged');
  });
  it.each(['en', 'zh'] as const)('lists all supported types, companies and comparison controls in %s', locale => {
    const html = render('companies', 3, locale);
    for (const item of [...transitTypes, ...selectableOperators, ...comparisonTypes]) {
      expect(html).toContain((locale === 'en' ? item.nameEn : item.nameTc).replaceAll('&', '&amp;').replaceAll("'", '&#x27;'));
    }
    expect(html.match(/type="checkbox"/g)).toHaveLength(4);
    expect(html).toContain('NR'); expect(html).toContain('/coverage');
  });
});
