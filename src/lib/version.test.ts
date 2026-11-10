import { describe, expect, it } from 'vitest';
import { compareVersions } from './version';

describe('version comparison', () => {
  it('compares segments as numbers, not strings', () => {
    expect(compareVersions('2.0.11', '2.0.9')).toBeGreaterThan(0);
    expect(compareVersions('2.0.9', '2.0.11')).toBeLessThan(0);
  });

  it('treats matching versions as equal', () => {
    expect(compareVersions('2.0.11', '2.0.11')).toBe(0);
    expect(compareVersions('2.0', '2.0.0')).toBe(0);
  });

  it('treats missing and unreadable segments as zero', () => {
    expect(compareVersions('2.1', '2.0.9')).toBeGreaterThan(0);
    expect(compareVersions('2.0.x', '2.0.0')).toBe(0);
  });

  it('ignores surrounding whitespace', () => {
    expect(compareVersions(' 2.0.11 ', '2.0.11')).toBe(0);
  });
});
