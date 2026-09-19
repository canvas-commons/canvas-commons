import {LezerHighlighter} from '@canvas-commons/2d';
import {HighlightStyle} from '@codemirror/language';
import {tags} from '@lezer/highlight';
import {parser as javascript} from '@lezer/javascript';

const MOCHA = {
  mauve: '#cba6f7',
  sky: '#89dceb',
  red: '#f38ba8',
  yellow: '#f9e2af',
  peach: '#fab387',
  text: '#cdd6f4',
  green: '#a6e3a1',
  overlay2: '#9399b2',
  blue: '#89b4fa',
};

/**
 * Creates the preview's TypeScript and JSX highlighter from the host's
 * Catppuccin palette, with Mocha colours for variables the host omits.
 *
 * @example
 * ```ts
 * Code.defaultHighlighter = createFiddleHighlighter(themeVariables);
 * ```
 */
export function createFiddleHighlighter(
  variables: Record<string, unknown> = {},
): LezerHighlighter {
  const color = (name: keyof typeof MOCHA): string => {
    const value = variables[`--cc-${name}`];
    return typeof value === 'string' && value.trim()
      ? value.trim()
      : MOCHA[name];
  };

  return new LezerHighlighter(
    javascript.configure({dialect: 'jsx ts'}),
    HighlightStyle.define([
      {tag: tags.keyword, color: color('mauve')},
      {tag: tags.operator, color: color('sky')},
      {
        tag: [
          tags.special(tags.variableName),
          tags.atom,
          tags.tagName,
          tags.attributeName,
          tags.invalid,
        ],
        color: color('red'),
      },
      {tag: [tags.typeName, tags.className], color: color('yellow')},
      {tag: tags.number, color: color('peach')},
      {
        tag: [tags.definition(tags.variableName), tags.variableName],
        color: color('text'),
      },
      {
        tag: [tags.string, tags.special(tags.string)],
        color: color('green'),
      },
      {
        tag: [tags.comment, tags.bracket, tags.meta, tags.punctuation],
        color: color('overlay2'),
      },
      {
        tag: [
          tags.propertyName,
          tags.function(tags.variableName),
          tags.function(tags.propertyName),
          tags.definition(tags.function(tags.variableName)),
        ],
        color: color('blue'),
      },
    ]),
  );
}
