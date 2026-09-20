import type {Layout} from '../components/Layout';
import type {Txt} from '../components/Txt';
import type {TxtLeaf} from '../components/TxtLeaf';

/** Half-open range in the concatenated source text of a `Txt`. */
export type SourceRange = {
  start: number;
  end: number;
};

/** Parts of a canvas font string, kept so a run can be rescaled. */
export type FontComponents = {
  style: string;
  weight: number;
  size: number;
  family: string;
};

/** Everything text measurement depends on. */
export type MetricStyle = {
  font: string;
  fontComponents: FontComponents;
  letterSpacing: number;
};

type RunBase = {
  source: SourceRange;
  metrics: MetricStyle;
  /** The `Txt` whose paint properties apply to this run. */
  owner: Txt;
};

export type TextRun = RunBase & {
  kind: 'text';
  text: string;
  leaf: TxtLeaf;
};

export type InlineRun = RunBase & {
  kind: 'inline';
  node: Layout;
  width: number;
  height: number;
};

/**
 * One piece of a `Txt`'s content: a styled slice of text, or an inline
 * `Layout` child that occupies a slot in the text flow.
 */
export type Run = TextRun | InlineRun;
