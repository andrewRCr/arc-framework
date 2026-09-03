/** Git proof for preserving public delivery review across one terminal record advance. */

import type { GitExec } from "../git/exec.js";
import { isGitObjectId } from "../git/object-id.js";
import type { CandidateEffectiveCurrentProjection } from
  "../work-unit/candidate-effective-target.js";
import { readAncestry, readCommit } from "../work-unit/git-decomposition-object-readers.js";
import {
  collectGitCandidateTarget,
  resolveGitCandidateBaseRevision,
} from "../work-unit/git-candidate-subject.js";
import type { DeliveryTerminalCoordinateAdvanceProof } from
  "./public-review-continuation.js";
import type { DeliveryMemberCoordinatesV1 } from "./schema.js";

/** Classify strict-ancestor terminal movement with an unchanged Candidate subject. */
export function deliveryTerminalRecordAdvanceIsRepresented(input: {
  readonly ancestry: "ancestor" | "not-ancestor" | "unresolvable";
  readonly priorSubjectDigest: string;
  readonly currentSubjectDigest: string;
}): boolean {
  return input.ancestry === "ancestor"
    && input.priorSubjectDigest === input.currentSubjectDigest;
}

/** Prove one terminal movement contains only Candidate-represented operational records. */
export async function projectGitDeliveryTerminalRecordAdvance(input: {
  readonly cwd: string;
  readonly exec: GitExec;
  readonly workUnitId: string;
  readonly baseBranch: string;
  readonly priorHead: string;
  readonly currentHead: string;
}): Promise<DeliveryTerminalCoordinateAdvanceProof | undefined> {
  if (input.priorHead === input.currentHead) return undefined;
  const localExec: GitExec = (command, args, options) => input.exec(command, args, {
    ...options,
    cwd: input.cwd,
    objectAccess: "local-only",
  });
  const ancestry = await readAncestry(localExec, input.priorHead, input.currentHead);
  if (ancestry !== "ancestor") return undefined;
  const baseRevision = await resolveGitCandidateBaseRevision({
    cwd: input.cwd,
    baseBranch: input.baseBranch,
    exec: localExec,
  });
  const [priorTarget, currentTarget, priorTree, currentTree] = await Promise.all([
    collectGitCandidateTarget({
      cwd: input.cwd,
      name: input.workUnitId,
      baseBranch: input.baseBranch,
      baseRevision,
      revision: input.priorHead,
      exec: localExec,
    }),
    collectGitCandidateTarget({
      cwd: input.cwd,
      name: input.workUnitId,
      baseBranch: input.baseBranch,
      baseRevision,
      revision: input.currentHead,
      exec: localExec,
    }),
    localExec("git", ["rev-parse", `${input.priorHead}^{tree}`]),
    localExec("git", ["rev-parse", `${input.currentHead}^{tree}`]),
  ]);
  if (!deliveryTerminalRecordAdvanceIsRepresented({
    ancestry,
    priorSubjectDigest: priorTarget.subject.subjectDigest,
    currentSubjectDigest: currentTarget.subject.subjectDigest,
  })) return undefined;
  const resolvedPriorTree = priorTree.stdout.trim();
  const resolvedCurrentTree = currentTree.stdout.trim();
  if (!isGitObjectId(resolvedPriorTree) || !isGitObjectId(resolvedCurrentTree)) return undefined;
  return {
    priorHead: input.priorHead,
    priorTree: resolvedPriorTree,
    currentHead: input.currentHead,
    currentTree: resolvedCurrentTree,
    proof: "subject-equality",
  };
}

/** Prove one strict-ancestor terminal advance already accepted by Candidate currentness. */
export async function projectGitDeliveryTerminalCoordinateAdvance(input: {
  readonly cwd: string;
  readonly exec: GitExec;
  readonly candidate: CandidateEffectiveCurrentProjection;
  readonly workUnitId: string;
  readonly baseBranch: string;
  /** Exact terminal coordinates currently bound in Delivery State, when already observed by the caller. */
  readonly terminalCoordinates?: DeliveryMemberCoordinatesV1;
}): Promise<DeliveryTerminalCoordinateAdvanceProof | undefined> {
  const priorHead = input.candidate.durableBaselineTarget.revision;
  const recognizedHead = input.candidate.recognizedTarget.revision;
  const currentHead = input.terminalCoordinates?.head ?? recognizedHead;
  if (priorHead === currentHead) return undefined;
  const localExec: GitExec = (command, args, options) => input.exec(command, args, {
    ...options,
    cwd: input.cwd,
    objectAccess: "local-only",
  });
  if (currentHead !== recognizedHead) {
    if (await readAncestry(localExec, currentHead, recognizedHead) !== "ancestor") return undefined;
    const stateAdvance = await projectGitDeliveryTerminalRecordAdvance({
      cwd: input.cwd,
      exec: input.exec,
      workUnitId: input.workUnitId,
      baseBranch: input.baseBranch,
      priorHead,
      currentHead,
    });
    if (stateAdvance === undefined
      || input.terminalCoordinates?.tree !== stateAdvance.currentTree) return undefined;
    return stateAdvance;
  }
  if (await readAncestry(localExec, priorHead, currentHead) !== "ancestor") return undefined;
  const [priorTree, currentTree, currentCommit] = await Promise.all([
    localExec("git", ["rev-parse", `${priorHead}^{tree}`]),
    localExec("git", ["rev-parse", `${currentHead}^{tree}`]),
    readCommit(localExec, currentHead),
  ]);
  const resolvedPriorTree = priorTree.stdout.trim();
  const resolvedCurrentTree = currentTree.stdout.trim();
  if (!isGitObjectId(resolvedPriorTree) || !isGitObjectId(resolvedCurrentTree)) return undefined;
  const immediateParent = currentCommit?.parents.length === 1
    ? currentCommit.parents[0]
    : undefined;
  const immediateAdvance = immediateParent === undefined || immediateParent === priorHead
    ? undefined
    : await projectGitDeliveryTerminalRecordAdvance({
        cwd: input.cwd,
        exec: input.exec,
        workUnitId: input.workUnitId,
        baseBranch: input.baseBranch,
        priorHead: immediateParent,
        currentHead,
      });
  return {
    priorHead,
    priorTree: resolvedPriorTree,
    ...(immediateAdvance === undefined ? {} : {
      alternatePriorCoordinates: [{
        head: immediateAdvance.priorHead,
        tree: immediateAdvance.priorTree,
      }],
    }),
    currentHead,
    currentTree: resolvedCurrentTree,
    proof: input.candidate.recognition.kind === "machine"
      ? input.candidate.recognition.proof
      : "subject-equality",
  };
}
