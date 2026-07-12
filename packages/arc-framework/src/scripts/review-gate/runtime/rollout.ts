/** Required-context projection and add-before-remove rollout planning. */

import type { GateProjection } from "../core/execution.js";

export type ContextMode = "shadow" | "dual" | "final";
export type ReviewContext = "merge-ok" | "review-gate-shadow";

export interface NamedProjection { name: ReviewContext; projection: GateProjection }

export interface IndependentCiProof {
  exactHead: boolean;
  producerUnchanged: boolean;
  reviewerIndependent: boolean;
  producedByRepairChange: boolean;
}

export interface TransitionPrerequisites {
  currentGreen: ReviewContext[];
  ciOkExactHead: boolean;
  mergeFrozen: boolean;
  auditCaptured: boolean;
  repairChangesCiProducer: boolean;
  independentCiProof?: IndependentCiProof;
  projectActionsSuspended: boolean;
  independentRepairReview: boolean;
  repairEnvironmentProven: boolean;
  exclusiveWriterProven: boolean;
  repairStatusExactHead: boolean;
  repairStatusSourceProven: boolean;
  appContextStillRequired: boolean;
  adminBypass: boolean;
}

export interface RestorationPrerequisites {
  mergeFrozen: boolean;
  auditCaptured: boolean;
  restoredAppExactHead: boolean;
  restoredAppSourceProven: boolean;
  repairContextStillRequired: boolean;
  adminBypass: boolean;
}

export interface ContextTransitionPlan {
  currentMode: ContextMode;
  nextMode: ContextMode;
  currentRequired: ReviewContext[];
  nextRequired: ReviewContext[];
  add: ReviewContext[];
  remove: ReviewContext[];
  prerequisites: string[];
  verificationProbes: string[];
  rollbackMode: ContextMode;
}

/** Invalid or missing configuration stays non-authoritative. */
export function parseContextMode(value: string | undefined): ContextMode {
  return value === "dual" || value === "final" || value === "shadow" ? value : "shadow";
}

/** Change only context names; verdict content remains identical. */
export function projectContexts(mode: ContextMode, projection: GateProjection): NamedProjection[] {
  const names: ReviewContext[] = mode === "shadow"
    ? ["review-gate-shadow"]
    : mode === "dual" ? ["review-gate-shadow", "merge-ok"] : ["merge-ok"];
  return names.map((name) => ({ name, projection }));
}

function contexts(mode: ContextMode): ReviewContext[] {
  return mode === "shadow" ? ["merge-ok"] : mode === "dual" ? ["merge-ok", "review-gate-shadow"] : ["merge-ok"];
}

/** Render a reviewable normal promotion or rollback plan. */
export function planContextTransition(currentMode: ContextMode, nextMode: ContextMode): ContextTransitionPlan {
  const currentRequired = contexts(currentMode);
  const nextRequired = contexts(nextMode);
  return {
    currentMode, nextMode, currentRequired, nextRequired,
    add: nextRequired.filter((name) => !currentRequired.includes(name)),
    remove: currentRequired.filter((name) => !nextRequired.includes(name)),
    prerequisites: ["new-context-green", "single-producer-per-context"],
    verificationProbes: nextRequired.map((name) => `${name}:exact-head:green`),
    rollbackMode: currentMode,
  };
}

/** Reject removal-first mutations and same-name producer overlap. */
export function applyContextMutation(input: {
  proven: ReviewContext[];
  add?: ReviewContext;
  remove?: ReviewContext;
  producerOverlap?: boolean;
}): ReviewContext[] {
  if (input.producerOverlap) throw new Error("same-name-producer-overlap");
  if (input.remove !== undefined && !input.proven.includes(input.remove)) throw new Error("context-not-proven");
  const next = input.add === undefined ? [...input.proven] : [...new Set([...input.proven, input.add])];
  if (input.remove !== undefined) {
    if (next.length === 1) throw new Error("cannot-remove-last-proven-context");
    return next.filter((name) => name !== input.remove);
  }
  return next;
}

/** Validate the independent proof chain used while the App/controller is unavailable. */
export function validateOutageRecovery(input: TransitionPrerequisites): string[] {
  const failures: string[] = [];
  if (!input.mergeFrozen) failures.push("merge-not-frozen");
  if (!input.auditCaptured) failures.push("audit-not-captured");
  if (input.currentGreen.length === 0) failures.push("current-context-not-green");
  if (!input.repairChangesCiProducer && !input.ciOkExactHead) failures.push("ci-ok-not-proven");
  if (input.repairChangesCiProducer) {
    const proof = input.independentCiProof;
    if (proof === undefined || !proof.exactHead) failures.push("independent-ci-exact-head-not-proven");
    if (proof === undefined || !proof.producerUnchanged) failures.push("independent-ci-producer-not-unchanged");
    if (proof === undefined || !proof.reviewerIndependent) failures.push("independent-ci-review-missing");
    if (proof?.producedByRepairChange === true) failures.push("repair-ci-self-proof-prohibited");
  }
  if (!input.projectActionsSuspended) failures.push("project-actions-active");
  if (!input.independentRepairReview) failures.push("independent-review-missing");
  if (!input.repairEnvironmentProven) failures.push("repair-environment-not-proven");
  if (!input.exclusiveWriterProven) failures.push("exclusive-writer-not-proven");
  if (!input.repairStatusExactHead) failures.push("repair-status-head-not-proven");
  if (!input.repairStatusSourceProven) failures.push("repair-status-source-not-proven");
  if (!input.appContextStillRequired) failures.push("app-context-removed-before-repair-proof");
  if (input.adminBypass) failures.push("admin-bypass-prohibited");
  return failures;
}

/** Validate the reverse add-before-remove proof before emergency authority is removed. */
export function validateOutageRestoration(input: RestorationPrerequisites): string[] {
  const failures: string[] = [];
  if (!input.mergeFrozen) failures.push("merge-not-frozen");
  if (!input.auditCaptured) failures.push("audit-not-captured");
  if (!input.restoredAppExactHead) failures.push("restored-app-head-not-proven");
  if (!input.restoredAppSourceProven) failures.push("restored-app-source-not-proven");
  if (!input.repairContextStillRequired) failures.push("repair-context-removed-before-app-proof");
  if (input.adminBypass) failures.push("admin-bypass-prohibited");
  return failures;
}
