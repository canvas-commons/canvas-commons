import {
  ColorSignal,
  DependencyContext,
  PossibleColor,
  SignalValue,
  SimpleSignal,
  TimingFunction,
  isReactive,
  threadable,
  useLogger,
} from '@canvas-commons/core';
import {colorSignal, computed, initial, signal} from '../decorators';
import {SVG, SVGProps} from './SVG';

export interface IconProps extends Omit<SVGProps, 'svg'> {
  /**
   * {@inheritDoc Icon.icon}
   */
  icon: SignalValue<string>;

  /**
   * {@inheritDoc Icon.color}
   */
  color?: SignalValue<PossibleColor>;
}

const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="none"/></svg>';

/**
 * An Icon Component that provides easy access to over 150k icons.
 * See https://icones.js.org/collection/all for all available Icons.
 */
export class Icon extends SVG {
  private static iconSvgCache: Map<string, string> = new Map();
  private static pendingFetches: Map<string, Promise<string>> = new Map();

  /**
   * The identifier of the icon.
   *
   * @remarks
   * You can find identifiers on [Icônes](https://icones.js.org).
   * They can look like this:
   * * `mdi:language-typescript`
   * * `ph:anchor-simple-bold`
   * * `ph:activity-bold`
   */
  @signal()
  public declare readonly icon: SimpleSignal<string, this>;

  /**
   * The color of the icon
   *
   * @remarks
   * Provide the color in one of the following formats:
   * * named color like `red`, `darkgray`, …
   * * hexadecimal string with # like `#bada55`, `#141414`
   *   Value can be either RGB or RGBA: `#bada55`, `#bada55aa` (latter is partially transparent)
   *   The shorthand version (e.g. `#abc` for `#aabbcc` is also possible.)
   *
   * @defaultValue 'white'
   */
  @initial('white')
  @colorSignal()
  public declare readonly color: ColorSignal<this>;

  public constructor(props: IconProps) {
    super({
      ...props,
      svg: () => this.iconSvg(),
    });
  }

  protected override collectAsyncResources(): void {
    super.collectAsyncResources();
    this.iconSvg();
  }

  @computed()
  protected iconSvg(): string {
    const iconId = this.icon();
    const color = this.color().hex();
    const cacheKey = `${iconId}::${color}`;

    const cached = Icon.iconSvgCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const fetchPromise = this.fetchIconSvg(iconId, color);
    DependencyContext.collectPromise(fetchPromise);

    return PLACEHOLDER_SVG;
  }

  private async fetchIconSvg(iconId: string, color: string): Promise<string> {
    const cacheKey = `${iconId}::${color}`;

    const cached = Icon.iconSvgCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const pending = Icon.pendingFetches.get(cacheKey);
    if (pending !== undefined) {
      return pending;
    }

    const iconPath = iconId.replace(':', '/');
    const encodedColor = encodeURIComponent(color);
    const url = `https://api.iconify.design/${iconPath}.svg?color=${encodedColor}`;

    const fetchPromise = fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to fetch icon: ${iconId}`);
        }
        return response.text();
      })
      .then(svg => {
        Icon.iconSvgCache.set(cacheKey, svg);
        Icon.pendingFetches.delete(cacheKey);
        return svg;
      })
      .catch(error => {
        Icon.pendingFetches.delete(cacheKey);
        useLogger().error(`Error fetching icon ${iconId}: ${error}`);
        return PLACEHOLDER_SVG;
      });

    Icon.pendingFetches.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  @threadable()
  protected *tweenIcon(
    value: SignalValue<string>,
    time: number,
    timingFunction: TimingFunction,
  ) {
    const newIconId = isReactive(value) ? value() : value;
    const color = this.color().hex();

    const newSvg: string = yield this.fetchIconSvg(newIconId, color);

    yield* this.svg(newSvg, time, timingFunction);
    this.icon.context.setter(newIconId);
  }
}
