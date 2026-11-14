import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { scoreRoutes } from '../../engine/UpgradedScoringEngine';
import { FareComparison } from './FareComparison';

describe('Visible fare comparison', () => {
  const routes = (operator: string, number: string, fare = 20.6, networkOperator?: string) => scoreRoutes([
    { id: 'journey', legs: [{ operator, networkOperator, mode: 'BUS', routeNumber: number, fare, fareStatus: 'PUBLISHED' }] },
  ]);
  it('shows labelled without-pass and with-pass prices in English', () => {
    const html = renderToStaticMarkup(createElement(FareComparison, { routes: routes('LWB', 'A31'), locale: 'en' }));
    expect(html).toContain('Without pass'); expect(html).toContain('With KMB pass');
    expect(html).toContain('$20.60'); expect(html).toContain('$5.60');
  });
  it('shows both labels and an explicit zero payable fare in Chinese', () => {
    const html = renderToStaticMarkup(createElement(FareComparison, { routes: routes('KMB', '44'), locale: 'zh' }));
    expect(html).toContain('無月票'); expect(html).toContain('使用九巴月票'); expect(html).toContain('$0.00');
  });
  it('makes a company-dependent joint fare visible rather than claiming it is free', () => {
    const html = renderToStaticMarkup(createElement(FareComparison, { routes: routes('KMB', '104', 12.9, 'KMB+CTB'), locale: 'en' }));
    expect(html).toContain('$0.00–$12.90'); expect(html).toContain('depends on the bus company');
  });
});
