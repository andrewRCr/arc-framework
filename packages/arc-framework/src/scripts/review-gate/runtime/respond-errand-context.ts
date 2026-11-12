/** Errand response admission and recovery guidance derived from the producer's existing claim. */
import { isDeepStrictEqual } from "node:util";
import { currentApprovedDispositionNode, type ApprovedDispositionRecord } from "../core/advisory-records.js";
import { validateApprovedDispositionRecordForResult } from "../core/review-result-disposition.js";
import { spineRemedy, type SpineRemedy } from "../../integration/spine-refusal.js";
import { RespondEnvelopeSchema } from "../core/review-command-envelope.js";
import type { ErrandReviewBinding } from "../core/advisory-records.js";
import type { ReviewResult } from "../core/review-result.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";

/** A response producer's Errand claim is not active on the current branch. */
export class ErrandResponseContextError extends Error {
  readonly code = "invalid-input";
  readonly remedy: SpineRemedy;
  constructor(claimId: string, local: boolean) {
    super(local ? "local review Errand claim does not match the active Errand"
      : `review source Errand claim ${claimId} does not match the active Errand`);
    this.name = "ErrandResponseContextError";
    this.remedy = spineRemedy("An Errand review response must belong to the active Errand on its owning branch.",
      `Switch to the owning branch for Errand claim ${claimId}, keeping that claim active and HEAD attached, `
      + "then retry the same response. Locate the claim and its owning checkout with", ["arc", "locus", "--json"]);
  }
}

/** Refuse an Errand producer outside its exact active claim before any proposal or approval can be written. */
export async function requireResponseErrand(result: ReviewResult,
  resolveActiveErrand: () => Promise<ErrandReviewBinding | null>): Promise<ErrandReviewBinding | null> {
  const local = result.kind === "attested-local" && result.vehicle.kind === "errand" ? result.vehicle : null;
  const lineage = result.admission.lineage;
  const claimId = local?.claimId ?? (lineage.kind === "head-bound" && lineage.vehicleKind === "errand" ? lineage.vehicleIdentity : null);
  if (claimId === null) return null;
  const active = await resolveActiveErrand();
  if (active === null || active.claimId !== claimId || (local !== null && active.key !== local.identity)) {
    throw new ErrandResponseContextError(claimId, local !== null);
  }
  return active;
}

interface StaleErrandResponseInput {
  operationId: string;
  attemptedTarget: ReviewTarget;
  currentTarget: ReviewTarget;
  errand: ErrandReviewBinding;
  result: ReviewResult;
  record: ApprovedDispositionRecord | null;
}
type ApprovalState = "missing" | "pending-fix" | "recorded" | "incompatible";
const TARGET_COORDINATES = ["baseRef", "diffBaseSha", "diffBaseTree", "headSha", "headTree"] as const;

function approvalState(input: StaleErrandResponseInput): ApprovalState {
  if (input.record === null) return "missing";
  let record: ApprovedDispositionRecord;
  try { record = validateApprovedDispositionRecordForResult(input.record, input.result); }
  catch { return "incompatible"; }
  if (record.candidate !== null || record.deliveryMember !== null || !isDeepStrictEqual(record.errand, input.errand)) {
    return "incompatible";
  }
  const node = currentApprovedDispositionNode(record), authorization = node.fixAuthorization;
  return authorization !== null && authorization.oldTargetId === input.result.target.targetId
    && authorization.oldHeadSha === input.result.target.headSha && node.policyProjectionPending !== true
    && node.errandFixResponse === null && node.deliveryMemberFixResponse === null ? "pending-fix" : "recorded";
}

function missingApprovalGuidance(input: StaleErrandResponseInput, baseDrift: boolean): string {
  const order = "No approved response exists for this review. The initial response must be recorded and approved "
    + "at the reviewed target before applying and committing its fix. ";
  if (baseDrift) return order + "After repairing the base context, reconfirm the exact reviewed target before "
    + "retrying the initial response. Preserve any commits that also moved HEAD and obtain Owner direction for "
    + "restoring that target on the same attached Errand branch.";
  return order + "If the fix was committed first, stop and obtain Owner direction to preserve those commits and "
    + `restore this same Errand branch (${input.errand.branch}) to the reviewed target with a clean worktree. `
    + "Keep the owning Errand claim active and remain on its branch; do not detach HEAD. Then retry the initial "
    + "response. After approval, reapply the preserved fix through the normal checks and commit interlock, and "
    + "submit the verified-fix response.";
}

function recordedApprovalGuidance(state: Exclude<ApprovalState, "missing">): string {
  if (state === "incompatible") return "The stored response does not match this producer and active Errand claim. "
    + "Preserve the record and obtain Owner direction for its incompatible binding; no initial-response or "
    + "verified-fix retry is available here.";
  if (state === "recorded") return "An approved response is already recorded, but it has no available pending FIX "
    + "continuation. Preserve the record and obtain Owner direction to restore the exact reviewed target and replay "
    + "or continue the recorded response. Do not submit another initial response.";
  return "An approved FIX response is already recorded. After completing the approved fix, its verification and "
    + "commit, replay the exact approved response with verifiedFix, using its approved verification scope and actual "
    + "evidence. Preserve the committed fix; do not restore HEAD to repeat initial approval.";
}

/** Refuse stale Errand targets with guidance derived from the exact saved response and actual coordinate drift. */
export function staleErrandResponseEnvelope(input: StaleErrandResponseInput): ReturnType<typeof RespondEnvelopeSchema.parse> {
  const { operationId, attemptedTarget, currentTarget, errand } = input;
  const changed = TARGET_COORDINATES.filter(field => attemptedTarget[field] !== currentTarget[field]);
  const coordinates = changed.map(field => `${field}: ${attemptedTarget[field]} -> ${currentTarget[field]}`).join("; ");
  const baseDrift = changed.some(field => field === "baseRef" || field === "diffBaseSha" || field === "diffBaseTree");
  const baseGuidance = baseDrift ? "Preserve committed work and obtain Owner direction to restore the reviewed base "
    + "context, then reconfirm its coordinates before continuing. Restoring HEAD alone does not repair this base "
    + "change. Keep the same Errand claim active and stay on its attached branch. " : "";
  const state = approvalState(input);
  const guidance = state === "missing" ? missingApprovalGuidance(input, baseDrift) : recordedApprovalGuidance(state);
  return RespondEnvelopeSchema.parse({ schemaVersion: 1, mode: "review-respond", diagnostics: [],
    state: "stale-target", nextAction: "stop", payload: { operationId, attemptedTarget, currentTarget, errand,
      detail: `Changed target coordinates: ${coordinates}. ${baseGuidance}${guidance}` } });
}
