/** Node wiring that supplies real evidence to the housekeeping lifecycle compositions. */

import { withLockedUserInbox } from "../../commands/user/inbox-mutation.js";
import type { UserIOContext } from "../../commands/user/types.js";
import type { GitExecInput } from "../git/exec.js";
import { classifyTransientWorktreeProvenance, readWorktreeMarkerGeneration } from "../git/worktree-marker.js";
import {
  createGhChangeRequestLifecyclePort,
  resolveChangeRequestLifecycleConfiguration,
  transientTailRetirementTransform,
  type ChangeRequestLifecycleEvidence,
} from "../errand/change-request-lifecycle.js";
import {
  readExactBranchGeneration,
  tearDownExactBranchGeneration,
} from "../errand/exact-branch-generation.js";
import {
  housekeepAwaitMergeTransform,
  pinGroomOpenedBaseHead,
  type HousekeepIdentityRecord,
} from "../errand/identity-claims.js";
import { serializeTransientIdentityRecord } from "../errand/identity-record.js";
import {
  transactTransientIdentities,
  type IdentityTransactionOutcome,
  type IdentityTransform,
} from "../errand/identity-transaction.js";
import { observeExactChangeRequest } from "../errand/leave-runtime.js";
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
import type { SelectedLocusGeneration } from "../locus/selected-generation.js";
import { readHousekeepState } from "./open-runtime.js";
import { resolveExecutionNextOffer } from "./execution-offer.js";
import {
  closeHousekeep,
  settleHousekeep,
  type HousekeepEvidenceDependencies,
  type HousekeepIdentityOutcome,
  type HousekeepIdentityRead,
  type HousekeepOccupancyTarget,
  type HousekeepOperation,
  type HousekeepStateReading,
} from "./lifecycle-locus.js";

export interface HousekeepLifecycleRuntimeOptions {
  readonly slug: string;
  readonly base: string;
  readonly identity: string;
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
  readonly cwd: string;
  readonly io: UserIOContext & { execInput: GitExecInput };
}

export interface HousekeepSettleRuntimeOptions extends HousekeepLifecycleRuntimeOptions {
  readonly action: "finalize" | "abandon";
  /** Present when a caller already selected and validated one exact generation to settle. */
  readonly selected?: SelectedLocusGeneration;
}

/**
 * One session anchor and its roster read, established at the first seam that needs them.
 *
 * Both are deferred rather than acquired up front so an unprovable anchor refuses at the step the
 * roster is first consulted, leaving the identity-only decisions ahead of it reachable.
 */
interface HousekeepRuntimeLocus {
  read(): Promise<HousekeepStateReading>;
  cleanupOccupancy(target: HousekeepOccupancyTarget): Promise<LocusMutationResultV1>;
}

/** Preserve one complete sweep and close its exact local occupancy. */
export async function closeHousekeepAtRuntime(
  options: HousekeepLifecycleRuntimeOptions,
): Promise<LocusMutationResultV1> {
  const locus = createHousekeepRuntimeLocus(options);
  return closeHousekeep({
    slug: options.slug,
    dependencies: {
      ...evidenceDependencies(options, locus),
      mergeBase: async (baseHead, head, checkoutPath) => (
        await options.io.exec("git", ["merge-base", baseHead, head], { cwd: checkoutPath })
      ).stdout.trim(),
      changedPaths: async (from, to, checkoutPath) => {
        const output = (await options.io.exec("git", ["diff", "--name-only", "-z", from, to], {
          cwd: checkoutPath,
        })).stdout;
        return output.split("\0").filter((path) => path !== "");
      },
      observeChangeRequest: async (record, head) => {
        const observed = await observeExactChangeRequest(options.io.exec, record.branch, options.base, head);
        return observed.kind === "observed"
          ? { kind: "observed", changeRequest: observed.changeRequest }
          : observed;
      },
      persistAwaitingMerge: async (record, changeRequest) => identityOutcome(
        await transactTransientIdentities(identityIO(options), {
          remote: "origin", message: `arc: close housekeep ${options.slug}`,
          transform: housekeepAwaitMergeTransform({
            previous: record, changeRequest, updatedAt: nextTimestamp(record.updatedAt),
          }),
        }),
      ),
      resolveNextOffer: (parentCheckoutPath) => nextOffer(options, parentCheckoutPath),
    },
  });
}

/** Finalize a merged tail or explicitly abandon an open/closed-unmerged generation. */
export async function settleHousekeepAtRuntime(
  options: HousekeepSettleRuntimeOptions,
): Promise<LocusMutationResultV1> {
  const locus = createHousekeepRuntimeLocus(options);
  // Retirement authorizes against the exact host truth the tail read proved, so the evidence is
  // held from that read rather than re-fetched under a host that may have moved.
  let tail: ChangeRequestLifecycleEvidence | null = null;

  return settleHousekeep({
    slug: options.slug,
    action: options.action,
    ...(options.selected === undefined ? {} : { selected: options.selected }),
    dependencies: {
      ...evidenceDependencies(options, locus),
      readTail: async (record) => {
        const configured = await resolveChangeRequestLifecycleConfiguration(options.io.exec, options.base);
        if (configured === null) {
          return { kind: "unavailable", message: "Change-request coordinates are unavailable." };
        }
        tail = await createGhChangeRequestLifecyclePort(options.io.exec).read(configured, record.changeRequest);
        return { kind: "read", truth: tail.kind };
      },
      readBranchGeneration: (record) => readExactBranchGeneration(options.io.exec, {
        branch: record.branch, subject: "housekeeping", temporaryRefNamespace: "refs/arc/tmp/housekeep-abandon",
      }),
      tearDownBranch: (record, expectedHead) => tearDownExactBranchGeneration(options.io.exec, {
        branch: record.branch, expectedHead, subject: "housekeeping",
        temporaryRefNamespace: "refs/arc/tmp/housekeep-settle",
      }),
      retire: async (retirement) => {
        const lifecycle = tail;
        if (retirement.kind === "merged-tail" && lifecycle === null) {
          return { kind: "error", stage: "transform", message: "Housekeeping tail evidence is unavailable." };
        }
        return identityOutcome(await transactTransientIdentities(identityIO(options), {
          remote: "origin", message: `arc: ${options.action} housekeep ${options.slug}`,
          transform: retirement.kind === "merged-tail" && lifecycle !== null
            ? transientTailRetirementTransform({
              previous: retirement.record, action: options.action, lifecycle,
            })
            : exactRetirement(retirement.record),
        }));
      },
    },
  });
}

/** The evidence seams both housekeeping lifecycle verbs read the same way. */
function evidenceDependencies(
  options: HousekeepLifecycleRuntimeOptions,
  locus: HousekeepRuntimeLocus,
): HousekeepEvidenceDependencies {
  return {
    readIdentity: () => readIdentity(options),
    readState: () => locus.read(),
    readCheckout: async (checkoutPath) => ({
      dirty: (await options.io.exec("git", ["status", "--porcelain"], { cwd: checkoutPath })).stdout !== "",
      head: (await options.io.exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim(),
    }),
    pinBaseHead: () => pinGroomOpenedBaseHead(options.io.exec, { remote: "origin", baseRef: options.base }),
    cleanupOccupancy: (target) => locus.cleanupOccupancy(target),
  };
}

/**
 * Acquire the session anchor and roster once, on first use.
 *
 * The anchor is the same one occupancy cleanup pops under, so both seams share it rather than
 * proving session identity twice against a state that could move between them.
 */
function createHousekeepRuntimeLocus(options: HousekeepLifecycleRuntimeOptions): HousekeepRuntimeLocus {
  let established: Promise<
    | { kind: "established"; anchor: LocusProcessAnchor; inspector: ReturnType<typeof createPlatformProcessInspector>; state: LocusStateV1 }
    | { kind: "refused"; reason: LocusRefusalReason; message: string }
  > | null = null;

  const establish = async () => {
    const anchor = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
    if (anchor.kind !== "process") {
      return { kind: "refused" as const, reason: "lease-unknown" as const, message: anchor.reason };
    }
    const inspector = createPlatformProcessInspector();
    return {
      kind: "established" as const,
      anchor,
      inspector,
      state: await readHousekeepState(options, anchor, inspector),
    };
  };

  const resolve = () => (established ??= establish());

  return {
    read: async () => {
      const resolved = await resolve();
      return resolved.kind === "established" ? { kind: "read", state: resolved.state } : resolved;
    },
    cleanupOccupancy: async (target) => {
      const resolved = await resolve();
      if (resolved.kind !== "established") {
        return createLocusMutationResult({
          outcome: "refused", operation: target.operation, reason: resolved.reason,
          recommendedPromptText: resolved.message,
        });
      }
      return cleanupOccupancy(
        options, target.state, target.row, target.record,
        resolved.anchor, resolved.inspector, target.expectedHead, target.operation,
      );
    },
  };
}

async function readIdentity(options: HousekeepLifecycleRuntimeOptions): Promise<HousekeepIdentityRead> {
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

/** Map one identity transaction onto the composition's ready / refused / error channel. */
function identityOutcome<T>(result: IdentityTransactionOutcome<T>): HousekeepIdentityOutcome<T> {
  if (result.kind === "applied" || result.kind === "idempotent") return { kind: "ready", value: result.value };
  return result.kind === "refused"
    ? { kind: "refused", reason: result.reason }
    : { kind: "error", stage: result.stage, message: result.message };
}

async function cleanupOccupancy(
  options: HousekeepLifecycleRuntimeOptions,
  state: LocusStateV1,
  row: LocusRowV1,
  record: HousekeepIdentityRecord | null,
  anchor: LocusProcessAnchor,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
  expectedHead: string,
  operation: HousekeepOperation,
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

/** Retire a routing generation only while it still matches the one settlement decided on. */
function exactRetirement(record: HousekeepIdentityRecord): IdentityTransform<null> {
  return (records) => {
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

function refusal(
  reason: LocusRefusalReason,
  text: string,
  operation: HousekeepOperation = "housekeep-close",
): LocusMutationResultV1 {
  return createLocusMutationResult({ outcome: "refused", operation, reason, recommendedPromptText: text });
}
