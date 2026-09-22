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

export const CHAR_WIDTH = 10;
const KERN = 2;

/** `AV` measures narrower than `A` and `V` do on their own. */
export function kernedWidth(text: string): number {
  const pairs = text.split('AV').length - 1;
  return text.length * CHAR_WIDTH - pairs * KERN;
}
