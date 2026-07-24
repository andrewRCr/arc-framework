/** The exact locus generation a caller selected, carried into the driver that mutates it. */

export interface SelectedLocusGeneration {
  readonly recordId: string;
  readonly leaseId: string;
}

/**
 * Compare a caller's already-validated selection against the occupancy a driver re-derived for itself.
 *
 * @param selected - The generation the caller selected, or `undefined` when the driver was invoked directly.
 * @param resolved - The driver's own occupancy coordinates, or `null` when it re-derived none.
 * @returns A refusal message when the two disagree, or `null` when the driver may proceed.
 */
export function selectedGenerationMismatch(
  selected: SelectedLocusGeneration | undefined,
  resolved: { readonly recordId: string | null; readonly leaseId: string | null } | null,
): string | null {
  if (selected === undefined) return null;
  if (resolved === null) {
    return `The selected generation ${selected.recordId} is no longer present; it was resolved elsewhere.`;
  }
  if (resolved.recordId !== selected.recordId || resolved.leaseId !== selected.leaseId) {
    return `The selected generation ${selected.recordId} changed before dispatch; re-select it before retrying.`;
  }
  return null;
}
