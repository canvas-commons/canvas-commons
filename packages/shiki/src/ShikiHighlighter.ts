import {CodeHighlighter, HighlightResult} from '@canvas-commons/2d';
import {DependencyContext, PromiseHandle} from '@canvas-commons/core';
import {
  BundledHighlighterOptions,
  CodeToTokensOptions,
  HighlighterGeneric,
  ThemedToken,
  createHighlighter,
} from 'shiki';
import {BundledLanguage} from 'shiki/langs';
import {BundledTheme} from 'shiki/themes';

/**
 * Options for configuring the ShikiHighlighter.
 */
export type ShikiOptions = {
  /**
   * Highlighter configuration with a single language and theme.
   */
  highlighter: Omit<
    BundledHighlighterOptions<BundledLanguage, BundledTheme>,
    'langs' | 'themes'
  > & {
    /**
     * The language to use for syntax highlighting.
     */
    lang: BundledHighlighterOptions<
      BundledLanguage,
      BundledTheme
    >['langs'][number];
    /**
     * The theme to use for syntax highlighting.
     */
    theme: BundledHighlighterOptions<
      BundledLanguage,
      BundledTheme
    >['themes'][number];
  };
  /**
   * Optional configuration for code tokenization.
   */
  codeToTokens?: CodeToTokensOptions<BundledLanguage, BundledTheme>;
};

/**
 * A code highlighter that uses Shiki for syntax highlighting.
 *
 * @remarks
 * Shiki provides accurate syntax highlighting using TextMate grammars,
 * the same engine used by VS Code. This highlighter supports all languages
 * and themes bundled with Shiki.
 *
 * @example
 * ```ts
 * const highlighter = new ShikiHighlighter({
 *   highlighter: {
 *     lang: 'typescript',
 *     theme: 'github-dark',
 *   },
 * });
 *
 * yield view.add(
 *   <Code highlighter={highlighter} code={`const x = 42;`} />
 * );
 * ```
 */
export class ShikiHighlighter implements CodeHighlighter<ThemedToken[]> {
  private shikiOptions: ShikiOptions;
  private handle: PromiseHandle<HighlighterGeneric<
    BundledLanguage,
    BundledTheme
  > | null> | null;

  /**
   * Creates a new ShikiHighlighter instance.
   *
   * @param shikiOptions - Configuration options for the highlighter.
   */
  public constructor(shikiOptions: ShikiOptions) {
    this.shikiOptions = shikiOptions;
    this.handle = null;
  }

  /**
   * Initializes the Shiki highlighter.
   *
   * @remarks
   * This method is called automatically when the highlighter is first used.
   * It returns `true` when the highlighter is ready, or `false` if it's still
   * loading asynchronously.
   */
  public initialize(): boolean {
    if (this.handle?.value !== undefined) {
      return true;
    } else {
      this.handle = DependencyContext.collectPromise(
        createHighlighter({
          ...this.shikiOptions.highlighter,
          langs: [this.shikiOptions.highlighter.lang],
          themes: [this.shikiOptions.highlighter.theme],
        }),
      );
      return false;
    }
  }

  /**
   * Prepares the code for highlighting by tokenizing it.
   *
   * @param code - The code to prepare.
   * @returns An array of themed tokens.
   */
  public prepare(code: string): ThemedToken[] {
    const result = this.handle?.value?.codeToTokens(
      code,
      this.codeToTokensOptions(),
    );
    return result?.tokens.flat() ?? [];
  }

  /**
   * Highlights the code at the given index.
   *
   * @param index - The character index to highlight.
   * @param cache - The prepared token cache from {@link prepare}.
   * @returns The highlight result containing the color and skip-ahead value.
   */
  public highlight(index: number, cache: ThemedToken[]): HighlightResult {
    const token = cache.find(
      token =>
        token.offset <= index && index < token.offset + token.content.length,
    );
    if (token) {
      return {
        color: token.color ?? null,
        skipAhead: token.offset + token.content.length - index,
      };
    } else {
      return {
        color: null,
        skipAhead: 0,
      };
    }
  }

  /**
   * Tokenizes the code into individual string tokens.
   *
   * @param code - The code to tokenize.
   * @returns An array of string tokens.
   */
  public tokenize(code: string): string[] {
    const lineTokens = this.handle?.value
      ?.codeToTokens(code, this.codeToTokensOptions())
      .tokens.map(line => line.map(({content}) => content));
    const tokens = lineTokens?.flatMap((line, i) =>
      i === lineTokens.length - 1 ? line : [...line, '\n'],
    );
    return tokens ?? [];
  }

  private codeToTokensOptions(): CodeToTokensOptions<
    BundledLanguage,
    BundledTheme
  > {
    return this.shikiOptions.codeToTokens !== undefined
      ? this.shikiOptions.codeToTokens
      : {
          lang: this.shikiOptions.highlighter.lang as BundledLanguage,
          theme: this.shikiOptions.highlighter.theme as BundledTheme,
        };
  }
}
