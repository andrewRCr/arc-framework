/** Exact housekeeping close, finalization, and abandonment composition. */

import { withLockedUserInbox } from "../../commands/user/inbox-mutation.js";
import type { UserIOContext } from "../../commands/user/types.js";
import type { GitExecInput } from "../git/exec.js";
import { classifyTransientWorktreeProvenance, readWorktreeMarkerGeneration } from "../git/worktree-marker.js";
import {
  createGhChangeRequestLifecyclePort,
  resolveChangeRequestLifecycleConfiguration,
  transientTailRetirementTransform,
} from "../errand/change-request-lifecycle.js";
import {
  housekeepAwaitMergeTransform,
  pinGroomOpenedBaseHead,
  type HousekeepIdentityRecord,
} from "../errand/identity-claims.js";
import { projectLocusIdentity, serializeTransientIdentityRecord } from "../errand/identity-record.js";
import { transactTransientIdentities } from "../errand/identity-transaction.js";
import { observeOpenChangeRequest } from "../errand/leave-runtime.js";
import { createLocusMutationResult, popOwnedLocusRole } from "../locus/mutation.js";
import { createPlatformProcessAncestryInspector, createPlatformProcessInspector } from "../locus/platform-inspectors.js";
import { acquireSessionAnchor } from "../locus/process-inspector.js";
import { createNodeProvisioningDependencies } from "../locus/provisioning-runtime.js";
import type {
  LocusMutationResultV1,
  LocusProcessAnchor,
  LocusRefusalReason,
  LocusRowV1,
  LocusStateV1,
} from "../locus/schema/index.js";
import { untrustedRefusalReason } from "../locus/trusted-row.js";
import { classifyHousekeepChangedPaths } from "./path-policy.js";
import { exactHousekeepRow, exactPartialHousekeepRow, readHousekeepState } from "./open-runtime.js";
import { resolveExecutionNextOffer, type ExecutionNextOffer } from "./execution-offer.js";

export interface HousekeepLifecycleRuntimeOptions {
  readonly slug: string;
  readonly base: string;
  readonly identity: string;
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
  readonly cwd: string;
  readonly io: UserIOContext & { execInput: GitExecInput };
}

/** Preserve one complete sweep and close its exact local occupancy. */
export async function closeHousekeepAtRuntime(
  options: HousekeepLifecycleRuntimeOptions,
): Promise<LocusMutationResultV1> {
  const recordResult = await readIdentity(options);
  if (recordResult.kind === "error") return failure("close", recordResult.message);
  const record = recordResult.record;
  const runtime = await runtimeState(options);
  if (runtime.kind === "refused") return runtime.result;
  const occupancy = record === null
    ? exactPartialHousekeepRow(runtime.state, options.slug)
    : exactHousekeepRow(runtime.state, record);
  if (occupancy.kind === "untrusted") {
    return refusal(
      untrustedRefusalReason(occupancy.reasons),
      `Housekeeping occupancy is not trusted: ${occupancy.reasons.join(", ")}.`,
    );
  }
  if (occupancy.kind === "absent") {
    if (record === null) {
      return success("housekeep-close", "idempotent", null, null, "Housekeeping occupancy is already closed.");
    }
    if (record.state !== "awaiting-merge") return refusal("checkout-missing", "Exact housekeeping occupancy is absent.");
    const offer = await nextOffer(options, currentWorkUnitPath(runtime.state));
    if (offer.kind === "refused") return refusal("identity-conflict", offer.reason);
    return success(
      "housekeep-close", "idempotent", record, null, "Housekeeping change request is awaiting merge.", offer.nextOffer,
    );
  }
  const row = occupancy.value.row;
  const checkoutPath = occupancy.value.checkoutPath;
  const dirty = (await options.io.exec("git", ["status", "--porcelain"], { cwd: checkoutPath })).stdout;
  if (dirty !== "") return refusal("preservation-unproven", "Housekeeping checkout has uncommitted changes.");
  const head = (await options.io.exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
  if (record?.state === "awaiting-merge") {
    if (head !== record.changeRequest.headSha) {
      return refusal("preservation-unproven", "Housekeeping head moved after its review tail was preserved.");
    }
    const offer = await nextOffer(options, row.role?.parentCheckoutPath ?? null);
    if (offer.kind === "refused") return refusal("identity-conflict", offer.reason);
    const popped = await cleanupOccupancy(
      options, runtime.state, row, record, runtime.anchor, runtime.inspector, head,
    );
    if (popped.outcome === "refused" || popped.outcome === "error") return popped;
    return success(
      "housekeep-close", "applied", record, popped.restoredParent,
      "Housekeeping change request is awaiting merge; local occupancy closed.", offer.nextOffer,
    );
  }
  const pinned = await pinGroomOpenedBaseHead(options.io.exec, { remote: "origin", baseRef: options.base });
  if (pinned.kind !== "pinned") {
    return refusal("preservation-unproven", pinned.kind === "refused" ? pinned.reason : pinned.message);
  }

  if (record === null) {
    if (head !== pinned.head) {
      return refusal("preservation-unproven", "Partial housekeeping HEAD is not the freshly pushed base head.");
    }
    const offer = await nextOffer(options, row.role?.parentCheckoutPath ?? null);
    if (offer.kind === "refused") return refusal("identity-conflict", offer.reason);
    const popped = await cleanupOccupancy(options, runtime.state, row, null, runtime.anchor, runtime.inspector, head);
    if (popped.outcome === "refused" || popped.outcome === "error") return popped;
    return success(
      "housekeep-close", "applied", null, popped.restoredParent, "Partial housekeeping sweep completed.", offer.nextOffer,
    );
  }

  const base = (await options.io.exec("git", ["merge-base", pinned.head, head], { cwd: checkoutPath })).stdout.trim();
  const changed = await changedPaths(options, base, head, checkoutPath);
  const policy = classifyHousekeepChangedPaths(changed);
  if (policy.kind === "refused") {
    return refusal("identity-conflict", `Housekeeping diff contains non-routing paths: ${policy.paths.join(", ")}`);
  }
  const observed = await observeOpenChangeRequest(options.io.exec, record.branch, options.base, head);
  if (observed.kind !== "observed") return refusal("change-request-unverifiable", observed.message);
  const offer = await nextOffer(options, row.role?.parentCheckoutPath ?? null);
  if (offer.kind === "refused") return refusal("identity-conflict", offer.reason);
  const persisted = await transactTransientIdentities(identityIO(options), {
    remote: "origin", message: `arc: close housekeep ${options.slug}`,
    transform: housekeepAwaitMergeTransform({
      previous: record, changeRequest: observed.changeRequest, updatedAt: nextTimestamp(record.updatedAt),
    }),
  });
  if (persisted.kind === "error") return failure(`identity-${persisted.stage}`, persisted.message);
  if (persisted.kind === "refused") return refusal("identity-conflict", persisted.reason);
  const popped = await cleanupOccupancy(
    options, runtime.state, row, persisted.value, runtime.anchor, runtime.inspector, head,
  );
  if (popped.outcome === "refused" || popped.outcome === "error") return popped;
  return success(
    "housekeep-close", "applied", persisted.value, popped.restoredParent,
    "Housekeeping change request preserved; routing occupancy closed.", offer.nextOffer,
  );
}

/** Finalize a merged tail or explicitly abandon an open/closed-unmerged generation. */
export async function settleHousekeepAtRuntime(
  options: HousekeepLifecycleRuntimeOptions & { readonly action: "finalize" | "abandon" },
): Promise<LocusMutationResultV1> {
  const operation = options.action === "finalize" ? "housekeep-close" : "housekeep-abandon";
  const recordResult = await readIdentity(options);
  if (recordResult.kind === "error") return failure("identity", recordResult.message, operation);
  const record = recordResult.record;
  if (record === null) {
    if (options.action !== "abandon") {
      return success(operation, "idempotent", null, null, "Housekeeping generation is already retired.");
    }
    return abandonPartialHousekeep(options);
  }

  let expectedHead: string;
  let retirementTransform: ReturnType<typeof transientTailRetirementTransform> | null = null;
  if (record.state === "awaiting-merge") {
    const configured = await resolveChangeRequestLifecycleConfiguration(options.io.exec, options.base);
    if (configured === null) return refusal("change-request-unverifiable", "Change-request coordinates are unavailable.", operation);
    const lifecycle = await createGhChangeRequestLifecyclePort(options.io.exec).read(configured, record.changeRequest);
    const required = options.action === "finalize" ? "merged" : "closed-unmerged";
    if (lifecycle.kind !== required) {
      return refusal("change-request-unverifiable", `Housekeeping tail is '${lifecycle.kind}', not '${required}'.`, operation);
    }
    expectedHead = record.changeRequest.headSha;
    retirementTransform = transientTailRetirementTransform({ previous: record, action: options.action, lifecycle });
  } else {
    if (options.action !== "abandon") {
      return refusal("change-request-unverifiable", "Open housekeeping has no merged tail to finalize.", operation);
    }
    const exact = await exactLocalAndRemoteHead(options, record);
    if (exact.kind === "refused") return refusal("preservation-unproven", exact.reason, operation);
    expectedHead = exact.head;
  }

  const runtime = await runtimeState(options);
  if (runtime.kind === "refused") return createLocusMutationResult({ ...runtime.result, operation });
  const occupancy = exactHousekeepRow(runtime.state, record);
  if (occupancy.kind === "untrusted") {
    return refusal(
      untrustedRefusalReason(occupancy.reasons),
      `Housekeeping occupancy is not trusted: ${occupancy.reasons.join(", ")}.`,
      operation,
    );
  }
  if (occupancy.kind === "trusted") {
    const { row, checkoutPath } = occupancy.value;
    const dirty = (await options.io.exec("git", ["status", "--porcelain"], { cwd: checkoutPath })).stdout;
    const actual = (await options.io.exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
    if (dirty !== "" || actual !== expectedHead) {
      return refusal("preservation-unproven", "Housekeeping checkout is dirty or moved from its exact head.", operation);
    }
    const cleanup = await cleanupOccupancy(
      options, runtime.state, row, record, runtime.anchor, runtime.inspector, expectedHead, operation,
    );
    if (cleanup.outcome === "refused" || cleanup.outcome === "error") return cleanup;
  }
  const pinned = await pinGroomOpenedBaseHead(options.io.exec, { remote: "origin", baseRef: options.base });
  if (pinned.kind !== "pinned") {
    return refusal("preservation-unproven", pinned.kind === "refused" ? pinned.reason : pinned.message, operation);
  }
  const refs = await deleteExactBranchGeneration(options, record.branch, expectedHead);
  if (refs !== null) return refusal("preservation-unproven", refs, operation);
  const retired = await transactTransientIdentities(identityIO(options), {
    remote: "origin", message: `arc: ${options.action} housekeep ${options.slug}`,
    transform: retirementTransform ?? exactRetirement(record),
  });
  if (retired.kind === "error") return failure(`identity-${retired.stage}`, retired.message, operation);
  if (retired.kind === "refused") return refusal("identity-conflict", retired.reason, operation);
  return success(
    operation, "applied", null, null,
    options.action === "finalize" ? "Merged housekeeping tail finalized." : "Housekeeping generation abandoned.",
  );
}

async function abandonPartialHousekeep(
  options: HousekeepLifecycleRuntimeOptions,
): Promise<LocusMutationResultV1> {
  const runtime = await runtimeState(options);
  if (runtime.kind === "refused") return createLocusMutationResult({ ...runtime.result, operation: "housekeep-abandon" });
  const occupancy = exactPartialHousekeepRow(runtime.state, options.slug);
  if (occupancy.kind === "untrusted") {
    return refusal(
      untrustedRefusalReason(occupancy.reasons),
      `Partial housekeeping occupancy is not trusted: ${occupancy.reasons.join(", ")}.`,
      "housekeep-abandon",
    );
  }
  if (occupancy.kind === "absent") {
    return success("housekeep-abandon", "idempotent", null, null, "Partial housekeeping generation is already retired.");
  }
  const { row, checkoutPath } = occupancy.value;
  const dirty = (await options.io.exec("git", ["status", "--porcelain"], { cwd: checkoutPath })).stdout;
  const head = (await options.io.exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
  const pinned = await pinGroomOpenedBaseHead(options.io.exec, { remote: "origin", baseRef: options.base });
  if (dirty !== "" || pinned.kind !== "pinned" || head !== pinned.head) {
    return refusal(
      "preservation-unproven", "Partial housekeeping checkout is dirty or not at the freshly fetched base head.",
      "housekeep-abandon",
    );
  }
  const cleanup = await cleanupOccupancy(
    options, runtime.state, row, null, runtime.anchor, runtime.inspector, head, "housekeep-abandon",
  );
  if (cleanup.outcome === "refused" || cleanup.outcome === "error") return cleanup;
  return success("housekeep-abandon", "applied", null, cleanup.restoredParent, "Partial housekeeping sweep abandoned.");
}

async function readIdentity(options: HousekeepLifecycleRuntimeOptions): Promise<
  { kind: "ok"; record: HousekeepIdentityRecord | null } | { kind: "error"; message: string }
> {
  const basis = await transactTransientIdentities(identityIO(options), {
    remote: "origin", message: `arc: reconcile housekeep ${options.slug}`,
    transform: (records) => ({ kind: "idempotent", value: records.get(options.slug) ?? null }),
  });
  if (basis.kind === "error") return { kind: "error", message: basis.message };
  if (basis.kind === "refused") return { kind: "error", message: basis.reason };
  const value = basis.value;
  if (value === null) return { kind: "ok", record: null };
  if (value.version !== 3 || value.kind !== "errand" || value.purpose !== "housekeep-routing") {
    return { kind: "error", message: `Identity '${options.slug}' is not housekeeping.` };
  }
  return { kind: "ok", record: value };
}

async function runtimeState(options: HousekeepLifecycleRuntimeOptions): Promise<
  | { kind: "ready"; state: LocusStateV1; anchor: LocusProcessAnchor; inspector: ReturnType<typeof createPlatformProcessInspector> }
  | { kind: "refused"; result: LocusMutationResultV1 }
> {
  const anchor = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  if (anchor.kind !== "process") return { kind: "refused", result: refusal("lease-unknown", anchor.reason) };
  const inspector = createPlatformProcessInspector();
  const state = await readHousekeepState(options, anchor, inspector);
  return { kind: "ready", state, anchor, inspector };
}

async function cleanupOccupancy(
  options: HousekeepLifecycleRuntimeOptions,
  state: LocusStateV1,
  row: LocusRowV1,
  record: HousekeepIdentityRecord | null,
  anchor: LocusProcessAnchor,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
  expectedHead: string,
  operation: "housekeep-close" | "housekeep-abandon" = "housekeep-close",
): Promise<LocusMutationResultV1> {
  const { checkoutPath, recordId } = row;
  const leaseId = row.lease?.leaseId;
  if (checkoutPath === null || recordId === null || leaseId === undefined) {
    return refusal("record-malformed", "Housekeeping occupancy is incomplete.", operation);
  }
  const runtime = createNodeProvisioningDependencies({
    exec: options.io.exec, identity: options.identity, anchor, inspector,
    pathFlavor: process.platform === "win32" ? "windows" : "posix", base: options.base,
    branch: record?.branch ?? null, postCreateScript: options.postCreateScript,
    registeredHarnessDirs: options.registeredHarnessDirs,
  });
  const acquired = await runtime.acquireRecordLock(checkoutPath);
  if (acquired.kind !== "acquired") {
    return refusal(acquired.reason === "live" ? "lease-live" : "lease-unknown", "Housekeeping session locus lock unavailable.", operation);
  }
  try {
    if (row.primary === true) {
      if (record !== null) await options.io.exec("git", ["checkout", options.base], { cwd: checkoutPath });
    } else {
      if (record === null) return refusal("role-conflict", "Partial housekeeping cannot own a spawned checkout.", operation);
      const marker = await readWorktreeMarkerGeneration(checkoutPath);
      const provenance = classifyTransientWorktreeProvenance(marker, {
        kind: "housekeep", slug: record.slug, claimId: record.claimId,
      });
      if (provenance?.kind !== "ready") return refusal("role-conflict", "Spawned housekeeping provenance is not exact.", operation);
      const actual = (await options.io.exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
      if (actual !== expectedHead) return refusal("preservation-unproven", "Housekeeping head moved before cleanup.", operation);
      await options.io.exec("git", ["worktree", "remove", checkoutPath], { cwd: state.roster.primaryPath });
    }
    return await popOwnedLocusRole({
      operation, recommendedPromptText: "Housekeeping occupancy removed.", recordId, checkoutPath,
      expectedSubject: record === null
        ? { kind: "housekeep", key: options.slug, claimId: null }
        : { kind: "errand", key: options.slug, claimId: record.claimId },
      expectedLeaseId: leaseId, enteringAnchor: anchor,
      io: {
        read: () => runtime.readRecord(acquired.handle.recordPath, acquired.handle),
        remove: (bytes) => runtime.removeRecord(acquired.handle.recordPath, bytes, acquired.handle),
      },
    });
  } finally {
    await runtime.releaseRecordLock(acquired.handle);
  }
}

async function changedPaths(
  options: HousekeepLifecycleRuntimeOptions,
  from: string,
  to: string,
  cwd: string,
): Promise<string[]> {
  const output = (await options.io.exec("git", ["diff", "--name-only", "-z", from, to], { cwd })).stdout;
  return output.split("\0").filter((path) => path !== "");
}

async function nextOffer(
  options: HousekeepLifecycleRuntimeOptions,
  parentCheckoutPath: string | null,
): Promise<ReturnType<typeof resolveExecutionNextOffer>> {
  const transaction = await withLockedUserInbox(options, ({ content }) => ({
    result: content === null
      ? { kind: "refused" as const, reason: "USER-INBOX is missing." }
      : resolveExecutionNextOffer({ content, completedTitle: null, parentCheckoutPath }),
  }));
  return transaction.result;
}

function currentWorkUnitPath(state: LocusStateV1): string | null {
  if (state.current.kind !== "resolved") return null;
  const activeRecordId = state.current.activeRecordId;
  return state.roster.rows.find((row) => row.recordId === activeRecordId
    && row.role?.kind === "work-unit")?.checkoutPath ?? null;
}

async function exactLocalAndRemoteHead(
  options: HousekeepLifecycleRuntimeOptions,
  record: HousekeepIdentityRecord,
): Promise<{ kind: "exact"; head: string } | { kind: "refused"; reason: string }> {
  try {
    const local = (await options.io.exec("git", ["rev-parse", `refs/heads/${record.branch}^{commit}`])).stdout.trim();
    const snapshot = `refs/arc/tmp/housekeep-abandon/${record.claimId}`;
    try {
      await options.io.exec("git", ["fetch", "--", "origin", `+refs/heads/${record.branch}:${snapshot}`]);
      const remote = (await options.io.exec("git", ["rev-parse", `${snapshot}^{commit}`])).stdout.trim();
      return remote === local ? { kind: "exact", head: local } : { kind: "refused", reason: "Local and remote housekeeping heads differ." };
    } finally {
      await options.io.exec("git", ["update-ref", "-d", snapshot]).catch(() => undefined);
    }
  } catch (error) {
    return { kind: "refused", reason: error instanceof Error ? error.message : String(error) };
  }
}

async function deleteExactBranchGeneration(
  options: HousekeepLifecycleRuntimeOptions,
  branch: string,
  expectedHead: string,
): Promise<string | null> {
  const snapshot = `refs/arc/tmp/housekeep-settle/${expectedHead.slice(0, 16)}`;
  try {
    const local = (await options.io.exec("git", ["rev-parse", `refs/heads/${branch}^{commit}`])).stdout.trim();
    if (local !== expectedHead) return "Local housekeeping branch is absent or moved";
    await options.io.exec("git", ["fetch", "--", "origin", `+refs/heads/${branch}:${snapshot}`]);
    const remote = (await options.io.exec("git", ["rev-parse", `${snapshot}^{commit}`])).stdout.trim();
    if (remote !== expectedHead) return "Remote housekeeping branch is absent or moved";
    await options.io.exec("git", [
      "push", `--force-with-lease=refs/heads/${branch}:${expectedHead}`, "origin", `:refs/heads/${branch}`,
    ]);
    await options.io.exec("git", ["update-ref", "-d", `refs/heads/${branch}`, expectedHead]);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    await options.io.exec("git", ["update-ref", "-d", snapshot]).catch(() => undefined);
  }
}

function exactRetirement(record: HousekeepIdentityRecord) {
  return (records: ReadonlyMap<string, import("../errand/identity-record.js").TransientIdentityRecord>) => {
    const actual = records.get(record.slug);
    if (actual === undefined) return { kind: "idempotent" as const, value: null };
    if (serializeTransientIdentityRecord(actual) !== serializeTransientIdentityRecord(record)) {
      return { kind: "refused" as const, reason: "Housekeeping identity changed before retirement" };
    }
    const next = new Map(records);
    next.delete(record.slug);
    return { kind: "applied" as const, records: next, value: null };
  };
}

function identityIO(options: HousekeepLifecycleRuntimeOptions) {
  return { exec: options.io.exec, execInput: options.io.execInput, identity: options.identity };
}

function nextTimestamp(previous: string): string {
  return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
}

function success(
  operation: "housekeep-close" | "housekeep-abandon",
  outcome: "applied" | "idempotent",
  record: HousekeepIdentityRecord | null,
  restoredParent: { recordId: string; checkoutPath: string } | null,
  text: string,
  nextOffer: ExecutionNextOffer = null,
): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome, operation, allocation: null, recordId: null, leaseId: null,
    activeLocusPath: null, sessionHomePath: restoredParent?.checkoutPath ?? null,
    identity: record === null ? null : projectLocusIdentity(record), originEntry: null,
    restoredParent, nextOffer, recommendedPromptText: text,
  });
}

function refusal(
  reason: LocusRefusalReason,
  text: string,
  operation: "housekeep-close" | "housekeep-abandon" = "housekeep-close",
): LocusMutationResultV1 {
  return createLocusMutationResult({ outcome: "refused", operation, reason, recommendedPromptText: text });
}

function failure(
  suffix: string,
  message: string,
  operation: "housekeep-close" | "housekeep-abandon" = "housekeep-close",
): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "error", operation, error: { code: `locus.${operation}.${suffix}`, message },
    recommendedPromptText: "Inspect the retained housekeeping identity and session locus before retrying.",
  });
}
