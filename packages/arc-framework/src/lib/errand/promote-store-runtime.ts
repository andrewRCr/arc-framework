/** Store role-change composition with caller-owned terminal authority and marker settlement. */
import type { PromoteOrdinaryErrandRuntimeOptions } from "./promote-runtime.js";
import { createStorePromotionSteps, type StorePromotionCheckoutResult } from "./promote-store.js";
import { promoteOrdinaryErrand, type PromotionFrameReceipt, type PromotionFrameResult } from "./promote.js";
import { createErrandPromotionResult, type ErrandPromotionResult } from "./promotion-result.js";
import { authorizeErrandTerminal } from "./terminal-authority.js";
import { createProjectIdentityReader, resolveProjectIdentity } from "../store/project-identity.js";
import { createLocusPorts } from "../locus/lifecycle-ports.js";
import type { OrdinaryErrandRecord } from "./identity-transitions.js";
import type { Store } from "../store/contract.js";
import type { DerivedLocusFrame } from "../locus/derived-reader.js";

type StoreRuntimeOptions = PromoteOrdinaryErrandRuntimeOptions & { store: Store };

/** Select store promotion steps only after identity and marker exclusivity are available. */
export async function promoteStoreErrandAtRuntime(options: PromoteOrdinaryErrandRuntimeOptions,
  settleOccupancy: (frame: PromotionFrameReceipt) => Promise<PromotionFrameResult>): Promise<ErrandPromotionResult> {
  const store = options.store;
  if (store === undefined) return refused("The operational store is unavailable.");
  const project = await resolveProjectIdentity(options.projectId ?? createProjectIdentityReader(store));
  if (project.status !== "ready") return refused(`${project.reason} ${project.remedy.text}`);
  const frame = await options.readFrame();
  if (frame.entering.kind !== "selected") return refused("The entering checkout could not be resolved.");
  const bound = { ...options, store };
  const steps = createStorePromotionSteps({ ...bound, repository: project.id,
    checkout: (record, mode) => selectCheckout(bound, record, mode) });
  return promoteOrdinaryErrand({ ...options, dependencies: { ...steps,
    settleInbox: (receipt) => Promise.resolve({ ...receipt, originEntry: null, originEntrySourceDigest: null }), settleOccupancy } });
}
async function selectCheckout(options: StoreRuntimeOptions, record: OrdinaryErrandRecord,
  mode: "replaceFrame" | "recoverPromoted"): Promise<StorePromotionCheckoutResult> {
  const frame = await options.readFrame();
  const branch = `${options.type}/${options.name}`;
  const selected = mode === "recoverPromoted" ? selectRecoveryCheckout(frame, record, options.name, branch)
    : await selectTerminalCheckout(options, record, frame);
  if (selected.kind !== "ready") return selected;
  const ports = options.locusPorts ?? createLocusPorts({ cwd: selected.checkoutPath, exec: options.exec, store: options.store });
  const exclusive = await ports.checkMarkerExclusivity({ name: options.name, checkoutPath: selected.checkoutPath });
  return exclusive.kind === "refused" ? { kind: "refused", reason: "authority-unresolved", message: exclusive.reason } : selected;
}
async function selectTerminalCheckout(options: StoreRuntimeOptions, record: OrdinaryErrandRecord, frame: DerivedLocusFrame): Promise<StorePromotionCheckoutResult> {
  const authority = await authorizeErrandTerminal({
    store: options.store, frame, operation: "promote", subject: { kind: "errand", slug: record.slug, claimId: record.claimId },
    confirmForeignGeneration: options.confirmForeignGeneration,
    retryArguments: ["--name", options.name, "--type", options.type, "--floor", options.floor,
      ...(options.priority === undefined ? [] : ["--priority", options.priority]), ...(options.class === undefined ? [] : ["--class", options.class])] });
  if (authority.kind === "confirmation-required") {
    if (authority.subject.kind !== "errand") return { kind: "refused", reason: "role-conflict", message: "Promotion selected an incompatible subject." };
    return { ...authority, kind: "confirmation-required", subject: authority.subject };
  }
  if (authority.kind === "refused") return { kind: "refused", reason: ["identity-conflict", "authority-unresolved", "generation-mismatch"].includes(authority.reason)
    ? authority.reason as "identity-conflict" | "authority-unresolved" | "generation-mismatch" : "role-conflict", message: authority.message };
  if (authority.row === null || authority.checkoutPath === null) return { kind: "refused", reason: "checkout-missing", message: "Promotion requires the exact Errand checkout." };
  if (authority.row.checkout.branch !== record.branch) return { kind: "refused", reason: "promotion-source-invalid", message: "The Errand checkout moved off its branch." };
  return { kind: "ready", checkoutPath: authority.checkoutPath, allocation: authority.row.checkout.primary ? "primary" : "spawned", parentCheckoutPath: authority.parentCheckoutPath };
}
function refused(message: string): ErrandPromotionResult {
  return createErrandPromotionResult({ outcome: "refused", operation: "errand-promote", subject: null, checkoutPath: null,
    generation: null, reason: "authority-unresolved", recommendedPromptText: message });
}

function selectRecoveryCheckout(frame: Awaited<ReturnType<PromoteOrdinaryErrandRuntimeOptions["readFrame"]>>, record: OrdinaryErrandRecord,
  name: string, branch: string): StorePromotionCheckoutResult {
  const rows = frame.roster.filter((row) => row.subject?.kind === "work-unit" ? row.subject.key === name
    : row.subject?.kind === "errand" && row.subject.key === record.slug && row.subject.claimId === record.claimId);
  const row = rows[0];
  if (row === undefined) return { kind: "refused", reason: "checkout-missing", message: "Promoted work-unit checkout is unavailable." };
  if (rows.length > 1) return { kind: "refused", reason: "duplicate-locus", message: "Promoted work-unit session locus is ambiguous." };
  if (row.checkout.branch !== branch && row.checkout.branch !== record.branch) return { kind: "refused", reason: "promotion-source-invalid", message: "The promotion checkout is on neither the Errand branch nor the work branch." };
  return { kind: "ready", checkoutPath: row.checkout.path, allocation: row.checkout.primary ? "primary" : "spawned", parentCheckoutPath: row.parentCheckoutPath };
}
