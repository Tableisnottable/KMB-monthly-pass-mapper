import { describe, expect, it } from 'vitest';
import { passCatalog } from './passCatalog';
import { regions } from './regions';

describe('Travel pass directory integrity', () => {
  it('keeps ownership IDs unique and every product linked to a public operator page and known region', () => {
    expect(new Set(passCatalog.map(p => p.id)).size).toBe(passCatalog.length);
    for (const product of passCatalog) {
      expect(regions.some(r => r.id === product.region)).toBe(true);
      expect(product.zh.trim()).not.toBe(''); expect(product.en.trim()).not.toBe('');
      const source = new URL(product.source);
      expect(source.protocol).toBe('https:');
      expect(source.username).toBe(''); expect(source.password).toBe('');
      expect(source.search).not.toMatch(/api.?key|token|secret/i);
    }
  });
  it('keeps unimplemented ticket and stored-value card discounts out of automatic fares', () => {
    expect(passCatalog.filter(p => p.pricing).map(p => p.id)).toEqual(['kmb']);
    expect(passCatalog.filter(p => p.kind === 'card').every(p => !p.pricing)).toBe(true);
    expect(passCatalog.some(p => p.id === 'seoul-climate-30')).toBe(false);
  });
});
