import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apkCandidateUrls,
  checkForAndroidUpdate,
  manifestUrl,
  mirrorApkUrl,
  parseUpdateManifest,
  pickApkAsset,
  UpdateCheckError,
} from './updates';

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

describe('parseUpdateManifest', () => {
  const valid = {
    version: '2.0.21',
    apk: 'Walnut-2.0.21.apk',
    bytes: 3_420_231,
    sha256: 'A'.repeat(64),
  };

  it('accepts the published manifest and normalises the checksum', () => {
    expect(parseUpdateManifest(valid)).toEqual({
      version: '2.0.21',
      apk: 'Walnut-2.0.21.apk',
      bytes: 3_420_231,
      sha256: 'a'.repeat(64),
      notes: '',
    });
  });

  it('accepts a manifest without a checksum so an older feed still works', () => {
    const { sha256: _sha, ...withoutChecksum } = valid;
    expect(parseUpdateManifest(withoutChecksum)?.sha256).toBe('');
  });

  it('rejects anything that could point at the wrong file', () => {
    expect(parseUpdateManifest(null)).toBeNull();
    expect(parseUpdateManifest('2.0.21')).toBeNull();
    expect(parseUpdateManifest({ ...valid, version: 'latest' })).toBeNull();
    expect(parseUpdateManifest({ ...valid, apk: '../../secret.apk' })).toBeNull();
    expect(parseUpdateManifest({ ...valid, apk: 'Walnut-2.0.21.zip' })).toBeNull();
    expect(parseUpdateManifest({ ...valid, bytes: 0 })).toBeNull();
    expect(parseUpdateManifest({ ...valid, bytes: 12.5 })).toBeNull();
    expect(parseUpdateManifest({ ...valid, sha256: 'not-a-checksum' })).toBeNull();
  });
});

/** The module only needs the shape it uses, so tests do not depend on a browser. */
function fakeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const manifest = {
  version: '2.0.21',
  apk: 'Walnut-2.0.21.apk',
  bytes: 3_420_231,
  sha256: 'b'.repeat(64),
};

const release = {
  tag_name: 'v2.0.21',
  body: 'Release notes',
  draft: false,
  prerelease: false,
  assets: [
    { name: 'Walnut.apk', size: 3_420_231, browser_download_url: 'https://example.test/Walnut.apk' },
  ],
};

describe('checkForAndroidUpdate', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the website manifest without touching GitHub', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/updates/latest.json')
        ? fakeResponse(200, manifest)
        : fakeResponse(500, {}),
    );
    vi.stubGlobal('fetch', fetchMock);

    const update = await checkForAndroidUpdate({ force: true });
    expect(update?.version).toBe('2.0.21');
    expect(update?.sha256).toBe('b'.repeat(64));
    expect(update?.bytes).toBe(3_420_231);
    expect(update?.urls[0]).toBe(`${mirrorApkUrl('2.0.21')}`);
    expect(fetchMock.mock.calls.map(([url]) => String(url)).some((url) => url.includes('api.github.com'))).toBe(
      true,
    );
  });

  it('still offers the update when GitHub is rate-limiting and only the manifest answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/updates/latest.json')
          ? fakeResponse(200, manifest)
          : fakeResponse(403, {}),
      ),
    );

    const update = await checkForAndroidUpdate({ force: true });
    expect(update?.version).toBe('2.0.21');
    expect(update?.urls[0]).toBe(mirrorApkUrl('2.0.21'));
    expect(update?.urls[1]).toContain('releases/latest/download/Walnut.apk');
  });

  it('falls back to the GitHub release when the manifest is not deployed yet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/updates/latest.json')
          ? fakeResponse(404, {})
          : fakeResponse(200, release),
      ),
    );

    const update = await checkForAndroidUpdate({ force: true });
    expect(update?.version).toBe('2.0.21');
    expect(update?.sha256).toBe('');
    expect(update?.urls[0]).toBe(mirrorApkUrl('2.0.21'));
    expect(update?.urls[1]).toBe('https://example.test/Walnut.apk');
  });

  it('reports both feeds being unreachable instead of claiming the app is current', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );

    await expect(checkForAndroidUpdate({ force: true })).rejects.toBeInstanceOf(UpdateCheckError);
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

  it('uses the manifest file name when the feed provides one', () => {
    const urls = apkCandidateUrls('2.0.21', null, 'Walnut-2.0.21.apk');
    expect(urls[0]).toBe(`${manifestUrl().replace(/\/latest\.json$/, '')}/Walnut-2.0.21.apk`);
  });

  it('still falls back to GitHub when the feed carries no APK asset', () => {
    const urls = apkCandidateUrls('2.0.20', null);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe(mirrorApkUrl('2.0.20'));
    expect(urls[1]).toContain('releases/latest/download/Walnut.apk');
  });
});
