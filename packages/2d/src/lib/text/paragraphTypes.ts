import type {PreparedTextWithSegments} from '@chenglou/pretext';
import type {PreparedRichInline} from '@chenglou/pretext/rich-inline';
import type {Layout} from '../components/Layout';
import type {StyledFragment, Txt} from '../components/Txt';
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

/** Paint and metrics one run contributes to its fragments. */
export type FragmentStyle = StyledFragment['style'];

/** One line's worth of rich items, or a blank line when there are none. */
export type RichGroup = {
  prepared: PreparedRichInline | null;
  itemMap: number[];
};

/**
 * A paragraph measured by pretext and ready for line breaking: one prepared
 * text when every run shares a style, per-line rich groups otherwise.
 */
export type PreparedLayout = {
  /**
   * Narrowest width that never splits a word, in pretext-space pixels. `0`
   * under `overflowWrap: 'anywhere'`, where a grapheme is the only floor.
   */
  minContentWidth: number;
} & (
  | {
      kind: 'rich';
      groups: RichGroup[];
      runs: Run[];
    }
  | {
      kind: 'simple';
      prepared: PreparedTextWithSegments;
      style: FragmentStyle;
    }
);
