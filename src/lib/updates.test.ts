import { describe, expect, it } from 'vitest';
import { pickApkAsset } from './updates';

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
