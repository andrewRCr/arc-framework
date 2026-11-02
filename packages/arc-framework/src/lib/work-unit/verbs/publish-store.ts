/** Candidate-authorized publication over one prepared reconcile followed by one lifecycle batch. */
import type { StoreRefusal, StoreResult, Remedy } from "../../store/refusal.js";
import type { Mutation, RecordObservation } from "../../store/write.js";
import type { Store } from "../../store/contract.js";
import type { StoreRecord } from "../../store/read.js";
import { readWorkUnit, readLifecycleMetaFields, workUnitMetaPath } from "../../store/lifecycle-write.js";
import { checkAdvancingPause } from "../../store/lifecycle-pause.js";
import { executeTransition, type ExecuteTransitionContext } from "../lifecycle-executor.js";
import { linkedWorkBranch } from "../linked-work-branch.js";
import type { CurrentWuReconcileHost } from "../side-effects/discharge-dep-edges.js";
import { authorizeActivePublication, type PublishParams, type PublishResult, type SubmissionAuthorization } from "./publish.js";
import { IntegrationBoundaryLocusV2Schema, projectPublicationBoundary } from "../../../scripts/review-gate/policy/integration-boundary-locus.js";
import type { IntegrationBoundaryLocusV2 } from "../../../scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { spineRemedy } from "../../../scripts/integration/spine-refusal.js";
import { recordReferences, type RecordReference } from "../../store/identity.js";
import { CandidateManagedRecordV1Schema } from "../../store/kinds/review/candidate/schema.js";
import { describeRecordConflicts } from "../../store/conflict-diagnostics.js";
import { isOffBranchStoreRefusal } from "../../store/refusal-error.js";
import { ProjectIdentityError } from "../../store/project-identity.js";
import { ReviewOwnerSelectionError } from "../../store/kinds/review/errors.js";
import { isNativeTypedRefusal } from "../../store/native-refusal.js";
import { PublicationClaimRefusal } from "../../store/kinds/review/integration-boundary/publication.js";

type PublicationReject = (reason: string, refusal?: StoreRefusal, remedy?: Remedy) => Extract<PublishResult, { status: "rejected" }>;

/** Preserve Candidate authorization and reconcile ordering without deriving retired task fields. */
export async function runStorePublish(ctx: ExecuteTransitionContext & CurrentWuReconcileHost & { store: Store }, params: PublishParams): Promise<PublishResult> {
  const reject: PublicationReject = (reason, refusal, remedy = refusal?.remedy) => ({ status: "rejected", reason,
    ...(refusal === undefined ? {} : { refusal }),
    remedy: spineRemedy(reason, remedy?.text ?? "Repair the reported publication condition, then retry", remedy?.argv ?? ["arc", "publish", params.name]) });
  const readinessRemedy = prePublicationRemedy(params.name);
  const facts = await inspectPublication(ctx, params, reject);
  if (facts.status !== "ready") return facts;
  const { metaPath } = facts;
  const parsedBoundary = IntegrationBoundaryLocusV2Schema.safeParse(params.boundary);
  if (!parsedBoundary.success) return reject("Native publication requires a version-two readiness boundary. Run pre-publication review again.",
    undefined, readinessRemedy);
  const boundaryBasis = parsedBoundary.data;
  let authorized: SubmissionAuthorization;
  try { authorized = await authorizeStoredPublication(params, boundaryBasis); }
  catch (error) { return rejectStoreFailure(error, reject); }
  if (authorized.status === "refused") return reject(authorized.reason, undefined, readinessRemedy);
  const reconciled = await reconcilePublication(ctx, params, metaPath, facts.primary.reference, reject);
  if (reconciled.status !== "ready") return reconciled;
  const applied = reconciled.reconcile;
  const refreshed = await params.refreshCandidateAuthorization();
  if (refreshed.candidateId !== params.candidateId || !refreshed.candidateCurrent) return reject("Reconcile invalidated the Candidate; re-attest it.");
  const current = await inspectPublication(ctx, { ...params, ...refreshed, reference: facts.primary.reference }, reject);
  if (current.status !== "ready") return current;
  const { branch, primary } = current;
  let authorization: SubmissionAuthorization;
  try { authorization = await authorizeStoredPublication(params, boundaryBasis, refreshed); }
  catch (error) { return rejectStoreFailure(error, reject); }
  if (authorization.status === "refused") return reject(authorization.reason, undefined, readinessRemedy);
  const boundary = projectPublicationBoundary({ workUnit: params.name, branch, candidateId: refreshed.candidateId,
    candidateSubjectDigest: refreshed.candidateSubjectDigest, reservation: authorization.reservation, terminus: authorization.terminus,
    ...("readinessBinding" in boundaryBasis ? { readinessBinding: boundaryBasis.readinessBinding } : {}), changeRequest: null }, 2);
  if (params.preparePublicationClaim === undefined) return reject("Native publication claim preparation is unavailable. Re-enter publication through the lifecycle command.");
  let claim: Mutation;
  try { claim = await params.preparePublicationClaim(boundary); }
  catch (error) { return rejectPublicationClaim(error, reject); }
  const outcome = await executeTransition(ctx, { verb: "publish", slug: params.name,
    inputs: { storeTransition: { primary, additionalWrites: [claim], observations: [current.candidateObservation] }, softFields: { nextAction: params.nextAction ?? boundary.nextAction.interactionText } } });
  return outcome.status === "ok" ? { status: "published", outcome, metaPath, reconcile: applied, boundary } : outcome.status === "rejected" ? reject(outcome.message, outcome.refusal, outcome.remedy) : reject(outcome.message);
}

/** Send a publication whose readiness no longer holds back to pre-publication review. */
function prePublicationRemedy(name: string): Remedy {
  return { text: "Resolve pre-publication review, then retry publication.", argv: ["arc", "review", "pre-publication", name] };
}

/** Reject an off-branch store's refusal whole, and a project-identity or owner failure with its remedy; rethrow others. */
function rejectStoreFailure(error: unknown, reject: PublicationReject): Extract<PublishResult, { status: "rejected" }> {
  if (isOffBranchStoreRefusal(error)) return reject(error.refusal.condition, error.refusal);
  if (error instanceof ProjectIdentityError) return reject(error.failure.reason, undefined, error.failure.remedy);
  if (error instanceof ReviewOwnerSelectionError) return reject(error.condition, undefined, error.remedy);
  throw error;
}

/** Reject a refused claim with its own remedy, a native typed refusal whole, or any other failure as it is. */
function rejectPublicationClaim(error: unknown, reject: PublicationReject): Extract<PublishResult, { status: "rejected" }> {
  if (error instanceof PublicationClaimRefusal) return reject(error.condition, undefined, error.remedy);
  if (isNativeTypedRefusal(error)) return rejectStoreFailure(error, reject);
  return reject(`The publication claim failed: ${String(error)}`);
}

type ReconciledPublication = { status: "ready"; reconcile: Extract<PublishResult, { status: "published" }>["reconcile"] }
  | Extract<PublishResult, { status: "rejected" | "reconcile-failed" | "reconcile-pending" }>;

async function reconcilePublication(ctx: CurrentWuReconcileHost, params: PublishParams, metaPath: string,
  reference: RecordReference, reject: PublicationReject): Promise<ReconciledPublication> {
  const prepared = await ctx.currentWuReconcile.prepare({ slug: params.name, metaPath, reference });
  if (prepared.status === "conflict") return reject(`Current-work-unit reconcile refused: ${prepared.reason}`);
  const applied = await ctx.currentWuReconcile.apply(prepared.prepared);
  if (applied.status === "conflict") {
    const reason = applied.refusal?.condition ?? applied.reason;
    const remedy = applied.remedy ?? applied.refusal?.remedy;
    return { status: "reconcile-failed", metaPath, reconcile: applied, reason,
      remedy: spineRemedy(reason, remedy?.text ?? "Prepare the work unit again",
        remedy?.argv ?? ["arc", "wu", "reconcile", params.name, "--apply"]) };
  }
  if (applied.status !== "clean" && applied.prepared.plan.advisories.length > 0 && params.allowAdvisories !== true) {
    return { status: "reconcile-pending", metaPath, reconcile: applied, reason: "Reconcile advisories require review.",
      remedy: spineRemedy("Reconcile advisories remain", "Inspect the reconcile", ["arc", "wu", "reconcile", params.name]) };
  }
  return { status: "ready", reconcile: applied };
}

async function authorizeStoredPublication(params: PublishParams, boundary: IntegrationBoundaryLocusV2,
  candidate: Pick<PublishParams, "candidateId" | "candidateSubjectDigest"> = params): Promise<SubmissionAuthorization> {
  const currentReadinessBinding = boundary.locus === "candidate-publish-ready" || boundary.locus === "publication-pending"
    ? await params.readReadinessBinding?.() : undefined;
  return authorizeActivePublication({ ...candidate, boundary, currentReadinessBinding });
}

async function inspectPublication(ctx: ExecuteTransitionContext & { store: Store }, params: PublishParams,
  reject: PublicationReject): Promise<
  { status: "ready"; branch: string; metaPath: string; primary: StoreRecord; candidateObservation: RecordObservation }
  | Extract<PublishResult, { status: "rejected" | "unchanged" }>> {
  const read = params.reference === undefined ? await readWorkUnit(ctx.store, params.name)
    : await ctx.store.read({ reference: params.reference });
  if (read.status === "refused") return reject(read.refusal.condition, read.refusal);
  const parsed = readLifecycleMetaFields(read.result);
  if (parsed.status === "refused") return reject(parsed.refusal.condition, parsed.refusal);
  const meta = parsed.result, metaPath = workUnitMetaPath(read.result);
  if (meta.state !== "Active" && meta.state !== "Integrating") return reject("Publication requires an Active work unit.");
  const pause = await checkAdvancingPause(ctx.store, params.name, read.result);
  if (pause.status === "rejected") return reject(pause.reason, pause.refusal, pause.remedy);
  const branch = await linkedWorkBranch(ctx, read.result);
  if (branch === null) return reject("The work unit has no unambiguous branch link; activate its work branch first.");
  const candidate = await readPublicationCandidate(ctx.store, read.result);
  if (candidate.status === "refused") return reject(candidate.refusal.condition, candidate.refusal);
  if (!params.candidateCurrent || candidate.result?.candidateId !== params.candidateId) return reject("The current Candidate identity is absent or stale; re-attest it.");
  if (meta.state === "Integrating" && meta.currentWorkflow === "integrate-work-unit") {
    return resumeIntegratingPublication(params, branch, reject);
  }
  return { status: "ready", branch, metaPath, primary: read.result, candidateObservation: candidate.result.observation };
}

async function readPublicationCandidate(store: Store, primary: StoreRecord): Promise<StoreResult<
  { candidateId: string; observation: RecordObservation } | null>> {
  const reference = recordReferences["review/candidate"](primary.reference.owner);
  const read = await store.read({ reference });
  if (read.status === "refused") return read.refusal.code === "not-found" ? { status: "ok", result: null } : read;
  const parsed = CandidateManagedRecordV1Schema.safeParse(read.result.fields);
  if (parsed.success && parsed.data.attestation.workUnit === primary.reference.owner.name && read.result.conflicts.length === 0) {
    return { status: "ok", result: { candidateId: parsed.data.attestation.candidateId,
      observation: { reference: read.result.reference, expected: { version: read.result.version, conflicts: read.result.conflicts } } } };
  }
  return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference,
    rule: "publication.candidate", condition: `Candidate authority is unreadable.${describeRecordConflicts(read.result.conflicts)}`,
    remedy: { text: "Repair the Candidate record or resolve its named conflicts, then retry publication." } } };
}

async function resumeIntegratingPublication(params: PublishParams, branch: string, reject: PublicationReject):
  Promise<Extract<PublishResult, { status: "rejected" | "unchanged" }>> {
  const parsed = IntegrationBoundaryLocusV2Schema.safeParse(params.boundary);
  if (!parsed.success) return reject("Native publication requires a version-two readiness boundary. Run pre-publication review again.", undefined,
    prePublicationRemedy(params.name));
  const boundary = parsed.data;
  if (boundary.candidateId !== params.candidateId || boundary.candidateSubjectDigest !== params.candidateSubjectDigest) {
    return reject("Publication boundary belongs to a different Candidate.");
  }
  if (boundary.locus === "hosted-review-pending" || boundary.locus === "delivery-status-required") return { status: "unchanged", boundary };
  let authorization: SubmissionAuthorization;
  try { authorization = await authorizeStoredPublication(params, boundary); }
  catch (error) { return rejectStoreFailure(error, reject); }
  if (authorization.status === "refused") return reject(authorization.reason, undefined, prePublicationRemedy(params.name));
  if (boundary.locus === "publication-pending") return { status: "unchanged", boundary };
  return { status: "unchanged", boundary: projectPublicationBoundary({ workUnit: params.name, branch,
    candidateId: params.candidateId, candidateSubjectDigest: params.candidateSubjectDigest,
    reservation: authorization.reservation, terminus: authorization.terminus, changeRequest: null,
    ...("readinessBinding" in boundary ? { readinessBinding: boundary.readinessBinding } : {}) }, 2) };
}
