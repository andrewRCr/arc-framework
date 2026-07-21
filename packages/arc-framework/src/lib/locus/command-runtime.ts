/** Production attach and release commands over exact reader-selected locus generations. */

import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import type { UserIOContext } from "../../commands/user/types.js";
import type { GitExecInput } from "../git/exec.js";
import { readHousekeepState } from "../housekeep/open-runtime.js";
import {
  attachLocusLease,
  createLocusMutationResult,
  releaseLocusLease,
  resumeDeadTransientLease,
} from "./mutation.js";
import { createPlatformProcessAncestryInspector, createPlatformProcessInspector } from "./platform-inspectors.js";
import { acquireSessionAnchor } from "./process-inspector.js";
import { createNodeProvisioningDependencies } from "./provisioning-runtime.js";
import type { LocusMutationResultV1, LocusRefusalReason, LocusRowV1 } from "./schema/index.js";
import { resolveLocusGeneration, type LocusResolveSubject } from "./resolve-driver.js";

export interface LocusCommandRuntimeOptions {
  readonly checkout?: string;
  readonly recordId?: string;
  readonly base: string;
  readonly identity: string;
  readonly cwd: string;
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
  readonly io: UserIOContext & { execInput: GitExecInput };
}

export interface ResolveLocusRuntimeOptions extends LocusCommandRuntimeOptions {
  readonly recordId: string;
  readonly action: "resume" | "abandon";
  abandon(subject: LocusResolveSubject, key: string): Promise<LocusMutationResultV1>;
}

/** Attach the entering process to one trusted managed role selected by the locus reader. */
export async function attachLocusAtRuntime(options: LocusCommandRuntimeOptions): Promise<LocusMutationResultV1> {
  const prepared = await prepare(options, "locus-attach");
  if (prepared.kind === "result") return prepared.result;
  const { anchor, row, checkoutPath, runtime } = prepared;
  const acquired = await runtime.acquireRecordLock(checkoutPath);
  if (acquired.kind !== "acquired") return lockRefusal("locus-attach", acquired.reason);
  try {
    const current = await runtime.readRecord(acquired.handle.recordPath, acquired.handle);
    if (current.kind !== "valid" || current.record.recordId !== row.recordId) {
      return refusal("locus-attach", "record-malformed", "The selected role generation changed before attach.");
    }
    const existingLeaseId = current.record.lease !== null
      && isDeepStrictEqual(current.record.lease.anchor, anchor)
      ? current.record.lease.leaseId
      : undefined;
    const now = new Date().toISOString();
    const attached = await attachLocusLease({
      recordId: current.record.recordId,
      sessionHomePath: checkoutPath,
      anchor,
      ...(existingLeaseId === undefined ? {} : { leaseId: existingLeaseId }),
      attachedAt: current.record.lease?.attachedAt ?? now,
      heartbeatAt: now,
      observedLiveness: row.lease?.state ?? null,
      io: {
        read: () => runtime.readRecord(acquired.handle.recordPath, acquired.handle),
        replace: (bytes, record) => runtime.replaceRecord(acquired.handle.recordPath, bytes, record, acquired.handle),
      },
    });
    if (attached.kind === "refused") return refusal("locus-attach", attached.reason, "The selected lease cannot be attached safely.");
    return success("locus-attach", attached.kind, row, attached.record.lease?.leaseId ?? null);
  } catch (error) {
    return failure("locus-attach", error);
  } finally {
    await runtime.releaseRecordLock(acquired.handle);
  }
}

/** Release only the caller-named lease generation while retaining its durable role. */
export async function releaseLocusAtRuntime(
  options: LocusCommandRuntimeOptions & { readonly leaseId: string },
): Promise<LocusMutationResultV1> {
  const prepared = await prepare(options, "locus-release");
  if (prepared.kind === "result") return prepared.result;
  const { runtime, row, checkoutPath } = prepared;
  const acquired = await runtime.acquireRecordLock(checkoutPath);
  if (acquired.kind !== "acquired") return lockRefusal("locus-release", acquired.reason);
  try {
    const released = await releaseLocusLease({
      recordId: row.recordId,
      leaseId: options.leaseId,
      io: {
        read: () => runtime.readRecord(acquired.handle.recordPath, acquired.handle),
        replace: (bytes, record) => runtime.replaceRecord(acquired.handle.recordPath, bytes, record, acquired.handle),
      },
    });
    if (released.kind === "refused") return refusal("locus-release", released.reason, "The named lease generation cannot be released.");
    return success("locus-release", released.kind, row, null);
  } catch (error) {
    return failure("locus-release", error);
  } finally {
    await runtime.releaseRecordLock(acquired.handle);
  }
}

/** Resolve one exact dead transient role through reattach or its subject abandonment driver. */
export async function resolveLocusAtRuntime(options: ResolveLocusRuntimeOptions): Promise<LocusMutationResultV1> {
  const anchor = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  if (anchor.kind !== "process") return refusal("locus-resolve", "cold-entry-required", anchor.reason);
  const inspector = createPlatformProcessInspector();
  const state = await readHousekeepState(options, anchor, inspector);
  const matches = state.roster.rows.filter((row) => row.recordId === options.recordId);
  const row = matches.length === 1 ? matches[0] : undefined;
  if (row === undefined) return refusal("locus-resolve", matches.length > 1 ? "duplicate-locus" : "checkout-missing", "Select one exact locus record generation.");
  const checkoutClean = row.checkoutPath !== null
    && (await options.io.exec("git", ["status", "--porcelain"], { cwd: row.checkoutPath })).stdout === "";
  const generationProven = row.diagnostics.length === 0 && row.frame === "residue";
  return resolveLocusGeneration({
    row, action: options.action, checkoutClean, generationProven,
    dependencies: {
      run: async (subject, action, key) => action === "abandon"
        ? options.abandon(subject, key)
        : resumeDeadAtRuntime(options, row, anchor, inspector),
    },
  });
}

async function resumeDeadAtRuntime(
  options: ResolveLocusRuntimeOptions,
  row: LocusRowV1,
  anchor: Extract<Awaited<ReturnType<typeof acquireSessionAnchor>>, { kind: "process" }>,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
): Promise<LocusMutationResultV1> {
  if (row.checkoutPath === null || row.recordId === null || row.lease === null) {
    return refusal("locus-resolve", "record-malformed", "The dead transient generation is incomplete.");
  }
  const runtime = createNodeProvisioningDependencies({
    exec: options.io.exec, identity: options.identity, anchor, inspector,
    pathFlavor: process.platform === "win32" ? "windows" : "posix", base: options.base,
    branch: row.identity?.branch ?? null, postCreateScript: options.postCreateScript,
    registeredHarnessDirs: options.registeredHarnessDirs,
  });
  const acquired = await runtime.acquireRecordLock(row.checkoutPath);
  if (acquired.kind !== "acquired") return lockRefusal("locus-resolve", acquired.reason);
  try {
    const now = new Date().toISOString();
    const resumed = await resumeDeadTransientLease({
      recordId: row.recordId, expectedLeaseId: row.lease.leaseId,
      sessionHomePath: row.checkoutPath, anchor, attachedAt: now, heartbeatAt: now,
      observedLiveness: row.lease.state,
      io: {
        read: () => runtime.readRecord(acquired.handle.recordPath, acquired.handle),
        replace: (bytes, record) => runtime.replaceRecord(acquired.handle.recordPath, bytes, record, acquired.handle),
      },
    });
    if (resumed.kind === "refused") return refusal("locus-resolve", resumed.reason, "The dead transient generation changed before resume.");
    return createLocusMutationResult({
      outcome: resumed.kind, operation: "locus-resolve", allocation: null,
      recordId: row.recordId, leaseId: resumed.record.lease?.leaseId ?? null,
      activeLocusPath: row.checkoutPath, sessionHomePath: row.checkoutPath,
      identity: row.identity, originEntry: row.role?.originEntry ?? null,
      dispatchId: row.role?.dispatchId ?? null, routingPlanDigest: row.role?.routingPlanDigest ?? null,
      restoredParent: null, nextOffer: null,
      recommendedPromptText: `Resumed the exact dead transient generation at ${row.checkoutPath}.`,
    });
  } finally {
    await runtime.releaseRecordLock(acquired.handle);
  }
}

async function prepare(
  options: LocusCommandRuntimeOptions,
  operation: "locus-attach" | "locus-release",
): Promise<
  | { kind: "result"; result: LocusMutationResultV1 }
  | {
      kind: "ready";
      row: LocusRowV1 & { recordId: string; checkoutPath: string };
      checkoutPath: string;
      anchor: Extract<Awaited<ReturnType<typeof acquireSessionAnchor>>, { kind: "process" }>;
      inspector: ReturnType<typeof createPlatformProcessInspector>;
      runtime: ReturnType<typeof createNodeProvisioningDependencies>;
    }
> {
  const anchor = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  if (anchor.kind !== "process") {
    return { kind: "result", result: refusal(operation, "cold-entry-required", anchor.reason) };
  }
  const inspector = createPlatformProcessInspector();
  const state = await readHousekeepState(options, anchor, inspector);
  const target = options.checkout === undefined ? null : resolve(options.cwd, options.checkout);
  const candidates = state.roster.rows.filter((row) => row.recordId !== null && row.checkoutPath !== null
    && row.kind === "managed-role"
    && (target === null || row.checkoutPath === target)
    && (options.recordId === undefined || row.recordId === options.recordId));
  const activeRecordId = options.recordId === undefined && state.current.kind === "resolved"
    ? state.current.activeRecordId : null;
  const selected = target === null && activeRecordId !== null
    ? candidates.find((row) => row.recordId === activeRecordId)
    : candidates.length === 1 ? candidates[0] : undefined;
  if (selected?.recordId === null || selected?.recordId === undefined
    || selected.checkoutPath === null || selected.role === null) {
    return {
      kind: "result",
      result: refusal(operation, target === null ? "role-conflict" : "checkout-missing", "Select one trusted managed checkout."),
    };
  }
  const runtime = createNodeProvisioningDependencies({
    exec: options.io.exec, identity: options.identity, anchor, inspector,
    pathFlavor: process.platform === "win32" ? "windows" : "posix", base: options.base,
    branch: selected.identity?.branch ?? null, postCreateScript: options.postCreateScript,
    registeredHarnessDirs: options.registeredHarnessDirs,
  });
  return {
    kind: "ready", row: { ...selected, recordId: selected.recordId, checkoutPath: selected.checkoutPath },
    checkoutPath: selected.checkoutPath, anchor, inspector, runtime,
  };
}

function success(
  operation: "locus-attach" | "locus-release",
  outcome: "applied" | "idempotent",
  row: LocusRowV1 & { recordId: string; checkoutPath: string },
  leaseId: string | null,
): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome, operation, allocation: null, recordId: row.recordId, leaseId,
    activeLocusPath: operation === "locus-attach" ? row.checkoutPath : null,
    sessionHomePath: operation === "locus-attach" ? row.checkoutPath : null,
    identity: row.identity, originEntry: row.role?.originEntry ?? null,
    dispatchId: row.role?.dispatchId ?? null, routingPlanDigest: row.role?.routingPlanDigest ?? null,
    restoredParent: null, nextOffer: null,
    recommendedPromptText: operation === "locus-attach"
      ? `Attached the entering session to ${row.checkoutPath}.`
      : `Released the exact lease for ${row.checkoutPath}.`,
  });
}

function lockRefusal(
  operation: "locus-attach" | "locus-release" | "locus-resolve",
  reason: "live" | "unknown" | "timeout",
): LocusMutationResultV1 {
  return refusal(operation, reason === "live" ? "lease-live" : "lease-unknown", "The locus record lock is unavailable.");
}

function refusal(
  operation: "locus-attach" | "locus-release" | "locus-resolve",
  reason: LocusRefusalReason,
  text: string,
): LocusMutationResultV1 {
  return createLocusMutationResult({ outcome: "refused", operation, reason, recommendedPromptText: text });
}

function failure(operation: "locus-attach" | "locus-release" | "locus-resolve", error: unknown): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "error", operation,
    error: { code: `locus.${operation}.failed`, message: error instanceof Error ? error.message : String(error) },
    recommendedPromptText: "Inspect the exact locus record and retry.",
  });
}
