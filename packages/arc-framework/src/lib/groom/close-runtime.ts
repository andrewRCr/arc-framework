/** Node wiring that supplies real evidence to the grooming close composition. */

import { access, lstat, readFile, realpath } from "node:fs/promises";
import { relative } from "node:path";

import type { GitExec, GitExecInput } from "../git/exec.js";
import { classifyTransientWorktreeProvenance, readWorktreeMarkerGeneration } from "../git/worktree-marker.js";
import { createLocusEvidenceIO } from "../locus/evidence.js";
import { createLocusMutationResult, popOwnedLocusRole } from "../locus/mutation.js";
import { createPlatformProcessAncestryInspector, createPlatformProcessInspector } from "../locus/platform-inspectors.js";
import { acquireSessionAnchor } from "../locus/process-inspector.js";
import { readPrimarySafety } from "../locus/primary-safety.js";
import { createNodeProvisioningDependencies } from "../locus/provisioning-runtime.js";
import { readLocusState } from "../locus/reader.js";
import type { LocusMutationResultV1, LocusProcessAnchor, LocusRefusalReason, LocusRowV1, LocusStateV1 } from "../locus/schema/index.js";
import {
  groomAwaitMergeTransform,
  groomSettleTransform,
  pinGroomOpenedBaseHead,
  rollbackIdentityClaim,
  type GroomIdentityRecord,
} from "../errand/identity-claims.js";
import type { TransientIdentityRecord } from "../errand/identity-record.js";
import {
  transactTransientIdentities,
  type IdentityTransactionOutcome,
} from "../errand/identity-transaction.js";
import { observeExactChangeRequest } from "../errand/leave-runtime.js";
import { resolveUserSurfaceResolver } from "../user-surfaces.js";
import { SlugSchema } from "../kernel/index.js";
import {
  closeGroom,
  type CloseGroomDependencies,
  type GroomIdentityOutcome,
  type GroomOccupancyTarget,
  type GroomStateReading,
} from "./close-locus.js";
import { listBacklogStubs } from "../work-unit/backlog-stub.js";

export interface CloseGroomRuntimeOptions {
  readonly anchorStub: string;
  readonly base: string;
  readonly identity: string;
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
  readonly exec: GitExec;
  readonly execInput: GitExecInput;
  readonly cwd: string;
}

/**
 * One session anchor and its roster read, established at the first seam that needs them.
 *
 * Both are deferred rather than acquired up front so an unprovable anchor refuses at the step the
 * roster is first consulted, leaving the identity-only decisions ahead of it reachable.
 */
export interface GroomRuntimeLocus {
  read(): Promise<GroomStateReading>;
  cleanupOccupancy(
    options: CloseGroomRuntimeOptions,
    target: GroomOccupancyTarget,
  ): Promise<LocusMutationResultV1>;
}

/** Validate the exact grooming write set, persist its tail, and close occupancy. */
export async function closeGroomAtRuntime(options: CloseGroomRuntimeOptions): Promise<LocusMutationResultV1> {
  const locus = createGroomRuntimeLocus(options);
  return closeGroom({
    anchorStub: options.anchorStub,
    dependencies: {
      ...groomEvidenceDependencies(options, locus),
      readClaim: () => readGroomClaim(options),
      settleClaim: async (record, head) => identityOutcome(await transactTransientIdentities(identityIO(options), {
        remote: "origin", message: `arc: settle groom ${options.anchorStub}`,
        transform: groomSettleTransform({
          previous: record, settledHead: head, updatedAt: nextTimestamp(record.updatedAt),
        }),
      })),
      observeChangeRequest: async (record, head) => {
        const observed = await observeExactChangeRequest(options.exec, record.branch, options.base, head);
        return observed.kind === "observed"
          ? { kind: "observed", changeRequest: observed.changeRequest }
          : observed;
      },
      persistAwaitingMerge: async (record, changeRequest) => identityOutcome(
        await transactTransientIdentities(identityIO(options), {
          remote: "origin", message: `arc: close groom ${options.anchorStub}`,
          transform: groomAwaitMergeTransform({
            previous: record, changeRequest, updatedAt: nextTimestamp(record.updatedAt),
          }),
        }),
      ),
      retireClaim: (record) => rollbackIdentityClaim(identityIO(options), {
        remote: "origin", message: `arc: close groom ${options.anchorStub}`, expected: record,
      }),
    },
  });
}

/**
 * The evidence seams every grooming tail reads the same way.
 *
 * Close and settle differ in which identity transitions they perform, not in how they observe the
 * locus, the checkout, or the base — so both compose over this one set.
 */
export function groomEvidenceDependencies(
  options: CloseGroomRuntimeOptions,
  locus: GroomRuntimeLocus,
): Pick<
  CloseGroomDependencies,
  "readState" | "pinBaseHead" | "readCheckout" | "isAncestor" | "changedPaths" | "claimedCohortPaths" | "cleanupOccupancy"
> {
  return {
    readState: () => locus.read(),
    pinBaseHead: () => pinGroomOpenedBaseHead(options.exec, { remote: "origin", baseRef: options.base }),
    readCheckout: (checkoutPath) => readGroomCheckout(options.exec, checkoutPath),
    isAncestor: (ancestor, descendant) => isAncestor(options.exec, ancestor, descendant),
    changedPaths: (from, to) => changedPaths(options.exec, from, to),
    claimedCohortPaths: (members) => claimedCohortPaths(options.cwd, members),
    cleanupOccupancy: (target) => locus.cleanupOccupancy(options, target),
  };
}

/** Read the exact grooming generation without transitioning it. */
export async function readGroomClaim(
  options: CloseGroomRuntimeOptions,
): Promise<GroomIdentityOutcome<TransientIdentityRecord | null>> {
  const slug = `groom-${options.anchorStub}`;
  return identityOutcome(await transactTransientIdentities(identityIO(options), {
    remote: "origin", message: `arc: reconcile groom ${options.anchorStub}`,
    transform: (records) => ({ kind: "idempotent", value: records.get(slug) ?? null }),
  }));
}

/** Map one identity transaction onto the composition's ready / refused / error channel. */
export function identityOutcome<T>(
  result: IdentityTransactionOutcome<T>,
): GroomIdentityOutcome<T> {
  if (result.kind === "applied" || result.kind === "idempotent") return { kind: "ready", value: result.value };
  return result.kind === "refused"
    ? { kind: "refused", reason: result.reason }
    : { kind: "error", stage: result.stage, message: result.message };
}

/**
 * Acquire the session anchor and roster once, on first use.
 *
 * The anchor is the same one occupancy cleanup pops under, so both seams share it rather than
 * proving session identity twice against a state that could move between them.
 */
export function createGroomRuntimeLocus(options: CloseGroomRuntimeOptions): GroomRuntimeLocus {
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
      state: await readGroomRuntimeState(options, anchor, inspector),
    };
  };

  const resolve = () => (established ??= establish());

  return {
    read: async () => {
      const resolved = await resolve();
      return resolved.kind === "established"
        ? { kind: "read", state: resolved.state }
        : resolved;
    },
    cleanupOccupancy: async (runtimeOptions, target) => {
      const resolved = await resolve();
      if (resolved.kind !== "established") {
        return createLocusMutationResult({
          outcome: "refused", operation: "plan-close", reason: resolved.reason,
          recommendedPromptText: resolved.message,
        });
      }
      return cleanupGroomOccupancy(
        runtimeOptions, target.state, target.row, target.record,
        resolved.anchor, resolved.inspector, target.expectedHead,
      );
    },
  };
}

function identityIO(options: CloseGroomRuntimeOptions) {
  return { exec: options.exec, execInput: options.execInput, identity: options.identity };
}

export async function readGroomRuntimeState(
  options: CloseGroomRuntimeOptions,
  anchor: LocusProcessAnchor,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
): Promise<LocusStateV1> {
  const root = (await resolveUserSurfaceResolver({
    cwd: options.cwd, identity: SlugSchema.parse(options.identity), exec: options.exec,
  })).identityGlobalRoot;
  return readLocusState({
    identity: options.identity, pathFlavor: process.platform === "win32" ? "windows" : "posix",
    evidenceIO: createLocusEvidenceIO({ exec: options.exec, identity: options.identity, inspector }),
    subjectMetaIO: {
      readFile: (path) => readFile(path, "utf8"),
      pathExists: async (path) => access(path).then(() => true, () => false), realpath, lstat,
    },
    identityGlobalUserDir: root, enteringAnchor: anchor,
    readPrimarySafety: (path) => readPrimarySafety({ primaryPath: path, baseBranch: options.base, exec: options.exec }),
  });
}

export async function cleanupGroomOccupancy(
  options: CloseGroomRuntimeOptions,
  state: LocusStateV1,
  row: LocusRowV1,
  record: GroomIdentityRecord,
  anchor: LocusProcessAnchor,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
  expectedHead: string,
): Promise<LocusMutationResultV1> {
  const checkoutPath = row.checkoutPath;
  const recordId = row.recordId;
  const leaseId = row.lease?.leaseId;
  if (checkoutPath === null || recordId === null || leaseId === undefined) return refusal("record-malformed", "Grooming occupancy is incomplete.");
  const runtime = createNodeProvisioningDependencies({
    exec: options.exec, identity: options.identity, anchor, inspector,
    pathFlavor: process.platform === "win32" ? "windows" : "posix", base: options.base,
    branch: record.branch, postCreateScript: options.postCreateScript, registeredHarnessDirs: options.registeredHarnessDirs,
  });
  const acquired = await runtime.acquireRecordLock(checkoutPath);
  if (acquired.kind !== "acquired") return refusal(acquired.reason === "live" ? "lease-live" : "lease-unknown", "Grooming session locus lock unavailable.");
  try {
    if (row.primary === true) {
      if (record.branch !== null) await options.exec("git", ["checkout", options.base], { cwd: checkoutPath });
    } else {
      const marker = await readWorktreeMarkerGeneration(checkoutPath);
      const provenance = classifyTransientWorktreeProvenance(marker, { kind: "groom", slug: record.slug, claimId: record.claimId });
      if (provenance?.kind !== "ready") return refusal("role-conflict", "Spawned grooming provenance is not exact.");
      const actual = (await options.exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
      if (actual !== expectedHead) return refusal("preservation-unproven", "Grooming head moved before cleanup.");
      await options.exec("git", ["worktree", "remove", checkoutPath], { cwd: state.roster.primaryPath });
    }
    return await popOwnedLocusRole({
      operation: "plan-close", recommendedPromptText: "Grooming occupancy removed.", recordId, checkoutPath,
      expectedSubject: { kind: "groom", key: record.slug, claimId: record.claimId }, expectedLeaseId: leaseId,
      enteringAnchor: anchor,
      io: {
        read: () => runtime.readRecord(acquired.handle.recordPath, acquired.handle),
        remove: (bytes) => runtime.removeRecord(acquired.handle.recordPath, bytes, acquired.handle),
      },
    });
  } finally {
    await runtime.releaseRecordLock(acquired.handle);
  }
}

async function readGroomCheckout(exec: GitExec, checkoutPath: string): Promise<{ dirty: boolean; head: string }> {
  const dirty = (await exec("git", ["status", "--porcelain"], { cwd: checkoutPath })).stdout;
  const head = (await exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
  return { dirty: dirty !== "", head };
}

async function isAncestor(exec: GitExec, ancestor: string, descendant: string): Promise<boolean> {
  try { await exec("git", ["merge-base", "--is-ancestor", ancestor, descendant]); return true; }
  catch { return false; }
}

async function changedPaths(exec: GitExec, from: string, to: string): Promise<string[]> {
  const output = (await exec("git", ["diff", "--name-only", "-z", from, to])).stdout;
  return output.split("\0").filter((path) => path !== "");
}

async function claimedCohortPaths(cwd: string, members: readonly string[]): Promise<string[]> {
  const stubs = await listBacklogStubs(cwd);
  const paths = new Set<string>();
  for (const member of members) {
    const stub = stubs.find((candidate) => candidate.slug === member);
    if (stub === undefined) continue;
    const content = await readFile(stub.metaPath, "utf8");
    const cohort = /^- \*\*Cohort:\*\*\s+`([^`]+)`\s*$/mu.exec(content)?.[1];
    if (cohort === undefined) continue;
    const segments = cohort.split("/");
    const name = segments.at(-1);
    if (name === undefined) continue;
    const path = `${cwd}/.arc/backlog/${stub.stateDir}/${segments.join("/")}/cohort-${name}.md`;
    if (await access(path).then(() => true, () => false)) paths.add(relative(cwd, path).replaceAll("\\", "/"));
  }
  return [...paths];
}

function nextTimestamp(previous: string): string {
  const now = Date.now();
  return new Date(Math.max(now, Date.parse(previous) + 1)).toISOString();
}

function refusal(reason: LocusRefusalReason, text: string): LocusMutationResultV1 {
  return createLocusMutationResult({ outcome: "refused", operation: "plan-close", reason, recommendedPromptText: text });
}
