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
  it.each([0, 3, 31, 60])('renders the minute controls and preserves the selected value %i', minutes => {
    const html = render('changes', minutes);
    expect(html).toContain('type="range" min="0" max="60" step="1"');
    expect(html).toContain(`id="minimum-change-time" type="number" inputMode="numeric" min="0" max="60" step="1" aria-label="Minimum change time in minutes" value="${minutes}"`);
    expect(html).not.toContain('<select');
    for (const shortcut of [0, 5, 10, 15, 30, 60]) expect(html).toContain(`aria-label="${shortcut} minutes"`);
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
