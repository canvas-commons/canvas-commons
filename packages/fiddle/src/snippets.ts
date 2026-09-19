/** A named editor tab and its source lines. */
export interface CodeSnippet {
  name: string;
  lines: string[];
}

const CommentRegex = /^\s*\/\/ ?(\S+) ?(.*)$/;

const IgnoredComments = [
  'highlight-next-line',
  'highlight-start',
  'highlight-end',
  'prettier-ignore',
];

/**
 * Split a fiddle into named tabs and remove documentation highlight markers.
 *
 * @example
 * ```ts
 * const snippets = parseFiddle('// snippet Example\nconst value = 1;');
 * ```
 */
export function parseFiddle(code: string): CodeSnippet[] {
  let snippet: CodeSnippet = {
    name: 'Default',
    lines: [],
  };
  const snippets = [snippet];
  for (const line of code.split('\n')) {
    const match = CommentRegex.exec(line);
    if (!match) {
      snippet.lines.push(line);
      continue;
    }

    const [, comment, snippetName] = match;
    if (IgnoredComments.includes(comment)) {
      continue;
    }

    if (comment !== 'snippet') {
      snippet.lines.push(line);
      continue;
    }

    if (snippet.lines.length > 0) {
      snippet = {name: snippetName, lines: []};
      snippets.push(snippet);
    } else {
      snippet.name = snippetName;
    }
  }

  return snippets;
}
