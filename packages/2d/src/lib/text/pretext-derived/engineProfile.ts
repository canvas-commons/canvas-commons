// Copied from @chenglou/pretext 0.0.9, src/measurement.ts (`EngineProfile`
// lines 10-16 and `getEngineProfile` lines 71-110), commit
// 8460bf940c50d82be90a396fb0ea2c4e7a2dc6f3, under the MIT license in
// ./LICENSE. The copied walker must branch on the same engine rules and the
// same fit epsilon as the installed pretext.

export type EngineProfile = {
  geckoAsciiLineBreaks: boolean;
  lineFitEpsilon: number;
  carryCJKAfterClosingQuote: boolean;
  breakKeepAllAfterPunctuation: boolean;
  preferPrefixWidthsForBreakableRuns: boolean;
};

export const getEngineProfile = (() => {
  let cachedEngineProfile: EngineProfile | null = null;
  return function getEngineProfile(): EngineProfile {
    if (cachedEngineProfile !== null) return cachedEngineProfile;

    if (typeof navigator === 'undefined') {
      cachedEngineProfile = {
        geckoAsciiLineBreaks: false,
        lineFitEpsilon: 0.005,
        carryCJKAfterClosingQuote: false,
        breakKeepAllAfterPunctuation: true,
        preferPrefixWidthsForBreakableRuns: false,
      };
      return cachedEngineProfile;
    }

    const ua = navigator.userAgent;
    const vendor = navigator.vendor;
    const isSafari =
      vendor === 'Apple Computer, Inc.' &&
      ua.includes('Safari/') &&
      !ua.includes('Chrome/') &&
      !ua.includes('Chromium/') &&
      !ua.includes('CriOS/') &&
      !ua.includes('FxiOS/') &&
      !ua.includes('EdgiOS/');
    const isChromium =
      ua.includes('Chrome/') ||
      ua.includes('Chromium/') ||
      ua.includes('CriOS/') ||
      ua.includes('Edg/');
    const isGecko = ua.includes('Firefox/') && !ua.includes('FxiOS/');

    cachedEngineProfile = {
      geckoAsciiLineBreaks: isGecko,
      lineFitEpsilon: isSafari ? 1 / 64 : 0.005,
      carryCJKAfterClosingQuote: isChromium,
      breakKeepAllAfterPunctuation: !isSafari,
      preferPrefixWidthsForBreakableRuns: isSafari,
    };
    return cachedEngineProfile;
  };
})();
