/** Git command boundary for extraction source finish. */

import type { V3ExtractionFinishResult } from "./decompose-v3-finish.js";

/** Inputs shared by finish preview and explicit application. */
export interface GitV3ExtractionFinishInput {
  cwd: string;
  baseBranch: string;
  origin: string;
  cutMapPath: string;
  apply: boolean;
}

/**
 * Refuse finish until the landed-destination proof is available.
 *
 * @param _input - Exact command inputs reserved for the proof adapter.
 * @returns A typed refusal without reading or mutating repository state.
 */
export function finishGitV3Extraction(
  input: GitV3ExtractionFinishInput,
): Promise<V3ExtractionFinishResult> {
  void input;
  return Promise.resolve({ status: "refused", reason: "destination-proof-unavailable" });
}
