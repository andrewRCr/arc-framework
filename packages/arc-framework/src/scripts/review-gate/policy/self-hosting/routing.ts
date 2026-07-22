/** Self-hosting composition from canonical Git facts into topology-neutral routing. */

import {
  affectedPaths,
  isCodeSurfacePath,
} from "../../../../lib/change-facts.js";
import {
  ChangePathSetSchema,
  ChangeSetSchema,
  type CanonicalChange,
  type ChangePathFact,
} from "../../../../lib/change-facts.schema.js";
import type { GitExec } from "../../../../lib/git/exec.js";

import type {
  ReviewAssuranceInput,
  ReviewMethodActivity,
} from "../assurance-schema.js";
import {
  resolveReviewRouting,
  type ProjectRoutingPolicy,
  type ReviewRoutingResolution,
} from "../routing.js";
import type { ChangeDeterminacy } from "../routing-schema.js";
import { resolveSurfaceAuthority } from "./authority.js";
import { resolveOwnership } from "./lane.js";
import { classifyReviewRiskFromChangeSet } from "./risk.js";

/** Exact-ref and WU inputs needed to compose self-hosting routing facts. */
export interface SelfHostingReviewRoutingInput {
  changeSet: unknown;
  exec: GitExec;
  diffBaseSha: string;
  headSha: string;
  authorLogin: string;
  authorMap: Record<string, string>;
  changeDeterminacy: ChangeDeterminacy;
  assurance: ReviewAssuranceInput;
  activity: ReviewMethodActivity;
}

function pathFact(change: CanonicalChange): ChangePathFact {
  return change.status === "renamed" || change.status === "copied"
    ? { status: change.status, path: change.path, previousPath: change.previousPath }
    : { status: change.status, path: change.path };
}

function unknownRouting(
  input: SelfHostingReviewRoutingInput,
  projectPolicy?: ProjectRoutingPolicy,
): ReviewRoutingResolution {
  return resolveReviewRouting({
    schemaVersion: 1,
    changeSetState: "unknown",
    contentKind: "code-bearing",
    reviewRisk: "sensitive",
    changeDeterminacy: input.changeDeterminacy,
    ownership: "unknown",
    surfaceAuthority: "unknown",
    assurance: input.assurance,
    activity: input.activity,
  }, projectPolicy);
}

/**
 * Validate canonical six-status facts and compose every self-hosting routing projection.
 *
 * @param input - Canonical diff candidate plus exact-ref and WU facts
 * @param projectPolicy - Optional promote-only project policy
 * @returns One normalized routing resolution; invalid canonical facts fail closed
 */
export async function resolveSelfHostingReviewRouting(
  input: SelfHostingReviewRoutingInput,
  projectPolicy?: ProjectRoutingPolicy,
): Promise<ReviewRoutingResolution> {
  const parsed = ChangeSetSchema.safeParse(input.changeSet);
  if (!parsed.success || parsed.data.changeSet === "unknown") return unknownRouting(input, projectPolicy);

  const pathSet = ChangePathSetSchema.parse({
    changeSet: "known",
    changes: parsed.data.changes.map(pathFact),
  });
  const paths = affectedPaths(pathSet.changes);
  const risk = classifyReviewRiskFromChangeSet(pathSet);
  const authority = resolveSurfaceAuthority(pathSet);
  let ownership: Awaited<ReturnType<typeof resolveOwnership>>;
  try {
    ownership = await resolveOwnership({
      exec: input.exec,
      diffBaseSha: input.diffBaseSha,
      headSha: input.headSha,
      authorLogin: input.authorLogin,
      authorMap: input.authorMap,
      changes: pathSet.changes,
    });
  } catch {
    ownership = { relation: "unknown" };
  }

  return resolveReviewRouting({
    schemaVersion: 1,
    changeSetState: "known",
    contentKind: paths.some(isCodeSurfacePath) ? "code-bearing" : "documentation",
    reviewRisk: risk.risk,
    changeDeterminacy: input.changeDeterminacy,
    ownership: ownership.relation,
    surfaceAuthority: authority.authority,
    assurance: input.assurance,
    activity: input.activity,
  }, projectPolicy);
}
