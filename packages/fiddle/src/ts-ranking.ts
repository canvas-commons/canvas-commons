import ts from 'typescript';
import type {TsCompletionEntry, TsCompletionSection} from './ts-protocol';

const SORT_TEXT_GLOBALS_OR_KEYWORDS = 15;
const SORT_TEXT_DEPRECATED_PREFIX = 'z';

/**
 * The boost given to each completion tier.
 *
 * The tiers sit wider apart than CodeMirror's small match penalties and closer
 * than its large ones, so a tier decides between two comparable matches while
 * a prefix match still outranks a mid-word one.
 */
export const RANK_TIER = {
  inScope: 600,
  autoImport: 200,
  ambientGlobal: 0,
  keyword: -250,
} as const;

const DEPRECATED_PENALTY = -900;

/**
 * The most entries per request whose type the contextual pass resolves.
 */
export const CONTEXTUAL_RESOLUTION_LIMIT = 400;

const CONTEXTUAL_SECTION_RANK = 1;
const REMAINDER_SECTION_RANK = 2;
const REMAINDER_SECTION_NAME = 'other';
const MAX_SECTION_NAME_LENGTH = 32;
const FALLBACK_SECTION_NAME = 'matching';

const UNINFORMATIVE_TYPE =
  ts.TypeFlags.Any |
  ts.TypeFlags.Unknown |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Null |
  ts.TypeFlags.Never;

const TYPE_DECLARING_FLAGS =
  ts.SymbolFlags.Class |
  ts.SymbolFlags.Interface |
  ts.SymbolFlags.Enum |
  ts.SymbolFlags.TypeAlias;

/**
 * Score one completion entry by what kind of symbol it is, as a boost
 * CodeMirror adds to the entry's own match score.
 *
 * @example
 * ```ts
 * generalBoost({name: 'view', kind: 'parameter', sortText: '11'});
 * ```
 */
export function generalBoost(entry: TsCompletionEntry): number {
  const deprecated =
    entry.sortText.startsWith(SORT_TEXT_DEPRECATED_PREFIX) ||
    (entry.kindModifiers ?? '').includes('deprecated');
  const tier = baseTier(entry);
  return deprecated ? tier + DEPRECATED_PENALTY : tier;
}

function baseTier(entry: TsCompletionEntry): number {
  if (entry.kind === 'keyword') return RANK_TIER.keyword;
  if (entry.source) return RANK_TIER.autoImport;
  const priority = Number(entry.sortText.replace(/^\D+/, ''));
  if (Number.isFinite(priority) && priority < SORT_TEXT_GLOBALS_OR_KEYWORDS) {
    return RANK_TIER.inScope;
  }
  return RANK_TIER.ambientGlobal;
}

function isFenceVocabulary(entry: TsCompletionEntry): boolean {
  const tier = baseTier(entry);
  return tier === RANK_TIER.inScope || tier === RANK_TIER.autoImport;
}

function tokenAt(sourceFile: ts.SourceFile, pos: number): ts.Node {
  let current: ts.Node = sourceFile;
  descend: for (;;) {
    for (const child of current.getChildren(sourceFile)) {
      if (child.getFullStart() <= pos && pos <= child.getEnd()) {
        if (child.getChildCount(sourceFile) === 0) return child;
        current = child;
        continue descend;
      }
    }
    return current;
  }
}

function isUsable(type: ts.Type | undefined): type is ts.Type {
  return type !== undefined && (type.flags & UNINFORMATIVE_TYPE) === 0;
}

function contextualTypeAt(
  checker: ts.TypeChecker,
  token: ts.Node,
  pos: number,
): ts.Type | undefined {
  if (ts.isExpression(token)) {
    const direct = checker.getContextualType(token);
    if (isUsable(direct)) return direct;
  }
  return argumentParameterType(checker, token, pos);
}

function argumentParameterType(
  checker: ts.TypeChecker,
  token: ts.Node,
  pos: number,
): ts.Type | undefined {
  let node: ts.Node | undefined = token;
  while (node && !ts.isCallExpression(node) && !ts.isNewExpression(node)) {
    node = node.parent;
  }
  if (!node) return undefined;
  const args = node.arguments;
  if (!args) return undefined;
  const index = args.filter(argument => argument.getEnd() < pos).length;
  const parameters = checker.getResolvedSignature(node)?.getParameters();
  const parameter = parameters?.[index];
  if (!parameter) return undefined;
  const type = checker.getTypeOfSymbolAtLocation(parameter, node);
  return isUsable(type) ? type : undefined;
}

/**
 * Everything the contextual pass needs to resolve types at one position.
 */
export interface ContextualScope {
  checker: ts.TypeChecker;
  program: ts.Program;
  moduleResolutionHost: ts.ModuleResolutionHost;
  sourceFile: ts.SourceFile;
  pos: number;
}

interface CachedModuleExports {
  file: ts.SourceFile;
  symbols: Map<string, ts.Symbol>;
}

const ModuleExportCache = new Map<string, CachedModuleExports>();

class SymbolResolver {
  private inScope: Map<string, ts.Symbol> | null = null;

  public constructor(
    private readonly scope: ContextualScope,
    private readonly token: ts.Node,
  ) {}

  public lookup(entry: TsCompletionEntry): ts.Symbol | undefined {
    if (entry.source) {
      const specifier = entry.source.replace(/^["']|["']$/g, '');
      return this.exportsOf(specifier).get(entry.name);
    }
    return this.scopeSymbols().get(entry.name);
  }

  private scopeSymbols(): Map<string, ts.Symbol> {
    if (this.inScope) return this.inScope;
    const map = new Map<string, ts.Symbol>();
    const meaning =
      ts.SymbolFlags.Value | ts.SymbolFlags.Type | ts.SymbolFlags.Alias;
    const symbols = this.scope.checker.getSymbolsInScope(this.token, meaning);
    for (const symbol of symbols) {
      if (!map.has(symbol.name)) map.set(symbol.name, symbol);
    }
    this.inScope = map;
    return map;
  }

  private exportsOf(specifier: string): Map<string, ts.Symbol> {
    const {program, checker, sourceFile, moduleResolutionHost} = this.scope;
    const resolved = ts.resolveModuleName(
      specifier,
      sourceFile.fileName,
      program.getCompilerOptions(),
      moduleResolutionHost,
    );
    const moduleFile =
      resolved.resolvedModule &&
      program.getSourceFile(resolved.resolvedModule.resolvedFileName);
    if (!moduleFile) return new Map();

    const cached = ModuleExportCache.get(specifier);
    if (cached && cached.file === moduleFile) return cached.symbols;

    const symbols = new Map<string, ts.Symbol>();
    const moduleSymbol = checker.getSymbolAtLocation(moduleFile);
    if (moduleSymbol) {
      for (const exported of checker.getExportsOfModule(moduleSymbol)) {
        symbols.set(exported.name, exported);
      }
    }
    ModuleExportCache.set(specifier, {file: moduleFile, symbols});
    return symbols;
  }
}

function typeOfEntrySymbol(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  token: ts.Node,
): ts.Type | undefined {
  let resolved = symbol;
  if (resolved.flags & ts.SymbolFlags.Alias) {
    try {
      resolved = checker.getAliasedSymbol(resolved);
    } catch {
      return undefined;
    }
  }
  if (resolved.flags & TYPE_DECLARING_FLAGS) {
    return checker.getDeclaredTypeOfSymbol(resolved);
  }
  return checker.getTypeOfSymbolAtLocation(resolved, token);
}

function identifierPrefix(
  sourceFile: ts.SourceFile,
  token: ts.Node,
  pos: number,
): string {
  const isIdentifier =
    ts.isIdentifier(token) || token.kind === ts.SyntaxKind.PrivateIdentifier;
  if (!isIdentifier) return '';
  const text = token.getText(sourceFile);
  const offset = pos - token.getStart(sourceFile);
  return offset > 0 && offset <= text.length ? text.slice(0, offset) : text;
}

function sectionName(checker: ts.TypeChecker, type: ts.Type): string {
  const name = checker.typeToString(type);
  return name.length <= MAX_SECTION_NAME_LENGTH ? name : FALLBACK_SECTION_NAME;
}

function contextualMatches(
  entries: TsCompletionEntry[],
  scope: ContextualScope,
): {names: Set<string>; name: string} {
  const empty = {names: new Set<string>(), name: ''};
  const token = tokenAt(scope.sourceFile, scope.pos);
  const contextual = contextualTypeAt(scope.checker, token, scope.pos);
  if (!contextual) return empty;

  const prefix = identifierPrefix(
    scope.sourceFile,
    token,
    scope.pos,
  ).toLowerCase();
  const candidates = entries
    .filter(
      entry =>
        isFenceVocabulary(entry) &&
        (!prefix || entry.name.toLowerCase().startsWith(prefix)),
    )
    .sort((a, b) => generalBoost(b) - generalBoost(a))
    .slice(0, CONTEXTUAL_RESOLUTION_LIMIT);

  const resolver = new SymbolResolver(scope, token);
  const names = new Set<string>();
  for (const entry of candidates) {
    const symbol = resolver.lookup(entry);
    if (!symbol) continue;
    const type = typeOfEntrySymbol(scope.checker, symbol, token);
    if (isUsable(type) && scope.checker.isTypeAssignableTo(type, contextual)) {
      names.add(entry.name);
    }
  }
  return {names, name: sectionName(scope.checker, contextual)};
}

const REMAINDER_SECTION: TsCompletionSection = {
  name: REMAINDER_SECTION_NAME,
  rank: REMAINDER_SECTION_RANK,
};

/**
 * Stamp a boost, and where possible a section, onto every completion entry.
 * Pass a null scope to boost without sectioning.
 *
 * The contextual section ranks, it does not filter. Entries assignable to the
 * type expected at the cursor lead, and the rest follow in a remainder
 * section.
 *
 * @example
 * ```ts
 * const ranked = rankCompletionEntries(entries, null);
 * ```
 */
export function rankCompletionEntries(
  entries: TsCompletionEntry[],
  scope: ContextualScope | null,
): TsCompletionEntry[] {
  const contextual = scope
    ? contextualMatches(entries, scope)
    : {names: new Set<string>(), name: ''};
  const sectioned = contextual.names.size > 0;
  const matching: TsCompletionSection | undefined = sectioned
    ? {name: contextual.name, rank: CONTEXTUAL_SECTION_RANK}
    : undefined;
  return entries.map(entry => ({
    ...entry,
    boost: generalBoost(entry),
    section: sectioned
      ? contextual.names.has(entry.name)
        ? matching
        : REMAINDER_SECTION
      : undefined,
  }));
}
