const assert = require('node:assert/strict');
const {test} = require('node:test');
const remarkFiddle = require('./remark-fiddle');

function validate(value, meta = 'editor mode=preview') {
  const node = {type: 'code', lang: 'tsx', meta, value};
  return remarkFiddle()(
    {type: 'root', children: [{type: 'blockquote', children: [node]}]},
    {
      fail(message, location) {
        assert.equal(location, node);
        throw new Error(message);
      },
    },
  );
}

test('ignores ordinary code fences', async () => {
  await validate('const = ;', 'title="example"');
});

test('validates every tab in a live fence', async () => {
  await assert.rejects(
    validate(
      '// snippet Valid\nexport default 1;\n// snippet Invalid\nconst = ;',
    ),
    /Invalid fiddle "Invalid"/,
  );
});

test('enforces the runtime import allowlist', async () => {
  await assert.rejects(
    validate("import value from 'node:fs'; export default value;"),
    /node:fs/,
  );
});

test('accepts inferred type imports in existing docs', async () => {
  await validate(
    "import {PossibleVector2} from '@canvas-commons/core'; const point: PossibleVector2 = [0, 0];",
  );
});

test('validates TypeDoc live fences and ignores illustrative code', async () => {
  await remarkFiddle.validateFiddleComment([
    {kind: 'code', text: '```tsx\nconst = ;\n```'},
    {kind: 'code', text: '```tsx editor\nexport default 1;\n```'},
  ]);
  await assert.rejects(
    remarkFiddle.validateFiddleComment([
      {kind: 'code', text: '```tsx editor mode=preview\nconst = ;\n```'},
    ]),
    /Invalid fiddle "Default"/,
  );
});
