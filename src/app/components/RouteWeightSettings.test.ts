import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RouteWeightSettings } from './RouteWeightSettings';
import { DEFAULT_WEIGHTS } from '../../engine/routeWeights';

describe('Importance slider defaults', () => {
  it.each(['en', 'zh'] as const)('renders six 100%% defaults and the full 0–200%% range in %s', locale => {
    const html = renderToStaticMarkup(createElement(RouteWeightSettings, { value: DEFAULT_WEIGHTS, onChange() {}, locale }));
    const primary = html.slice(0, html.indexOf('<details>'));
    expect(primary.match(/<output>100%<\/output>/g)).toHaveLength(6);
    expect(primary.match(/min="0" max="200" step="1"/g)).toHaveLength(6);
    expect(primary.match(/aria-valuetext="100%" value="100"/g)).toHaveLength(6);
    expect(html).toContain(locale === 'en' ? '100% Normal' : '100% 正常');
  });
});
