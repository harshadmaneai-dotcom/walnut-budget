import { describe, expect, it } from 'vitest';
import { remoteIsNewer } from './sync';

describe('remoteIsNewer', () => {
  it('accepts a newer timestamp across Supabase and JavaScript formats', () => {
    expect(remoteIsNewer('2026-11-12T16:40:28+00:00', '2026-11-12T16:40:27Z')).toBe(true);
  });

  it('rejects an older timestamp', () => {
    expect(remoteIsNewer('2026-11-12T16:40:27+00:00', '2026-11-12T16:40:28Z')).toBe(false);
  });

  it('treats equal instants as not newer, even with different offsets', () => {
    expect(remoteIsNewer('2026-11-12T16:40:28.184+00:00', '2026-11-12T16:40:28.184Z')).toBe(false);
  });

  it('uses the first remote timestamp when there is no local baseline', () => {
    expect(remoteIsNewer('2026-11-12T16:40:28Z', null)).toBe(true);
    expect(remoteIsNewer(null, null)).toBe(false);
  });

  it('ignores unusable remote timestamps', () => {
    expect(remoteIsNewer('', '2026-11-12T16:40:28Z')).toBe(false);
    expect(remoteIsNewer('not-a-date', '2026-11-12T16:40:28Z')).toBe(false);
    expect(remoteIsNewer(undefined, '2026-11-12T16:40:28Z')).toBe(false);
  });
});
