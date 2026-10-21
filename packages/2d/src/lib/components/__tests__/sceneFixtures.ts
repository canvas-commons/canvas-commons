import {useScene2D} from '../../scenes';
import {Node} from '../Node';
import {Txt} from '../Txt';

export function add(node: Node): void {
  useScene2D().getView().add(node);
}

export function lineTexts(txt: Txt): string[] {
  return txt
    .textLines()
    .lines.map(line => line.fragments.map(fragment => fragment.text).join(''));
}

export function fontSizeOf(font: string): number {
  return Number(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 0);
}

export const CHAR_WIDTH = 10;
const KERN = 2;

/** `AV` measures narrower than `A` and `V` do on their own. */
export function kernedWidth(text: string): number {
  const pairs = text.split('AV').length - 1;
  return text.length * CHAR_WIDTH - pairs * KERN;
}

/** When an edit of one second with the default timing reaches `progress`. */
export function timeAt(progress: number): number {
  return progress < 0.5
    ? Math.cbrt(progress / 4)
    : 1 - Math.cbrt((1 - progress) / 4);
}

/** The pen x of the first glyph `char` in `glyphs` lines of `char@x,y:...`. */
export function penX(glyphs: readonly string[], char: string): number {
  const glyph = glyphs.find(glyph => glyph.startsWith(`${char}@`));
  return Number(glyph?.slice(char.length + 1, glyph.indexOf(',')));
}
