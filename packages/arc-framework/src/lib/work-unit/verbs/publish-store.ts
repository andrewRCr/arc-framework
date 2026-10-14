/** Candidate-authorized publication over one prepared reconcile followed by one lifecycle batch. */
import type { StoreRefusal, Remedy } from "../../store/refusal.js";
import type { Store } from "../../store/contract.js";
import { ParsedMetaRecordSchema } from "../../active/meta-schema.js";
import { readWorkUnit, workUnitMetaPath } from "../../store/lifecycle-write.js";
import { checkAdvancingPause } from "../../store/lifecycle-pause.js";
import { executeTransition, type ExecuteTransitionContext } from "../lifecycle-executor.js";
import { linkedWorkBranch } from "../linked-work-branch.js";
import type { CurrentWuReconcileHost } from "../side-effects/discharge-dep-edges.js";
import { authorizeActivePublication, type PublishParams, type PublishResult } from "./publish.js";
import { projectPublicationBoundary } from "../../../scripts/review-gate/policy/integration-boundary-locus.js";
import { spineRemedy } from "../../../scripts/integration/spine-refusal.js";

type PublicationReject = (reason: string, refusal?: StoreRefusal, remedy?: Remedy) => Extract<PublishResult, { status: "rejected" }>;

/** Preserve Candidate authorization and reconcile ordering without deriving retired task fields. */
export async function runStorePublish(ctx: ExecuteTransitionContext & CurrentWuReconcileHost & { store: Store }, params: PublishParams): Promise<PublishResult> {
  const reject: PublicationReject = (reason, refusal, remedy = refusal?.remedy) => ({ status: "rejected", reason,
    ...(refusal === undefined ? {} : { refusal }),
    remedy: spineRemedy(reason, remedy?.text ?? "Repair the reported publication condition, then retry", remedy?.argv ?? ["arc", "publish", params.name]) });
  const facts = await inspectPublication(ctx, params, reject);
  if (facts.status !== "ready") return facts;
  const { branch, metaPath } = facts;
  const authorized = authorizeActivePublication({ ...params, standardLaneOwnerVersion: await params.readStandardLaneOwnerVersion() });
  if (authorized.status === "refused") return reject(authorized.reason);
  const prepared = await ctx.currentWuReconcile.prepare({ slug: params.name, metaPath });
  if (prepared.status === "conflict") return reject(`Current-work-unit reconcile refused: ${prepared.reason}`);
  const applied = await ctx.currentWuReconcile.apply(prepared.prepared);
  if (applied.status === "conflict") return { status: "reconcile-failed", metaPath, reconcile: applied,
    reason: applied.refusal?.condition ?? "The prepared reconcile became stale.",
    remedy: spineRemedy("Prepared input changed", "Prepare the work unit again", ["arc", "wu", "reconcile", params.name, "--apply"]) };
  if (applied.status !== "clean" && applied.prepared.plan.advisories.length > 0 && params.allowAdvisories !== true) {
    return { status: "reconcile-pending", metaPath, reconcile: applied, reason: "Reconcile advisories require review.",
      remedy: spineRemedy("Reconcile advisories remain", "Inspect the reconcile", ["arc", "wu", "reconcile", params.name]) };
  }
  const refreshed = await params.refreshCandidateAuthorization();
  if (refreshed.candidateId !== params.candidateId || !refreshed.candidateCurrent) return reject("Reconcile invalidated the Candidate; re-attest it.");
  const authorization = authorizeActivePublication({ ...refreshed, boundary: params.boundary,
    standardLaneOwnerVersion: await params.readStandardLaneOwnerVersion() });
  if (authorization.status === "refused") return reject(authorization.reason);
  const boundary = projectPublicationBoundary({ workUnit: params.name, branch, candidateId: refreshed.candidateId,
    candidateSubjectDigest: refreshed.candidateSubjectDigest, reservation: authorization.reservation, terminus: authorization.terminus,
    ...("standardLaneOwnerVersion" in params.boundary ? { standardLaneOwnerVersion: params.boundary.standardLaneOwnerVersion } : {}), changeRequest: null });
  try { await params.claimPublicationBoundary(boundary); }
  catch (error) { return reject(`The publication claim failed: ${String(error)}`); }
  const outcome = await executeTransition(ctx, { verb: "publish", slug: params.name,
    inputs: { softFields: { nextAction: params.nextAction ?? boundary.nextAction.interactionText } } });
  return outcome.status === "ok" ? { status: "published", outcome, metaPath, reconcile: applied, boundary } : outcome.status === "rejected" ? reject(outcome.message, outcome.refusal, outcome.remedy) : reject(outcome.message);
}

async function inspectPublication(ctx: ExecuteTransitionContext & { store: Store }, params: PublishParams,
  reject: PublicationReject): Promise<
  { status: "ready"; branch: string; metaPath: string } | Extract<PublishResult, { status: "rejected" | "unchanged" }>> {
  const read = await readWorkUnit(ctx.store, params.name);
  if (read.status === "refused") return reject(read.refusal.condition, read.refusal);
  const meta = ParsedMetaRecordSchema.parse(read.result.fields), metaPath = workUnitMetaPath(read.result);
  if (meta.state !== "Active" && meta.state !== "Integrating") return reject("Publication requires an Active work unit.");
  const pause = await checkAdvancingPause(ctx.store, params.name);
  if (pause.status === "rejected") return reject(pause.reason, pause.refusal, pause.remedy);
  const branch = await linkedWorkBranch(ctx, read.result);
  if (branch === null) return reject("The work unit has no unambiguous branch link; activate its work branch first.");
  if (!params.candidateCurrent || meta.candidateId !== params.candidateId) return reject("The current Candidate identity is absent or stale; re-attest it.");
  if (meta.state === "Integrating" && meta.currentWorkflow === "integrate-work-unit") {
    return params.boundary.candidateId === params.candidateId
      && params.boundary.candidateSubjectDigest === params.candidateSubjectDigest
      ? { status: "unchanged", boundary: params.boundary } : reject("Publication boundary belongs to a different Candidate.");
  }
  return { status: "ready", branch, metaPath };
}
