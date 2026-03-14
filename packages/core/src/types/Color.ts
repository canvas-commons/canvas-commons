import chroma from 'chroma-js';
import {Signal, SignalContext, SignalValue} from '../signals';
import type {InterpolationFunction} from '../tweening';
import type {Type, WebGLConvertible} from './Type';

export type SerializedColor = string;

export type PossibleColor =
  | SerializedColor
  | number
  | Color
  | {r: number; g: number; b: number; a: number};

export type ColorSignal<T> = Signal<PossibleColor, Color, T>;

export type ColorSpace =
  | 'rgb'
  | 'hsl'
  | 'hsv'
  | 'hsi'
  | 'lab'
  | 'oklab'
  | 'lch'
  | 'oklch'
  | 'hcl'
  | 'lrgb';

/**
 * Represents a color.
 *
 * @remarks
 * Wraps {@link https://gka.github.io/chroma.js/ | chroma.js} internally,
 * providing color creation, conversion, and interpolation.
 */
export class Color implements Type, WebGLConvertible {
  public static readonly symbol = Symbol.for(
    '@canvas-commons/core/types/Color',
  );

  private inner: chroma.Color;

  public constructor(input: PossibleColor) {
    if (input instanceof Color) {
      this.inner = input.inner;
      return;
    }

    if (typeof input === 'object' && input !== null && 'r' in input) {
      this.inner = chroma.rgb(input.r, input.g, input.b, input.a);
      return;
    }

    this.inner = chroma(input);
  }

  private static fromChroma(inner: chroma.Color): Color {
    const color = new Color(0);
    color.inner = inner;
    return color;
  }

  public static lerp(
    from: Color | string | null,
    to: Color | string | null,
    value: number,
    colorSpace: ColorSpace = 'lch',
  ): Color {
    const fromColor =
      from === null ? null : typeof from === 'string' ? new Color(from) : from;
    const toColor =
      to === null ? null : typeof to === 'string' ? new Color(to) : to;

    const resolvedFrom =
      fromColor ?? toColor?.alpha(0) ?? new Color('rgba(0, 0, 0, 0)');
    const resolvedTo =
      toColor ?? fromColor?.alpha(0) ?? new Color('rgba(0, 0, 0, 0)');

    return Color.fromChroma(
      chroma.mix(resolvedFrom.inner, resolvedTo.inner, value, colorSpace),
    );
  }

  public static createLerp(
    colorSpace: ColorSpace,
  ): InterpolationFunction<Color> {
    return (
      from: Color | string | null,
      to: Color | string | null,
      value: number,
    ) => Color.lerp(from, to, value, colorSpace);
  }

  public static createSignal(
    initial?: SignalValue<PossibleColor>,
    interpolation: InterpolationFunction<Color> = Color.lerp,
  ): ColorSignal<void> {
    return new SignalContext(
      initial,
      interpolation,
      undefined,
      (value: PossibleColor) => new Color(value),
    ).toSignal();
  }

  public static fromHsv(h: number, s: number, v: number, a?: number): Color {
    const inner = chroma.hsv(h, s, v);
    if (a !== undefined) {
      return Color.fromChroma(inner.alpha(a));
    }
    return Color.fromChroma(inner);
  }

  public static isValid(input: string): boolean {
    return chroma.valid(input);
  }

  public hex(mode?: 'auto' | 'rgb' | 'rgba'): string {
    return this.inner.hex(mode);
  }

  public css(mode?: 'hsl'): string {
    return this.inner.css(mode);
  }

  public gl(): [number, number, number, number] {
    return this.inner.gl();
  }

  public alpha(): number;
  public alpha(value: number): Color;
  public alpha(value?: number): number | Color {
    if (value === undefined) {
      return this.inner.alpha();
    }
    return Color.fromChroma(this.inner.alpha(value));
  }

  public name(): string {
    return this.inner.name();
  }

  public rgb(round = true): [number, number, number] {
    return this.inner.rgb(round);
  }

  public rgba(round = true): [number, number, number, number] {
    return this.inner.rgba(round);
  }

  public hsl(): [number, number, number] {
    return this.inner.hsl();
  }

  public hsv(): [number, number, number] {
    return this.inner.hsv();
  }

  public hsi(): [number, number, number] {
    return this.inner.hsi();
  }

  public lab(): [number, number, number] {
    return this.inner.lab();
  }

  public lch(): [number, number, number] {
    return this.inner.lch();
  }

  public hcl(): [number, number, number] {
    return this.inner.hcl();
  }

  public oklab(): [number, number, number] {
    return this.inner.oklab();
  }

  public oklch(): [number, number, number] {
    return this.inner.oklch();
  }

  public num(): number {
    return this.inner.num();
  }

  public temperature(): number {
    return this.inner.temperature();
  }

  public clipped(): boolean {
    return this.inner.clipped();
  }

  public darken(amount?: number): Color {
    return Color.fromChroma(this.inner.darken(amount));
  }

  public brighten(amount?: number): Color {
    return Color.fromChroma(this.inner.brighten(amount));
  }

  public saturate(amount?: number): Color {
    return Color.fromChroma(this.inner.saturate(amount));
  }

  public desaturate(amount?: number): Color {
    return Color.fromChroma(this.inner.desaturate(amount));
  }

  public mix(
    color: Color | string,
    ratio?: number,
    colorSpace?: chroma.ColorFormat,
  ): Color {
    const other = typeof color === 'string' ? new Color(color) : color;
    return Color.fromChroma(this.inner.mix(other.inner, ratio, colorSpace));
  }

  public shade(ratio?: number, mode?: chroma.InterpolationMode): Color {
    return Color.fromChroma(this.inner.shade(ratio, mode));
  }

  public tint(ratio?: number, mode?: chroma.InterpolationMode): Color {
    return Color.fromChroma(this.inner.tint(ratio, mode));
  }

  public luminance(): number;
  public luminance(value: number, mode?: chroma.InterpolationMode): Color;
  public luminance(
    value?: number,
    mode?: chroma.InterpolationMode,
  ): number | Color {
    if (value === undefined) {
      return this.inner.luminance();
    }
    return Color.fromChroma(this.inner.luminance(value, mode));
  }

  public set(channel: string, value: string | number): Color {
    return Color.fromChroma(this.inner.set(channel, value));
  }

  public get(modechan: string): number {
    return this.inner.get(modechan);
  }

  public serialize(): SerializedColor {
    return this.css();
  }

  public toSymbol(): symbol {
    return Color.symbol;
  }

  public toUniform(
    gl: WebGL2RenderingContext,
    location: WebGLUniformLocation,
  ): void {
    gl.uniform4fv(location, this.gl());
  }

  public lerp(to: Color, value: number, colorSpace?: ColorSpace): Color {
    return Color.lerp(this, to, value, colorSpace);
  }

  public toString(): string {
    return this.css();
  }
}
