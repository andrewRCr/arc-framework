/** Git composition for the shared effective Candidate target projection. */

import type { RawGitExec } from "../change-facts.js";
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
  collectGitCandidateTarget,
  resolveGitCandidateBaseRevision,
} from "./git-candidate-subject.js";

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

/** Resolve the sole historical base coordinate for one exact Candidate target. */
export async function resolveGitCandidateTargetBase(input: {
  readonly cwd: string;
  readonly revision: string;
  readonly baseBranch: string;
  readonly baseRevision?: string;
  readonly exec: GitExec;
}): Promise<string> {
  const baseRevision = input.baseRevision ?? await resolveGitCandidateBaseRevision(input);
  const output = (await input.exec("git", ["merge-base", "--all", input.revision, baseRevision], {
    cwd: input.cwd,
    objectAccess: "local-only",
  })).stdout.trim();
  const revisions = output === "" ? [] : output.split(/\r?\n/u);
  if (revisions.length !== 1 || revisions[0] === undefined || !isGitObjectId(revisions[0])) {
    throw new Error("The Candidate target has no sole base coordinate.");
  }
  return revisions[0];
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
  const committed = await collectGitCandidateTarget({
    cwd: input.cwd,
    name: input.name,
    baseBranch: input.baseBranch,
    baseRevision: observed.baseHead,
    exec: input.exec,
    revision: observed.candidateHead,
  });
  if (input.target === undefined) {
    const staged = await collectGitCandidateTarget({
      cwd: input.cwd,
      name: input.name,
      baseBranch: input.baseBranch,
      baseRevision: observed.baseHead,
      exec: input.exec,
    });
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
