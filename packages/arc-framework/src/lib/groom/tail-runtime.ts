/** Exact grooming finalization and abandonment. */

import { createLocusMutationResult } from "../locus/mutation.js";
import { createPlatformProcessAncestryInspector, createPlatformProcessInspector } from "../locus/platform-inspectors.js";
import { acquireSessionAnchor } from "../locus/process-inspector.js";
import { selectedGenerationMismatch, type SelectedLocusGeneration } from "../locus/selected-generation.js";
import type { LocusMutationResultV1, LocusRefusalReason } from "../locus/schema/index.js";
import {
  createGhChangeRequestLifecyclePort,
  resolveChangeRequestLifecycleConfiguration,
  transientTailRetirementTransform,
} from "../errand/change-request-lifecycle.js";
import type { GroomIdentityRecord } from "../errand/identity-claims.js";
import { transactTransientIdentities } from "../errand/identity-transaction.js";
import {
  cleanupGroomOccupancy,
  exactGroomRow,
  readGroomRuntimeState,
  type CloseGroomRuntimeOptions,
} from "./close-runtime.js";

export interface SettleGroomRuntimeOptions extends CloseGroomRuntimeOptions {
  readonly action: "finalize" | "abandon";
  /** Present when a caller already selected and validated one exact generation to settle. */
  readonly selected?: SelectedLocusGeneration;
}

/** Settle an open or awaiting grooming generation without widening branch authority. */
export async function settleGroomAtRuntime(options: SettleGroomRuntimeOptions): Promise<LocusMutationResultV1> {
  const slug = `groom-${options.anchorStub}`;
  const basis = await transactTransientIdentities(identityIO(options), {
    remote: "origin", message: `arc: reconcile groom ${options.anchorStub}`,
    transform: (records) => ({ kind: "idempotent", value: records.get(slug) ?? null }),
  });
  if (basis.kind === "error") return failure(`identity-${basis.stage}`, basis.message);
  if (basis.kind === "refused") return refusal("identity-conflict", basis.reason);
  const record = basis.value;
  if (record === null) return success("idempotent", `Grooming generation '${slug}' is already retired.`);
  if (record.version !== 3 || record.kind !== "groom") return refusal("identity-conflict", `Identity '${slug}' is not grooming.`);
  if (record.protection !== "full") {
    return refusal("full-protection-required", "Only full-mode grooming tails can be settled separately.");
  }

  let expectedHead: string;
  let retirementTransform: ReturnType<typeof transientTailRetirementTransform> | null = null;
  if (record.state === "awaiting-merge") {
    const configured = await resolveChangeRequestLifecycleConfiguration(options.exec, options.base);
    if (configured === null) return refusal("change-request-unverifiable", "Change-request coordinates are unavailable.");
    const lifecycle = await createGhChangeRequestLifecyclePort(options.exec).read(configured, record.changeRequest);
    const required = options.action === "finalize" ? "merged" : "closed-unmerged";
    if (lifecycle.kind !== required) {
      return refusal("change-request-unverifiable", `Grooming tail is '${lifecycle.kind}', not '${required}'.`);
    }
    expectedHead = record.changeRequest.headSha;
    retirementTransform = transientTailRetirementTransform({ previous: record, action: options.action, lifecycle });
  } else {
    if (options.action !== "abandon") return refusal("change-request-unverifiable", "Open grooming has no merged tail to finalize.");
    expectedHead = await exactLocalAndRemoteHead(options, record);
  }

  const anchor = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  if (anchor.kind !== "process") return refusal("lease-unknown", anchor.reason);
  const inspector = createPlatformProcessInspector();
  const state = await readGroomRuntimeState(options, anchor, inspector);
  const row = exactGroomRow(state, record);
  const mismatch = selectedGenerationMismatch(options.selected, row === null
    ? null
    : { recordId: row.recordId, leaseId: row.lease?.leaseId ?? null });
  if (mismatch !== null) return refusal("lease-generation-mismatch", mismatch);
  if (row !== null) {
    if (row.checkoutPath === null) return refusal("checkout-missing", "Grooming checkout path is absent.");
    const dirty = (await options.exec("git", ["status", "--porcelain"], { cwd: row.checkoutPath })).stdout;
    const actual = (await options.exec("git", ["rev-parse", "HEAD"], { cwd: row.checkoutPath })).stdout.trim();
    if (dirty !== "" || actual !== expectedHead) {
      return refusal("preservation-unproven", "Grooming checkout is dirty or moved from its exact head.");
    }
    const cleanup = await cleanupGroomOccupancy(options, state, row, record, anchor, inspector, expectedHead);
    if (cleanup.outcome === "refused" || cleanup.outcome === "error") return cleanup;
  }
  const refs = await deleteExactBranchGeneration(options, record.branch, expectedHead);
  if (refs !== null) return refusal("preservation-unproven", refs);
  const retired = await transactTransientIdentities(identityIO(options), {
    remote: "origin", message: `arc: ${options.action} groom ${options.anchorStub}`,
    transform: retirementTransform ?? ((records) => {
      const actual = records.get(record.slug);
      if (actual === undefined) return { kind: "idempotent", value: null };
      if (JSON.stringify(actual) !== JSON.stringify(record)) return { kind: "refused", reason: "Groom identity changed" };
      const next = new Map(records); next.delete(record.slug);
      return { kind: "applied", records: next, value: null };
    }),
  });
  if (retired.kind === "error") return failure(`identity-${retired.stage}`, retired.message);
  if (retired.kind === "refused") return refusal("identity-conflict", retired.reason);
  return success("applied", options.action === "finalize" ? "Merged grooming tail finalized." : "Grooming generation abandoned.");
}

async function exactLocalAndRemoteHead(options: SettleGroomRuntimeOptions, record: GroomIdentityRecord): Promise<string> {
  const local = (await options.exec("git", ["rev-parse", `refs/heads/${record.branch}^{commit}`])).stdout.trim();
  const snapshot = `refs/arc/tmp/groom-abandon/${record.claimId}`;
  try {
    await options.exec("git", ["fetch", "--", "origin", `+refs/heads/${record.branch}:${snapshot}`]);
    const remote = (await options.exec("git", ["rev-parse", `${snapshot}^{commit}`])).stdout.trim();
    if (remote !== local) throw new Error("Local and remote grooming heads differ");
    return local;
  } finally {
    await options.exec("git", ["update-ref", "-d", snapshot]).catch(() => undefined);
  }
}

async function deleteExactBranchGeneration(
  options: SettleGroomRuntimeOptions,
  branch: string,
  expectedHead: string,
): Promise<string | null> {
  const snapshot = `refs/arc/tmp/groom-settle/${expectedHead.slice(0, 16)}`;
  try {
    const local = (await options.exec("git", ["rev-parse", `refs/heads/${branch}^{commit}`])).stdout.trim();
    if (local !== expectedHead) return "Local grooming branch is absent or moved";
    await options.exec("git", ["fetch", "--", "origin", `+refs/heads/${branch}:${snapshot}`]);
    const remote = (await options.exec("git", ["rev-parse", `${snapshot}^{commit}`])).stdout.trim();
    if (remote !== expectedHead) return "Remote grooming branch is absent or moved";
    await options.exec("git", ["push", `--force-with-lease=refs/heads/${branch}:${expectedHead}`, "origin", `:refs/heads/${branch}`]);
    await options.exec("git", ["update-ref", "-d", `refs/heads/${branch}`, expectedHead]);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    await options.exec("git", ["update-ref", "-d", snapshot]).catch(() => undefined);
  }
}

function identityIO(options: SettleGroomRuntimeOptions) {
  return { exec: options.exec, execInput: options.execInput, identity: options.identity };
}

function success(outcome: "applied" | "idempotent", text: string): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome, operation: "plan-abandon", allocation: null, recordId: null, leaseId: null,
    activeLocusPath: null, sessionHomePath: null, identity: null, originEntry: null,
    restoredParent: null, nextOffer: null, recommendedPromptText: text,
  });
}

function refusal(reason: LocusRefusalReason, text: string): LocusMutationResultV1 {
  return createLocusMutationResult({ outcome: "refused", operation: "plan-abandon", reason, recommendedPromptText: text });
}

function failure(suffix: string, message: string): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "error", operation: "plan-abandon", error: { code: `locus.plan-abandon.${suffix}`, message },
    recommendedPromptText: "Inspect the retained grooming tail before retrying.",
  });
}
