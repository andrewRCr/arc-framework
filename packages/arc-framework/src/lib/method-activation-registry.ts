/** Typed authority for methods whose activity can be configured in method frontmatter. */

/** One activatable method and its package default. */
export interface ActivatableMethodDefinition {
  readonly defaultActive: boolean;
}

/** Closed activatable-method registry; method names and defaults derive from this value. */
export const ACTIVATABLE_METHOD_REGISTRY = Object.freeze({
  "self-review": Object.freeze({ defaultActive: true }),
  "frontline-review": Object.freeze({ defaultActive: false }),
} as const satisfies Record<string, ActivatableMethodDefinition>);

/** Registered activatable method name. */
export type ActivatableMethodName = keyof typeof ACTIVATABLE_METHOD_REGISTRY;

/** Narrow a method name to the closed activation registry. */
export function isActivatableMethodName(value: string): value is ActivatableMethodName {
  return Object.hasOwn(ACTIVATABLE_METHOD_REGISTRY, value);
}

/** Read the package default for one registered activatable method. */
export function defaultMethodActivation(name: ActivatableMethodName): boolean {
  return ACTIVATABLE_METHOD_REGISTRY[name].defaultActive;
}
