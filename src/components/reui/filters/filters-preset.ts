import type { FilterField, FilterOperator } from './filters-types';

/** The step a new chip still has to ask for, or null when nothing is left to choose. */
export type FilterPresetStep = 'operator' | 'value' | null;

/**
 * What a NEW rule starts with when its field leaves no choice (Tapll addition to the vendored
 * ReUI flow). A lone visible operator is taken, and under it a lone selectable option is taken
 * too. "None of the above" rows (`exclusive`) and disabled rows are not choices, and a field that
 * loads its options lazily never presets a value, since its first page is not the whole list.
 * Pure and import-free so it runs under `node --test`.
 */
export function presetFilterRule<V, O>(
  field: FilterField<V, O> | undefined,
  resolveOperators: (field: FilterField<V, O>) => readonly FilterOperator[],
): { operator: string; value: unknown; next: FilterPresetStep } {
  const none = { operator: '', value: undefined, next: 'operator' as const };
  if (!field) return none;
  const operators = resolveOperators(field).filter((operator) => !operator.hidden);
  const operator = operators.length === 1 ? operators[0] : undefined;
  if (!operator) return none;
  const arity = operator.arity ?? 'one';
  if (arity === 'none') return { operator: operator.value, value: undefined, next: null };
  const choices = field.loadOptions
    ? []
    : (field.options ?? []).filter((option) => !option.disabled && !option.exclusive);
  const only = choices.length === 1 ? choices[0] : undefined;
  if (!only) return { operator: operator.value, value: undefined, next: 'value' };
  return { operator: operator.value, value: arity === 'many' ? [only.value] : only.value, next: null };
}
