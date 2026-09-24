import {NodeConstructor, PropsOf} from '../components/types';
import {getKnownPropKeysOf} from '../decorators/signal';

/**
 * Pick only the props declared on the given class out of a larger props
 * object, so a merged props object can spread across multiple components.
 *
 * @remarks
 * Structural props (`ref`, `children`, `key`) are never picked; pass those
 * explicitly on the component that owns them.
 *
 * @example
 * ```tsx
 * interface CodeEditorProps extends RectProps, CodeProps {}
 *
 * function CodeEditor(props: CodeEditorProps) {
 *   return (
 *     <Rect {...pickProps(Rect, props)}>
 *       <Code {...pickProps(Code, props)} />
 *     </Rect>
 *   );
 * }
 * ```
 *
 * @param component - The class whose declared props should be picked.
 * @param props - The props object to pick from.
 */
export function pickProps<T extends NodeConstructor>(
  component: T,
  props: Partial<PropsOf<T>>,
): Partial<PropsOf<T>> {
  const known = getKnownPropKeysOf(component);
  const picked: Partial<PropsOf<T>> = {};
  for (const key of Object.keys(props) as (keyof PropsOf<T> & string)[]) {
    if (known.has(key)) {
      picked[key] = props[key];
    }
  }
  return picked;
}

/**
 * Pick only the named keys out of a props object.
 *
 * @example
 * ```tsx
 * const {fill, stroke} = partialProps(['fill', 'stroke'], props);
 * ```
 *
 * @param keys - The keys to pick.
 * @param props - The props object to pick from.
 */
export function partialProps<T extends object, TKey extends keyof T>(
  keys: readonly TKey[],
  props: T,
): Pick<T, TKey> {
  const picked = {} as Pick<T, TKey>;
  for (const key of keys) {
    if (key in props) {
      picked[key] = props[key];
    }
  }
  return picked;
}
