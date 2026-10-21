export interface EditTarget<TPlan, TTransitions, TOwner, TEdit> {
  change(plan: TPlan): TOwner;
  animate(plan: TPlan, duration: number, transitions?: TTransitions): TEdit;
}

/** Resolve the `(input)`, `(input, duration, transitions?)` and template call forms of an edit method. */
export function editCall<
  TUnits,
  TChange,
  TInput,
  TTag,
  TTransitions,
  TOwner,
  TEdit,
>(
  target: EditTarget<(units: TUnits) => TChange, TTransitions, TOwner, TEdit>,
  plan: (units: TUnits, input: TInput) => TChange,
  template: (strings: TemplateStringsArray, tags: TTag[]) => TInput,
  first: TInput | number,
  second?: number | TTransitions,
  third?: TTransitions,
):
  TOwner | TEdit | ((strings: TemplateStringsArray, ...tags: TTag[]) => TEdit) {
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
