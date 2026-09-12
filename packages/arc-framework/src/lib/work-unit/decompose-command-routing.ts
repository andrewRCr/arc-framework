/** Lightweight command-mode routing shared by CLI registration and the decomposition handler. */

/** Decomposition modes that select one operation. */
export const DECOMPOSE_MODE_KEYS = [
  "preflight",
  "execute",
  "extract",
  "finish",
  "advanceBase",
] as const;

/** Mode keys plus non-mode operands that still require machine-readable diagnostics. */
export const DECOMPOSE_MACHINE_READABLE_KEYS = [
  ...DECOMPOSE_MODE_KEYS,
  "apply",
] as const;

/** Options relevant to decomposition output routing. */
export type DecomposeRoutingOptions = Partial<Record<
  typeof DECOMPOSE_MACHINE_READABLE_KEYS[number],
  string | boolean
>>;

/** Whether one command option is present under Commander boolean/string conventions. */
export function decomposeOptionSelected(
  options: DecomposeRoutingOptions,
  key: keyof DecomposeRoutingOptions,
): boolean {
  const value = options[key];
  return typeof value === "boolean" ? value : value !== undefined;
}

/** Whether a decomposition invocation must keep diagnostics on machine-readable streams. */
export function isDecomposeMachineReadableInvocation(options: DecomposeRoutingOptions): boolean {
  return DECOMPOSE_MACHINE_READABLE_KEYS.some((key) => decomposeOptionSelected(options, key));
}
