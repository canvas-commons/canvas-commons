import type {BabelPluginObject} from '@babel/standalone';
import * as Babel from '@babel/standalone';
import type {
  AssignmentExpression,
  CallExpression,
  ClassProperty,
  ExportAllDeclaration,
  ExportNamedDeclaration,
  ExpressionStatement,
  ImportDeclaration,
  ImportExpression,
  Node,
  StringLiteral,
} from '@babel/types';

/**
 * A compile-time problem, positioned as character offsets into the source.
 *
 * @example
 * ```ts
 * const diagnostic: FiddleDiagnostic = {
 *   from: 0,
 *   to: 12,
 *   message: 'Import "node:fs" is not allowed in fiddle code.',
 *   severity: 'error',
 * };
 * ```
 */
export interface FiddleDiagnostic {
  from: number;
  to: number;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Extra module specifiers a fiddle may import, beyond the built-in three.
 */
export interface CompileOptions {
  extraSpecifiers?: string[];
}

/**
 * The emitted module and every problem found while producing it.
 */
export interface CompileResult {
  code: string;
  diagnostics: FiddleDiagnostic[];
}

interface Scope {
  hasBinding(name: string): boolean;
}

interface NodePath<TNode> {
  node: TNode;
  scope: Scope;
}

interface TraversalPath<TNode> {
  node: TNode;
  parent: Node;
  remove(): void;
}

/* eslint-disable @typescript-eslint/naming-convention -- Babel visitor keys
   are AST node type names. */
interface TraversalVisitor {
  AssignmentExpression?(path: TraversalPath<AssignmentExpression>): void;
  CallExpression?(path: TraversalPath<CallExpression>): void;
  ClassProperty?(path: TraversalPath<ClassProperty>): void;
  ExpressionStatement?(path: TraversalPath<ExpressionStatement>): void;
}
/* eslint-enable @typescript-eslint/naming-convention */

interface ProgramPath {
  traverse(visitor: TraversalVisitor): void;
}

interface PluginPass {
  file: {addHelper(name: string): {name: string}};
}

const REQUIRED_PLUGINS = [
  'transform-typescript',
  'proposal-decorators',
  'transform-class-properties',
  'transform-private-methods',
  'transform-class-static-block',
] as const;

const CLASS_ASSUMPTIONS = {
  setPublicClassFields: true,
  privateFieldsAsProperties: true,
};

for (const name of REQUIRED_PLUGINS) {
  if (!(name in Babel.availablePlugins)) {
    throw new Error(
      `[fiddle/compiler] @babel/standalone is missing required plugin "${name}".`,
    );
  }
}

const CORE_SPECIFIERS: readonly string[] = [
  '@canvas-commons/core',
  '@canvas-commons/2d',
  '@canvas-commons/2d/jsx-runtime',
];

function buildAllowlist(extraSpecifiers: string[]): ReadonlySet<string> {
  return new Set([...CORE_SPECIFIERS, ...extraSpecifiers]);
}

function checkSource(
  sourceNode: StringLiteral,
  allowedSpecifiers: ReadonlySet<string>,
  diagnostics: FiddleDiagnostic[],
): void {
  if (allowedSpecifiers.has(sourceNode.value)) return;
  diagnostics.push({
    from: sourceNode.start ?? 0,
    to: sourceNode.end ?? 0,
    message: `Import "${sourceNode.value}" is not allowed in fiddle code.`,
    severity: 'error',
  });
}

function isStringLiteral(node: Node): node is StringLiteral {
  return node.type === 'StringLiteral';
}

function importAllowlistPlugin(
  allowedSpecifiers: ReadonlySet<string>,
  diagnostics: FiddleDiagnostic[],
): () => BabelPluginObject {
  return () => ({
    name: 'fiddle-import-allowlist',
    /* eslint-disable @typescript-eslint/naming-convention -- Babel visitor
       keys are AST node type names. */
    visitor: {
      ImportDeclaration(path: NodePath<ImportDeclaration>) {
        checkSource(path.node.source, allowedSpecifiers, diagnostics);
      },
      ExportNamedDeclaration(path: NodePath<ExportNamedDeclaration>) {
        if (path.node.source) {
          checkSource(path.node.source, allowedSpecifiers, diagnostics);
        }
      },
      ExportAllDeclaration(path: NodePath<ExportAllDeclaration>) {
        checkSource(path.node.source, allowedSpecifiers, diagnostics);
      },
      ImportExpression(path: NodePath<ImportExpression>) {
        const source = path.node.source;
        if (isStringLiteral(source)) {
          checkSource(source, allowedSpecifiers, diagnostics);
          return;
        }
        diagnostics.push({
          from: source.start ?? 0,
          to: source.end ?? 0,
          message: 'Dynamic import() in fiddle code must use a string literal.',
          severity: 'error',
        });
      },
    },
    /* eslint-enable @typescript-eslint/naming-convention */
  });
}

function collectImportDiagnostics(
  source: string,
  allowedSpecifiers: ReadonlySet<string>,
  diagnostics: FiddleDiagnostic[],
): void {
  Babel.transform(source, {
    filename: 'fiddle.tsx',
    assumptions: CLASS_ASSUMPTIONS,
    code: false,
    parserOpts: {plugins: ['jsx']},
    plugins: [
      ['transform-typescript', {isTSX: true, onlyRemoveTypeImports: true}],
      ['proposal-decorators', {version: 'legacy'}],
      'transform-class-properties',
      'transform-private-methods',
      'transform-class-static-block',
      importAllowlistPlugin(allowedSpecifiers, diagnostics),
    ],
  });
}

function isCallTo(
  node: Node,
  name: string | undefined,
): node is CallExpression {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === name
  );
}

function declaresNoValue(node: Node | undefined): boolean {
  if (!node || node.type !== 'ObjectExpression') return false;
  return node.properties.some(
    property =>
      property.type === 'ObjectProperty' &&
      property.key.type === 'Identifier' &&
      property.key.name === 'initializer' &&
      property.value.type === 'NullLiteral',
  );
}

function assignedName(node: Node): string | null {
  if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') {
    return node.left.name;
  }
  if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
    return node.id.name;
  }
  return null;
}

function dropValuelessFieldWrites(): BabelPluginObject {
  const erasedInitializers = new WeakSet<Node>();
  let helpers: {descriptor: string; initializer: string} | undefined;
  return {
    name: 'fiddle-drop-valueless-field-writes',
    /* eslint-disable @typescript-eslint/naming-convention -- Babel visitor
       keys are AST node type names. */
    visitor: {
      Program: {
        enter(path: ProgramPath, state: PluginPass): void {
          helpers = undefined;
          path.traverse({
            ClassProperty(field) {
              if (field.node.decorators?.length) {
                helpers ??= {
                  descriptor: state.file.addHelper('applyDecoratedDescriptor')
                    .name,
                  initializer: state.file.addHelper('initializerDefineProperty')
                    .name,
                };
                return;
              }
              if (field.node.value || field.node.declare) {
                return;
              }
              field.node.value = {
                type: 'UnaryExpression',
                operator: 'void',
                prefix: true,
                argument: {type: 'NumericLiteral', value: 0},
              };
              erasedInitializers.add(field.node.value);
            },
          });
        },
        exit(path: ProgramPath): void {
          const valueless = new Set<string>();
          path.traverse({
            CallExpression(call) {
              if (!isCallTo(call.node, helpers?.descriptor)) return;
              if (!declaresNoValue(call.node.arguments[3])) return;
              const name = assignedName(call.parent);
              if (name !== null) valueless.add(name);
            },
          });
          path.traverse({
            AssignmentExpression(assignment) {
              if (erasedInitializers.has(assignment.node.right)) {
                assignment.remove();
              }
            },
            ExpressionStatement(statement) {
              const call = statement.node.expression;
              if (!isCallTo(call, helpers?.initializer)) return;
              const descriptor = call.arguments[2];
              if (descriptor?.type !== 'Identifier') return;
              if (!valueless.has(descriptor.name)) return;
              statement.remove();
            },
          });
        },
      },
    },
    /* eslint-enable @typescript-eslint/naming-convention */
  };
}

function hasNumericPos(error: unknown): error is {pos: number} {
  return (
    typeof error === 'object' &&
    error !== null &&
    'pos' in error &&
    typeof error.pos === 'number'
  );
}

function diagnosticFromParseError(error: unknown): FiddleDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  const pos = hasNumericPos(error) ? error.pos : 0;
  return {from: pos, to: pos, message, severity: 'error'};
}

/**
 * Compiles fiddle source, TSX with legacy decorators and class properties,
 * into a runnable ES module.
 *
 * Never throws. Parse errors and disallowed imports come back as diagnostics,
 * and `code` is empty when parsing failed.
 *
 * @example
 * ```ts
 * const {code, diagnostics} = compileFiddle(
 *   `import {makeScene2D} from '@canvas-commons/2d';
 *    export default makeScene2D(function* () {});`,
 * );
 * ```
 */
export function compileFiddle(
  source: string,
  options: CompileOptions = {},
): CompileResult {
  const diagnostics: FiddleDiagnostic[] = [];
  const allowedSpecifiers = buildAllowlist(options.extraSpecifiers ?? []);

  let result;
  try {
    collectImportDiagnostics(source, allowedSpecifiers, diagnostics);
    result = Babel.transform(source, {
      filename: 'fiddle.tsx',
      assumptions: CLASS_ASSUMPTIONS,
      presets: [
        [
          'react',
          {
            runtime: 'automatic',
            importSource: '@canvas-commons/2d',
            development: false,
          },
        ],
      ],
      plugins: [
        ['transform-typescript', {isTSX: true}],
        ['proposal-decorators', {version: 'legacy'}],
        'transform-class-properties',
        'transform-private-methods',
        'transform-class-static-block',
        dropValuelessFieldWrites,
      ],
    });
  } catch (error) {
    diagnostics.push(diagnosticFromParseError(error));
    return {code: '', diagnostics};
  }

  return {code: result?.code ?? '', diagnostics};
}
