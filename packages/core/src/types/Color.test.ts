import {describe, expect, test} from 'vitest';
import {Color} from './Color';

describe('Color', () => {
  describe('constructor', () => {
    test('creates from named color string', () => {
      const color = new Color('red');
      expect(color.hex()).toBe('#ff0000');
    });

    test('creates from hex string', () => {
      const color = new Color('#bada55');
      expect(color.hex()).toBe('#bada55');
    });

    test('creates from rgb string', () => {
      const color = new Color('rgb(255, 128, 0)');
      expect(color.css()).toBe('rgb(255 128 0)');
    });

    test('creates from number', () => {
      const color = new Color(0xff0000);
      expect(color.hex()).toBe('#ff0000');
    });

    test('creates from Color instance (copy)', () => {
      const original = new Color('red');
      const copy = new Color(original);
      expect(copy.hex()).toBe('#ff0000');
    });

    test('creates from {r, g, b, a} object', () => {
      const color = new Color({r: 255, g: 0, b: 0, a: 0.5});
      expect(color.hex('rgb')).toBe('#ff0000');
      expect(color.alpha()).toBe(0.5);
    });
  });

  describe('instanceof', () => {
    test('Color instances pass instanceof check', () => {
      expect(new Color('red')).toBeInstanceOf(Color);
    });

    test('colors from lerp pass instanceof check', () => {
      expect(Color.lerp('red', 'blue', 0.5)).toBeInstanceOf(Color);
    });

    test('colors from fromHsv pass instanceof check', () => {
      expect(Color.fromHsv(0, 1, 1)).toBeInstanceOf(Color);
    });

    test('colors from alpha setter pass instanceof check', () => {
      expect(new Color('red').alpha(0.5)).toBeInstanceOf(Color);
    });

    test('colors from brighten pass instanceof check', () => {
      expect(new Color('red').brighten()).toBeInstanceOf(Color);
    });
  });

  describe('lerp', () => {
    test('interpolates between colors', () => {
      expect(
        Color.lerp('rgb(0, 0, 0)', 'rgb(255, 255, 255)', 1 / 2).css(),
      ).toMatchInlineSnapshot(`"rgb(119 119 119)"`);
      expect(
        Color.lerp('hsl(0, 0%, 0%)', 'hsl(0, 0%, 100%)', 1 / 2).css(),
      ).toMatchInlineSnapshot(`"rgb(119 119 119)"`);
    });

    test('returns starting value at 0', () => {
      expect(Color.lerp('rgb(0, 0, 0)', 'rgb(255, 255, 255)', 0).css()).toEqual(
        'rgb(0 0 0)',
      );
    });

    test('returns final value at 1', () => {
      expect(Color.lerp('rgb(0, 0, 0)', 'rgb(255, 255, 255)', 1).css()).toEqual(
        'rgb(255 255 255)',
      );
    });

    test('handles null from', () => {
      const result = Color.lerp(null, 'red', 0.5);
      expect(result).toBeInstanceOf(Color);
    });

    test('handles null to', () => {
      const result = Color.lerp('red', null, 0.5);
      expect(result).toBeInstanceOf(Color);
    });

    test('handles both null', () => {
      const result = Color.lerp(null, null, 0.5);
      expect(result).toBeInstanceOf(Color);
    });

    test('accepts Color instances', () => {
      const from = new Color('red');
      const to = new Color('blue');
      const result = Color.lerp(from, to, 0.5);
      expect(result).toBeInstanceOf(Color);
    });

    test('accepts custom color space', () => {
      const rgb = Color.lerp('red', 'blue', 0.5, 'rgb');
      const lch = Color.lerp('red', 'blue', 0.5, 'lch');
      expect(rgb.hex()).not.toBe(lch.hex());
    });

    test('instance lerp delegates to static', () => {
      const from = new Color('red');
      const to = new Color('blue');
      expect(from.lerp(to, 0.5).hex()).toBe(
        Color.lerp('red', 'blue', 0.5).hex(),
      );
    });
  });

  describe('alpha', () => {
    test('getter returns alpha value', () => {
      expect(new Color('rgba(255, 0, 0, 0.5)').alpha()).toBe(0.5);
    });

    test('getter returns 1 for opaque colors', () => {
      expect(new Color('red').alpha()).toBe(1);
    });

    test('setter returns new Color with updated alpha', () => {
      const original = new Color('red');
      const modified = original.alpha(0.5);
      expect(modified).toBeInstanceOf(Color);
      expect(modified.alpha()).toBe(0.5);
    });

    test('setter does not mutate original', () => {
      const original = new Color('red');
      original.alpha(0.5);
      expect(original.alpha()).toBe(1);
    });
  });

  describe('serialize', () => {
    test('returns css string', () => {
      expect(new Color('red').serialize()).toBe('rgb(255 0 0)');
    });

    test('roundtrips through constructor', () => {
      const original = new Color('#bada55');
      const roundtripped = new Color(original.serialize());
      expect(roundtripped.hex()).toBe(original.hex());
    });
  });

  describe('hex', () => {
    test('returns hex string', () => {
      expect(new Color('red').hex()).toBe('#ff0000');
    });

    test('includes alpha when mode is rgba', () => {
      expect(new Color('rgba(255, 0, 0, 0.5)').hex('rgba')).toBe('#ff000080');
    });

    test('excludes alpha when mode is rgb', () => {
      expect(new Color('rgba(255, 0, 0, 0.5)').hex('rgb')).toBe('#ff0000');
    });
  });

  describe('css', () => {
    test('returns rgb css string', () => {
      expect(new Color('#ff8800').css()).toBe('rgb(255 136 0)');
    });
  });

  describe('gl', () => {
    test('returns normalized rgba values', () => {
      const gl = new Color('red').gl();
      expect(gl).toHaveLength(4);
      expect(gl[0]).toBeCloseTo(1);
      expect(gl[1]).toBeCloseTo(0);
      expect(gl[2]).toBeCloseTo(0);
      expect(gl[3]).toBeCloseTo(1);
    });
  });

  describe('hsv', () => {
    test('returns hsv components', () => {
      const [h, s, v] = new Color('red').hsv();
      expect(h).toBeCloseTo(0);
      expect(s).toBeCloseTo(1);
      expect(v).toBeCloseTo(1);
    });
  });

  describe('brighten', () => {
    test('returns brighter color', () => {
      const original = new Color('#333333');
      const brighter = original.brighten(1);
      expect(brighter).toBeInstanceOf(Color);
      expect(brighter.hex()).not.toBe(original.hex());
    });
  });

  describe('get', () => {
    test('returns channel value', () => {
      const color = new Color('red');
      expect(color.get('rgb.r')).toBe(255);
      expect(color.get('rgb.g')).toBe(0);
      expect(color.get('rgb.b')).toBe(0);
    });
  });

  describe('toSymbol', () => {
    test('returns Color.symbol', () => {
      expect(new Color('red').toSymbol()).toBe(Color.symbol);
    });
  });

  describe('isValid', () => {
    test('returns true for valid colors', () => {
      expect(Color.isValid('red')).toBe(true);
      expect(Color.isValid('#ff0000')).toBe(true);
      expect(Color.isValid('rgb(255 0 0)')).toBe(true);
    });

    test('returns false for invalid colors', () => {
      expect(Color.isValid('notacolor')).toBe(false);
      expect(Color.isValid('')).toBe(false);
    });
  });

  describe('fromHsv', () => {
    test('creates color from hsv values', () => {
      const color = Color.fromHsv(0, 1, 1);
      expect(color).toBeInstanceOf(Color);
      expect(color.hex()).toBe('#ff0000');
    });

    test('accepts alpha parameter', () => {
      const color = Color.fromHsv(0, 1, 1, 0.5);
      expect(color.alpha()).toBe(0.5);
    });
  });

  describe('createLerp', () => {
    test('creates interpolation function for color space', () => {
      const rgbLerp = Color.createLerp('rgb');
      const result = rgbLerp(new Color('red'), new Color('blue'), 0.5);
      expect(result).toBeInstanceOf(Color);
    });
  });

  describe('toString', () => {
    test('returns css string', () => {
      expect(`${new Color('red')}`).toBe('rgb(255 0 0)');
    });
  });
});
