/** A GitHub process fixture with immutable stale and current test-merge objects. */

import type { ChangeRequestMergeCoordinates } from "../../src/scripts/review-gate/change-request.js";
import { observeChangeRequestMergeAdmission } from "../../src/scripts/review-gate/change-request.js";
import { createGhChangeRequestMergeObservationPort } from "../../src/scripts/review-gate/hosts/github/merge-observation.js";

export function githubMergeLag(coordinates: ChangeRequestMergeCoordinates, becomesCurrent: boolean) {
  const staleMerge = "d".repeat(40);
  const currentMerge = "e".repeat(40);
  const staleBase = "f".repeat(40);
  let reads = 0;
  const output = (value: unknown) => ({ stdout: JSON.stringify(value), stderr: "" });
  const port = createGhChangeRequestMergeObservationPort({
    run: async (args) => {
      const endpoint = args.at(-1) ?? "";
      if (endpoint.endsWith(`/pulls/${coordinates.changeRequest}`)) {
        reads += 1;
        return output({
          number: coordinates.changeRequest, base: { ref: coordinates.baseRef }, head: { sha: coordinates.head },
          mergeable: true, merge_commit_sha: becomesCurrent && reads > 1 ? currentMerge : staleMerge,
        });
      }
      if (endpoint.endsWith(`/branches/${coordinates.baseRef}`)) return output({ protection: null });
      if (endpoint.includes(`/rules/branches/${coordinates.baseRef}`)) return output([[]]);
      if (endpoint.endsWith(`/commits/${staleMerge}`)) {
        return output({ parents: [{ sha: staleBase }, { sha: coordinates.head }] });
      }
      if (endpoint.endsWith(`/commits/${currentMerge}`)) {
        return output({ parents: [{ sha: coordinates.base }, { sha: coordinates.head }] });
      }
      throw new Error(`unexpected endpoint: ${endpoint}`);
    },
  }, { wait: async () => undefined });
  return {
    observe: () => observeChangeRequestMergeAdmission(coordinates, port, { baseContained: false }),
    reads: () => reads,
  };
}
