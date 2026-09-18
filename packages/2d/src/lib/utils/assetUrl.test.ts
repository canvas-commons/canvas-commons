import {afterEach, describe, expect, it, vi} from 'vitest';
import {resolveAssetUrl} from './assetUrl';

const REMOTE = 'https://example.com/video.mp4';

describe('resolveAssetUrl', () => {
  const assetHash = vi.fn(() => 'hash');

  afterEach(() => {
    vi.unstubAllEnvs();
    assetHash.mockClear();
  });

  it('returns an empty url for an empty source', () => {
    expect(resolveAssetUrl('', assetHash)).toStrictEqual({key: '', src: ''});
    expect(resolveAssetUrl(null, assetHash)).toStrictEqual({key: '', src: ''});
  });

  it('appends the asset hash to same-origin sources', () => {
    const {key, src} = resolveAssetUrl('/media/video.mp4', assetHash);
    expect(key).toBe('/media/video.mp4');
    expect(src).toBe(
      `${window.location.origin}/media/video.mp4?asset-hash=hash`,
    );
  });

  it('leaves remote sources as they are when the proxy is disabled', () => {
    vi.stubEnv('VITE_MC_PROXY_ENABLED', 'false');
    expect(resolveAssetUrl(REMOTE, assetHash)).toStrictEqual({
      key: REMOTE,
      src: REMOTE,
    });
  });

  it('does not read the asset hash for sources of another origin', () => {
    vi.stubEnv('VITE_MC_PROXY_ENABLED', 'false');
    resolveAssetUrl(REMOTE, assetHash);
    resolveAssetUrl('data:image/png;base64,AAAA', assetHash);
    resolveAssetUrl(null, assetHash);
    expect(assetHash).not.toHaveBeenCalled();
  });

  it('routes remote sources through the proxy when it is enabled', () => {
    vi.stubEnv('VITE_MC_PROXY_ENABLED', 'true');
    vi.stubEnv('VITE_MC_PROXY_ALLOW_LIST', '[]');
    const proxied = `/cors-proxy/${encodeURIComponent(REMOTE)}`;
    const {key, src} = resolveAssetUrl(REMOTE, assetHash);
    expect(key).toBe(proxied);
    expect(src).toBe(`${window.location.origin}${proxied}?asset-hash=hash`);
  });
});
