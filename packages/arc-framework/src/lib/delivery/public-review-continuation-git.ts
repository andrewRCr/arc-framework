/** Git proof for preserving public delivery review across one terminal record advance. */

import type { GitExec } from "../git/exec.js";
import { isGitObjectId } from "../git/object-id.js";
import type { CandidateEffectiveCurrentProjection } from
  "../work-unit/candidate-effective-target.js";
import { readAncestry } from "../work-unit/git-decomposition-object-readers.js";
import type { DeliveryTerminalCoordinateAdvanceProof } from
  "./public-review-continuation.js";

/** Prove one strict-ancestor terminal advance already accepted by Candidate currentness. */
export async function projectGitDeliveryTerminalCoordinateAdvance(input: {
  readonly cwd: string;
  readonly exec: GitExec;
  readonly candidate: CandidateEffectiveCurrentProjection;
}): Promise<DeliveryTerminalCoordinateAdvanceProof | undefined> {
  const priorHead = input.candidate.durableBaselineTarget.revision;
  const currentHead = input.candidate.recognizedTarget.revision;
  if (priorHead === currentHead) return undefined;
  const localExec: GitExec = (command, args, options) => input.exec(command, args, {
    ...options,
    cwd: input.cwd,
    objectAccess: "local-only",
  });
  if (await readAncestry(localExec, priorHead, currentHead) !== "ancestor") return undefined;
  const [priorTree, currentTree] = await Promise.all([
    localExec("git", ["rev-parse", `${priorHead}^{tree}`]),
    localExec("git", ["rev-parse", `${currentHead}^{tree}`]),
  ]);
  const resolvedPriorTree = priorTree.stdout.trim();
  const resolvedCurrentTree = currentTree.stdout.trim();
  if (!isGitObjectId(resolvedPriorTree) || !isGitObjectId(resolvedCurrentTree)) return undefined;
  return {
    priorHead,
    priorTree: resolvedPriorTree,
    currentHead,
    currentTree: resolvedCurrentTree,
    proof: input.candidate.recognition.kind === "machine"
      ? input.candidate.recognition.proof
      : "subject-equality",
  };
}
