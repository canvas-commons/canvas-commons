import type {ThreadGenerator} from '@canvas-commons/core';

export interface EditTarget<TPlan, TTransitions, TOwner> {
  change(plan: TPlan): TOwner;
  animate(
    plan: TPlan,
    duration: number,
    transitions?: TTransitions,
  ): ThreadGenerator;
}

/** Resolve the `(input)`, `(input, duration, transitions?)` and template call forms of an edit method. */
export function editCall<TUnits, TChange, TInput, TTag, TTransitions, TOwner>(
  target: EditTarget<(units: TUnits) => TChange, TTransitions, TOwner>,
  plan: (units: TUnits, input: TInput) => TChange,
  template: (strings: TemplateStringsArray, tags: TTag[]) => TInput,
  first: TInput | number,
  second?: number | TTransitions,
  third?: TTransitions,
):
  | TOwner
  | ThreadGenerator
  | ((strings: TemplateStringsArray, ...tags: TTag[]) => ThreadGenerator) {
  if (typeof first === 'number') {
    const transitions = typeof second === 'number' ? undefined : second;
    return (strings, ...tags) =>
      target.animate(
        units => plan(units, template(strings, tags)),
        first,
        transitions,
      );
  }
  if (typeof second === 'number') {
    return target.animate(units => plan(units, first), second, third);
  }
  return target.change(units => plan(units, first));
}
