/** Caller provenance distinguishing decomposition's additive and removing writes. */
export type DecomposeBatchAction = "additive" | "terminal" | "discard" | "revise";

/** Name the cut mode that owns one atomic batch. */
export function decomposeProvenance(action: DecomposeBatchAction): { verb: "decompose"; lifecycleAction: DecomposeBatchAction } {
  return { verb: "decompose", lifecycleAction: action };
}
