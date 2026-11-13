import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from './transport/manifest.json';

describe('Published snapshot packaging', () => {
  it('keeps every generated data file below the requested 1 MB cap', () => {
    for (const files of Object.values(manifest.files)) for (const file of files) {
      const path = resolve('src/data/transport', file);
      expect(statSync(path).size).toBeLessThan(1_000_000);
      expect(Array.isArray(JSON.parse(readFileSync(path, 'utf-8')))).toBe(true);
    }
  });
});
