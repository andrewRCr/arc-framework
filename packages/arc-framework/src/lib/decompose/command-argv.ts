/** Structured command operands for store-backed decomposition continuations. */

/** Read and preview the origin's stored map, optionally applying approved writes. */
export function decomposeFinishArgv(origin: string, authority?: string): readonly string[] {
  return withApply(["arc", "decompose", origin, "--finish"], authority);
}

/** Generate a revision starter, or preview and apply a supplied completed revision. */
export function decomposeReviseArgv(origin: string, revision?: { cutMapPath: string; authority?: string }): readonly string[] {
  const argv = ["arc", "decompose", origin, "--revise"];
  return revision === undefined ? argv : withApply([...argv, revision.cutMapPath], revision.authority);
}

/** Preview a discard, optionally applying the exact approved writes. */
export function decomposeDiscardArgv(origin: string, authority?: string): readonly string[] {
  return withApply(["arc", "decompose", origin, "--discard"], authority);
}

function withApply(argv: readonly string[], authority: string | undefined): readonly string[] {
  return authority === undefined ? argv : [...argv, "--apply", authority];
}
