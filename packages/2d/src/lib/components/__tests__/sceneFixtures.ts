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
