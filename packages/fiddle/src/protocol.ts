/**
 * A console method the harness forwards to its host.
 */
export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

/**
 * Where an error came from: the compiler worker, or the running scene.
 */
export type ErrorKind = 'compile' | 'runtime';

/**
 * The render size a fiddle gets when it declares none.
 */
export const DEFAULT_RENDER_SIZE = {width: 1920, height: 1080};

/**
 * Messages the host posts into the harness iframe.
 *
 * `configure` and `variables` carry no generation because they precede the
 * first `run` and apply to every scene the harness runs afterwards.
 *
 * @example
 * ```ts
 * const message: HostToHarnessMessage = {type: 'play', generation: 3};
 * port.postMessage(message);
 * ```
 */
export type HostToHarnessMessage =
  | {
      type: 'configure';
      width: number;
      height: number;
      resolutionScale: number;
      engineVersion: string;
    }
  | {type: 'variables'; variables: Record<string, unknown>}
  | {type: 'run'; generation: number; code: string}
  | {type: 'play'; generation: number}
  | {type: 'pause'; generation: number}
  | {type: 'seek'; generation: number; frame: number};

/**
 * Messages the harness posts back to its host.
 *
 * `ready` travels over `window.postMessage` during the handshake. Every other
 * message travels over the transferred `MessagePort`.
 *
 * @example
 * ```ts
 * port.onmessage = (event: MessageEvent\<HarnessToHostMessage\>) => {
 *   if (event.data.type === 'frame') render(event.data.frame);
 * };
 * ```
 */
export type HarnessToHostMessage =
  | {type: 'ready'}
  | {type: 'state'; generation: number; paused: boolean}
  | {type: 'frame'; generation: number; frame: number}
  | {type: 'duration'; generation: number; duration: number}
  | {
      type: 'error';
      generation: number;
      kind: ErrorKind;
      message: string;
      stack?: string;
    }
  | {
      type: 'console';
      generation: number;
      level: ConsoleLevel;
      args: string[];
    };

/**
 * Whether a message's generation has been overtaken by a newer one.
 *
 * @example
 * ```ts
 * isStaleGeneration(2, 5); // true
 * ```
 */
export function isStaleGeneration(
  candidateGeneration: number,
  latestKnownGeneration: number,
): boolean {
  return candidateGeneration < latestKnownGeneration;
}

/**
 * The highest generation seen so far on one side of the protocol.
 *
 * @example
 * ```ts
 * const generations = new GenerationTracker();
 * const generation = generations.next();
 * generations.observe(generation); // true
 * ```
 */
export class GenerationTracker {
  private latest = -1;

  /** The latest issued or observed generation, or -1 before either occurs. */
  public get current(): number {
    return this.latest;
  }

  /** Allocate the next generation, starting at zero. */
  public next(): number {
    this.latest += 1;
    return this.latest;
  }

  /** Accept a generation unless a newer one has already been seen. */
  public observe(generation: number): boolean {
    if (isStaleGeneration(generation, this.latest)) return false;
    this.latest = generation;
    return true;
  }
}

/**
 * What the harness applies scene variables to: the `Player` it is running.
 *
 * @example
 * ```ts
 * const target: VariableTarget = player;
 * ```
 */
export interface VariableTarget {
  setVariables(variables: Record<string, unknown>): void;
  requestRender(): void;
}

/**
 * The scene variables the host last sent.
 *
 * Variables can arrive before a player exists, and every later player starts
 * from the same values, so they live here and not on the current player.
 *
 * @example
 * ```ts
 * const variables = new VariableTracker();
 * variables.set({'--cc-green': '#40a02b'});
 * variables.applyTo(player);
 * ```
 */
export class VariableTracker {
  private latest: Record<string, unknown> | null = null;

  /** Store the variable values to apply to current and future players. */
  public set(variables: Record<string, unknown>): void {
    this.latest = variables;
  }

  /** Apply stored variables and request a render when both are available. */
  public applyTo(target: VariableTarget | null): void {
    if (!target || this.latest === null) return;
    target.setVariables(this.latest);
    target.requestRender();
  }
}
