import {viaProxy} from '@canvas-commons/core';

/**
 * Resolve the url of a media asset and the key to pool it under.
 */
export function resolveAssetUrl(
  rawSrc: string | null,
  assetHash: () => string,
): {key: string; src: string} {
  if (!rawSrc) {
    return {key: '', src: ''};
  }

  const key = viaProxy(rawSrc);
  const url = new URL(key, window.location.origin);
  if (url.origin === window.location.origin) {
    url.searchParams.set('asset-hash', assetHash());
  }

  return {key, src: url.toString()};
}
