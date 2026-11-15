import { describe, expect, it } from 'vitest';
import { apkCandidateUrls, mirrorApkUrl, pickApkAsset } from './updates';

describe('pickApkAsset', () => {
  it('prefers the stable Walnut.apk name over the versioned copy', () => {
    expect(
      pickApkAsset([
        { name: 'Walnut-2.0.18.apk', size: 999, browser_download_url: 'https://example.test/versioned.apk' },
        { name: 'Walnut.apk', size: 3_416_229, browser_download_url: 'https://example.test/Walnut.apk' },
      ]),
    ).toEqual({ url: 'https://example.test/Walnut.apk', bytes: 3_416_229 });
  });

  it('falls back to any APK and reports an unknown size as zero', () => {
    expect(
      pickApkAsset([{ name: 'app-release.apk', browser_download_url: 'https://example.test/app.apk' }]),
    ).toEqual({ url: 'https://example.test/app.apk', bytes: 0 });
  });

  it('has no asset when the release feed carries no usable APK', () => {
    expect(pickApkAsset(undefined)).toBeNull();
    expect(pickApkAsset([])).toBeNull();
    expect(pickApkAsset([{ name: 'Walnut.apk' }])).toBeNull();
    expect(pickApkAsset([{ size: 10, browser_download_url: 'https://example.test/latest.yml' }])).toBeNull();
  });
});

describe('apkCandidateUrls', () => {
  it('tries the website mirror first and keeps GitHub last', () => {
    const urls = apkCandidateUrls('2.0.20', { url: 'https://example.test/Walnut.apk', bytes: 10 });
    expect(urls[0]).toBe(mirrorApkUrl('2.0.20'));
    expect(urls[0]).toContain('/updates/Walnut-2.0.20.apk');
    expect(urls[1]).toBe('https://example.test/Walnut.apk');
    expect(urls[urls.length - 1]).toContain('releases/latest/download/Walnut.apk');
  });

  it('still falls back to GitHub when the feed carries no APK asset', () => {
    const urls = apkCandidateUrls('2.0.20', null);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe(mirrorApkUrl('2.0.20'));
    expect(urls[1]).toContain('releases/latest/download/Walnut.apk');
  });
});
