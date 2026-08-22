/** Git composition for the shared effective Candidate target projection. */

import type { RawGitExec } from "../change-facts.js";
import type { GitExec } from "../git/exec.js";
import { isGitObjectId } from "../git/object-id.js";
import type { CandidateManagedRecordV1 } from "./candidate-attestation.js";
import {
  projectEffectiveCandidateTarget,
  type CandidateEffectiveTargetProjection,
} from "./candidate-effective-target.js";
import { projectGitCandidateApplicability } from "./git-candidate-applicability.js";
import { collectGitCandidateTarget } from "./git-candidate-subject.js";

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

export interface GitCandidateEffectiveTargetInput {
  readonly cwd: string;
  readonly name: string;
  readonly baseBranch: string;
  readonly record: CandidateManagedRecordV1;
  readonly exec: GitExec;
  readonly rawExec: RawGitExec;
}

/** Collect exact committed Candidate/base coordinates and project their effective recognized target. */
export async function projectGitCandidateEffectiveTarget(
  input: GitCandidateEffectiveTargetInput,
): Promise<CandidateEffectiveTargetProjection> {
  const observeEndpoints = async () => {
    const [candidateHead, baseHead] = await Promise.all([
      readCommit({ cwd: input.cwd, exec: input.exec, expression: "HEAD^{commit}" }),
      readCommit({ cwd: input.cwd, exec: input.exec, expression: `${input.baseBranch}^{commit}` }),
    ]);
    return { candidateHead, baseHead };
  };
  const observed = await observeEndpoints();
  const current = await collectGitCandidateTarget({
    cwd: input.cwd,
    name: input.name,
    baseBranch: input.baseBranch,
    exec: input.exec,
    revision: observed.candidateHead,
  });
  return projectEffectiveCandidateTarget({
    record: input.record,
    current,
    currentBase: observed.baseHead,
    projectApplicability: (request) => projectGitCandidateApplicability({
      request,
      exec: input.rawExec,
      observeEndpoints,
    }),
  });
}
