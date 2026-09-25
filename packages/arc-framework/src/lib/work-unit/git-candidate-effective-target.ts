/** Git composition for the shared effective Candidate target projection. */

import type { RawGitExec } from "../change-facts.js";
import { resolveSoleMergeBase } from "../git/base-overlap.js";
import type { GitExec } from "../git/exec.js";
import { isGitObjectId } from "../git/object-id.js";
import {
  CandidateApplicabilityResultSchema,
  candidateApplicabilityResultBase,
} from "./candidate-applicability.js";
import {
  projectCandidateCurrentness,
  reduceCandidateDurableBaseline,
  type CandidateManagedRecordV1,
} from "./candidate-attestation.js";
import {
  projectEffectiveCandidateTarget,
  type CandidateEffectiveTargetProjection,
} from "./candidate-effective-target.js";
import { projectGitCandidateApplicability } from "./git-candidate-applicability.js";
import {
  CandidateSubjectUncollectableError,
  collectGitCandidateSubject,
  resolveGitCandidateBaseRevision,
  type CandidateSubjectCollection,
} from "./git-candidate-subject.js";

/**
 * The collected subject, or this projection's own answer for one it could not collect: a raise.
 *
 * Every arm the projection can return names a current target by revision and subject digest, so a subject that
 * was never collected has no reading here — not even a non-applicable one, which would need the same digest to
 * say so. Filling that slot from the durable baseline would put a target in a typed result that nothing observed.
 *
 * Under the collection's own type, because a caller that reads this projection to decide a route has to tell
 * this cause from any other projection failure: the branch and the base leaving no single ancestor is cleared
 * by a merge, and every other failure here is cleared by reading again.
 */
function collectedSubject(collection: CandidateSubjectCollection) {
  if (collection.status !== "collected") {
    throw new CandidateSubjectUncollectableError(collection.reason, collection.detail);
  }
  return collection.target;
}

async function readCommit(input: {
  cwd: string;
  exec: GitExec;
  expression: string;
}): Promise<string> {
  const revision = (await input.exec("git", ["rev-parse", "--verify", input.expression], {
    cwd: input.cwd,
    objectAccess: "local-only",
  })).stdout.trim();
  if (!isGitObjectId(revision)) {
    throw new Error(`Cannot resolve exact Candidate coordinate \`${input.expression}\``);
  }
  return revision;
}

/** The sole base coordinate one exact Candidate target records, or the reason there is not exactly one. */
export type CandidateTargetBaseResolution =
  | { readonly status: "resolved"; readonly base: string }
  | { readonly status: "refused"; readonly reason: "merge-base-ambiguous"; readonly detail: string };

export interface GitCandidateTargetBaseInput {
  readonly cwd: string;
  readonly revision: string;
  readonly baseBranch: string;
  readonly baseRevision?: string;
  readonly exec: GitExec;
}

/**
 * Read the sole historical base coordinate for one exact Candidate target.
 *
 * A target recording more than one base records none of them, which is a condition an operator can clear by
 * merging the base in — so it is answered rather than raised, and answered apart from a target that has no
 * base at all. That second reading is what a raise says here, and it is not the same condition.
 *
 * @param input - The checkout, the exact target revision, its configured base, and the Git boundary.
 * @returns The sole base coordinate, or the refusal naming the history that leaves more than one.
 */
export async function readGitCandidateTargetBase(
  input: GitCandidateTargetBaseInput,
): Promise<CandidateTargetBaseResolution> {
  const baseRevision = input.baseRevision ?? await resolveGitCandidateBaseRevision(input);
  const options = { cwd: input.cwd, objectAccess: "local-only" as const };
  const sole = await resolveSoleMergeBase({
    exec: (command, args) => input.exec(command, args, options),
    leftRevision: input.revision,
    rightRevision: baseRevision,
  });
  if (sole.status === "ambiguous") {
    return {
      status: "refused",
      reason: "merge-base-ambiguous",
      detail: "The Candidate target has more than one base coordinate.",
    };
  }
  if (sole.status !== "resolved" || !isGitObjectId(sole.mergeBase)) {
    throw new Error("The Candidate target has no sole base coordinate.");
  }
  return { status: "resolved", base: sole.mergeBase };
}

export interface GitCandidateEffectiveTargetInput {
  readonly cwd: string;
  readonly name: string;
  readonly baseBranch: string;
  /** Exact current configured-base coordinate when an authoritative caller already observed it. */
  readonly baseRevision?: string;
  readonly record: CandidateManagedRecordV1;
  readonly exec: GitExec;
  readonly rawExec: RawGitExec;
  /** Optional immutable historical coordinates, used when validating an already-reviewed target. */
  readonly target?: {
    readonly revision: string;
    readonly currentBase: string;
  };
}

/** Collect exact committed Candidate/base coordinates and project their effective recognized target. */
export async function projectGitCandidateEffectiveTarget(
  input: GitCandidateEffectiveTargetInput,
): Promise<CandidateEffectiveTargetProjection> {
  const observeEndpoints = async () => {
    const candidateHead = await readCommit({
      cwd: input.cwd,
      exec: input.exec,
      expression: input.target === undefined ? "HEAD^{commit}" : `${input.target.revision}^{commit}`,
    });
    const baseHead = input.target !== undefined
      ? await readCommit({
          cwd: input.cwd,
          exec: input.exec,
          expression: `${input.target.currentBase}^{commit}`,
        })
      : input.baseRevision ?? await resolveGitCandidateBaseRevision(input);
    if (!isGitObjectId(baseHead)) throw new Error("Cannot resolve exact Candidate base coordinate");
    return { candidateHead, baseHead };
  };
  const observed = await observeEndpoints();
  const committed = collectedSubject(await collectGitCandidateSubject({
    cwd: input.cwd,
    name: input.name,
    baseBranch: input.baseBranch,
    baseRevision: observed.baseHead,
    exec: input.exec,
    revision: observed.candidateHead,
  }));
  if (input.target === undefined) {
    const staged = collectedSubject(await collectGitCandidateSubject({
      cwd: input.cwd,
      name: input.name,
      baseBranch: input.baseBranch,
      baseRevision: observed.baseHead,
      exec: input.exec,
    }));
    const stagedCurrentness = projectCandidateCurrentness({ record: input.record, current: staged });
    if (stagedCurrentness.status === "current") {
      const reobserved = {
        candidateHead: await readCommit({
          cwd: input.cwd,
          exec: input.exec,
          expression: "HEAD^{commit}",
        }),
        baseHead: await resolveGitCandidateBaseRevision(input),
      };
      const candidateMoved = staged.revision !== observed.candidateHead
        || reobserved.candidateHead !== observed.candidateHead;
      const baseMoved = reobserved.baseHead !== observed.baseHead;
      if (candidateMoved || baseMoved) {
        const baseline = reduceCandidateDurableBaseline(input.record);
        const request = {
          candidateId: baseline.candidateId,
          baselineTarget: baseline.target,
          currentTarget: staged,
          currentBase: observed.baseHead,
        };
        const movement = CandidateApplicabilityResultSchema.parse({
          ...candidateApplicabilityResultBase(request),
          state: "rerun-checkpoint",
          nextAction: "rerun-checkpoint",
          reason: candidateMoved && baseMoved
            ? "candidate-and-base-moved"
            : candidateMoved ? "candidate-moved" : "base-moved",
          observed: reobserved,
        });
        if (movement.state !== "rerun-checkpoint") {
          throw new Error("Candidate endpoint movement did not produce a checkpoint rerun.");
        }
        return movement;
      }
      return projectEffectiveCandidateTarget({
        record: input.record,
        current: staged,
        currentBase: observed.baseHead,
        projectApplicability: () => Promise.reject(
          new Error("A durable staged target must not request applicability."),
        ),
      });
    }
    if (staged.subject.subjectDigest !== committed.subject.subjectDigest) {
      return {
        schemaVersion: 1,
        mode: "candidate-effective-target",
        state: "staged-change",
        nextAction: "establish-new-root",
        candidateId: stagedCurrentness.candidateId,
        durableBaselineTarget: reduceCandidateDurableBaseline(input.record).target,
        currentTarget: staged,
      };
    }
  }
  return projectEffectiveCandidateTarget({
    record: input.record,
    current: committed,
    currentBase: observed.baseHead,
    projectApplicability: (request) => projectGitCandidateApplicability({
      request,
      exec: input.rawExec,
      observeEndpoints,
    }),
  });
}
