import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useScene2D} from '../../scenes';
import {Img} from '../Img';
import {Layout} from '../Layout';
import {mockScene2D} from './mockScene2D';

describe('Img layout', () => {
  mockScene2D();

  beforeEach(() => {
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(
      240,
    );
    vi.spyOn(
      HTMLImageElement.prototype,
      'naturalHeight',
      'get',
    ).mockReturnValue(180);
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(
      true,
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it('resolves a standalone width-only image from its natural ratio', () => {
    const image = new Img({src: 'image.svg', width: 240});
    useScene2D().getView().add(image);

    expect(image.size().x).toBe(240);
    expect(image.size().y).toBe(180);
  });

  it('resolves a standalone height-only image from its natural ratio', () => {
    const image = new Img({src: 'image.svg', height: 180});
    useScene2D().getView().add(image);

    expect(image.size().x).toBe(240);
    expect(image.size().y).toBe(180);
  });

  it('uses the configured ratio for a standalone image', () => {
    const image = new Img({src: 'image.svg', width: 240, ratio: 2});
    useScene2D().getView().add(image);

    expect(image.size().x).toBe(240);
    expect(image.size().y).toBe(120);
  });

  it('uses the resolved width of a percentage-sized standalone image', () => {
    const image = new Img({src: 'image.svg', width: '50%'});
    useScene2D().getView().add(image);

    expect(image.size().x).toBe(960);
    expect(image.size().y).toBe(720);
  });

  it('uses the resolved height of a percentage-sized standalone image', () => {
    const image = new Img({src: 'image.svg', height: '50%'});
    useScene2D().getView().add(image);

    expect(image.size().x).toBe(720);
    expect(image.size().y).toBe(540);
  });

  it('uses the clamped width of a standalone image', () => {
    const image = new Img({src: 'image.svg', width: 240, maxWidth: 120});
    useScene2D().getView().add(image);

    expect(image.size().x).toBe(120);
    expect(image.size().y).toBe(90);
  });

  it('applies inferred-axis constraints to a standalone image', () => {
    const image = new Img({src: 'image.svg', width: 240, minHeight: 200});
    useScene2D().getView().add(image);

    expect(image.size().x).toBe(240);
    expect(image.size().y).toBe(200);
  });

  it('keeps flex child sizing unchanged', () => {
    const image = new Img({src: 'image.svg', width: 240});
    const parent = new Layout({layout: true});
    parent.add(image);
    useScene2D().getView().add(parent);

    expect(image.size().x).toBe(240);
    expect(image.size().y).toBe(180);
  });
});
