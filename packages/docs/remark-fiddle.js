/** Validate each tab with the same compiler used by the browser runtime. */
async function validateFiddle(source) {
  const [{compileFiddle}, {parseFiddle}] = await Promise.all([
    import('@canvas-commons/fiddle/compiler'),
    import('@canvas-commons/fiddle/snippets'),
  ]);
  for (const snippet of parseFiddle(source)) {
    const result = compileFiddle(snippet.lines.join('\n'));
    const error = result.diagnostics.find(
      diagnostic => diagnostic.severity === 'error',
    );
    if (error) {
      throw new Error(`Invalid fiddle "${snippet.name}": ${error.message}`);
    }
  }
}

/** Validate the fenced code parts supplied by TypeDoc's comment parser. */
async function validateFiddleComment(parts) {
  for (const part of parts) {
    if (part.kind !== 'code') continue;
    const lines = part.text.trimEnd().split('\n');
    const opening = /^```\S*\s+(.*)/.exec(lines[0]);
    if (opening && /(?:^|\s)editor(?:\s|$)/.test(opening[1])) {
      await validateFiddle(lines.slice(1, -1).join('\n'));
    }
  }
}

/** Reject invalid live code fences during the documentation build. */
function remarkFiddle() {
  return async (tree, file) => {
    async function visit(node) {
      if (
        node.type === 'code' &&
        /(?:^|\s)editor(?:\s|$)/.test(node.meta ?? '')
      ) {
        try {
          await validateFiddle(node.value);
        } catch (error) {
          file.fail(error.message, node);
        }
      }
      for (const child of node.children ?? []) {
        await visit(child);
      }
    }
    await visit(tree);
  };
}

module.exports = remarkFiddle;
module.exports.validateFiddleComment = validateFiddleComment;
