/** Complete marker evidence for tests that do not consult committed retirement authority. */
import { canonicalDigest } from "../../src/lib/kernel/canonical/canonical-json.js";
import type { WorktreeHuskStamp } from "../../src/lib/git/worktree-marker.js";

export const fixtureHuskProof = {
  kind: "current", authorization: "discard-confirmed", remoteRef: null,
  evidence: { kind: "git-transition", transition: "abandon", resultDigest: canonicalDigest({ retirement: "fixture" }) },
} as const;

/** Complete the structural stamp; authority tests supply their own committed evidence. */
export function makeHuskStamp(stamp: Pick<WorktreeHuskStamp, "sha" | "at" | "subject" | "branch"> & Partial<WorktreeHuskStamp>): WorktreeHuskStamp {
  return { authorization: fixtureHuskProof.authorization, remoteRef: fixtureHuskProof.remoteRef,
    evidence: fixtureHuskProof.evidence, ...stamp };
}
