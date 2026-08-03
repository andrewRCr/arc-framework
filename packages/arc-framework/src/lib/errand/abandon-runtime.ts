/** Production preservation and dead-residue ports for ordinary Errand abandonment. */

import { access, lstat, readFile, realpath } from "node:fs/promises";

import type { GitExec, GitExecInput } from "../git/exec.js";
import {
  classifyTransientWorktreeProvenance,
  readWorktreeMarkerGeneration,
} from "../git/worktree-marker.js";
import { createLocusEvidenceIO } from "../locus/evidence.js";
import { popLocusRole } from "../locus/mutation.js";
import {
  createPlatformProcessAncestryInspector,
  createPlatformProcessInspector,
} from "../locus/platform-inspectors.js";
import { acquireSessionAnchor, type SelectedSessionAnchor } from "../locus/process-inspector.js";
import { readPrimarySafety } from "../locus/primary-safety.js";
import { createNodeProvisioningDependencies } from "../locus/provisioning-runtime.js";
import { readLocusState } from "../locus/reader.js";
import { selectedGenerationMismatch, type SelectedLocusGeneration } from "../locus/selected-generation.js";
import type { LocusMutationResultV1, LocusRecordV1, LocusRowV1, LocusStateV1 } from "../locus/schema/index.js";
import {
  createGhChangeRequestLifecyclePort,
  resolveChangeRequestLifecycleConfiguration,
} from "./change-request-lifecycle.js";
import { abandonOrdinaryErrand, type AbandonStepResult } from "./abandon-locus.js";
import { ordinaryErrandTransform, provePauseHead, type OrdinaryErrandRecord } from "./identity-transitions.js";
import { transactTransientIdentities } from "./identity-transaction.js";

export interface AbandonOrdinaryErrandRuntimeOptions {
  readonly slug: string;
  readonly protection: "full";
  readonly base: string;
  readonly identity: string;
  readonly identityGlobalUserDir: string;
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
  readonly exec: GitExec;
  readonly execInput: GitExecInput;
  readonly clearExecuteBound: (record: OrdinaryErrandRecord) => Promise<AbandonStepResult>;
  /** Present when a caller already selected and validated one exact generation to abandon. */
  readonly selected?: SelectedLocusGeneration;
  /** Operator attestation already bounded to the selected generation by the locus resolve driver. */
  readonly confirmedNoLiveSession: boolean;
}

/** Abandon one exact ordinary-v3 identity and any provably dead local residue. */
export async function abandonOrdinaryErrandAtRuntime(
  options: AbandonOrdinaryErrandRuntimeOptions,
): Promise<LocusMutationResultV1> {
  const io = { exec: options.exec, execInput: options.execInput, identity: options.identity };
  const remote = await configuredIdentityRemote(options.exec);
  const lifecyclePort = createGhChangeRequestLifecyclePort(options.exec);
  const inspector = createPlatformProcessInspector();
  const ancestry = createPlatformProcessAncestryInspector();
  const anchor = await acquireSessionAnchor(process.pid, ancestry);
  const pathFlavor = process.platform === "win32" ? "windows" : "posix";

  return abandonOrdinaryErrand({
    slug: options.slug,
    protection: options.protection,
    dependencies: {
      readIdentity: async () => {
        const result = await transactTransientIdentities(io, {
          remote,
          message: `arc: reconcile errand identity ${options.slug}`,
          transform: (records) => ({ kind: "idempotent", value: records.get(options.slug) ?? null }),
        });
        if (result.kind === "applied" || result.kind === "idempotent") {
          return { kind: "ready", record: result.value };
        }
        return result.kind === "refused"
          ? { kind: "refused", reason: result.reason }
          : { kind: "error", message: result.message };
      },
      readLifecycle: async (record) => {
        if (record.state !== "awaiting-merge") throw new Error("Errand is not awaiting merge");
        const configured = await resolveChangeRequestLifecycleConfiguration(options.exec, options.base)
          ?? { repositoryRef: "", hostRef: "", baseRef: "" };
        return lifecyclePort.read(configured, record.changeRequest);
      },
      releaseRetiredResidue: () => releaseRetiredResidue(options, anchor, inspector, pathFlavor),
      cleanupResidue: (record) => cleanupResidue(options, record, anchor, inspector, pathFlavor),
      clearExecuteBound: options.clearExecuteBound,
      retire: async (record, lifecycle) => {
        const result = await transactTransientIdentities(io, {
          remote,
          message: `arc: abandon errand ${options.slug}`,
          transform: ordinaryErrandTransform(lifecycle === null
            ? { kind: "retire", previous: record, reason: "abandon", authorization: "local" }
            : { kind: "retire", previous: record, reason: "abandon", lifecycle }),
        });
        if (result.kind === "applied" || result.kind === "idempotent") return { kind: result.kind };
        return result.kind === "refused"
          ? { kind: "refused", reason: result.reason }
          : { kind: "error", message: result.message };
      },
    },
  });
}

/**
 * Release the locus role and lease an already-retired Errand identity left behind.
 *
 * Reached only from the identity-absent arm, so there is no branch, head, or capture left to
 * preserve — close proved and reaped those before retiring the identity. What remains is one
 * occupied checkout, and the caller's selected generation is what binds this to it. The row's own
 * role is the expected subject, since the identity that would otherwise name it is gone.
 */
async function releaseRetiredResidue(
  options: AbandonOrdinaryErrandRuntimeOptions,
  anchor: SelectedSessionAnchor,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
  pathFlavor: "windows" | "posix",
): Promise<AbandonStepResult> {
  const selected = options.selected;
  if (selected === undefined) return { kind: "idempotent" };
  if (anchor.kind !== "process") {
    return {
      kind: "refused",
      reason: "lease-unknown",
      message: `Retired-residue release needs a durable session anchor: ${anchor.reason}`,
    };
  }
  const state = await readRuntimeState(options, anchor, inspector, pathFlavor);
  const row = state.roster.rows.find((candidate) => candidate.recordId === selected.recordId) ?? null;
  if (row === null) return { kind: "idempotent" };
  if (row.kind !== "managed-role" || row.role === null || row.role.kind === "work-unit") {
    return { kind: "refused", reason: "role-conflict", message: "The selected residue is not a transient role." };
  }
  if (row.checkoutPath === null || row.recordId === null) {
    return { kind: "refused", reason: "record-malformed", message: "Errand residue is incomplete." };
  }
  if (row.lease === null) {
    return { kind: "refused", reason: "lease-unknown", message: "The Errand session locus lease cannot be verified dead." };
  }
  const confirmedNoLiveSession = options.confirmedNoLiveSession;
  if (row.lease.state === "live" && (!row.lease.selfHeld || !confirmedNoLiveSession)) {
    return { kind: "refused", reason: "lease-live", message: "The Errand session locus still has a live lease." };
  }
  if (row.lease.state === "unknown" && !confirmedNoLiveSession) {
    return { kind: "refused", reason: "lease-unknown", message: "The Errand session locus lease cannot be verified dead." };
  }
  const checkoutPath = row.checkoutPath;
  const recordId = row.recordId;
  const role = row.role;
  const leaseId = row.lease.leaseId;
  const mismatch = selectedGenerationMismatch(selected, {
    recordId,
    leaseId,
  });
  if (mismatch !== null) return { kind: "refused", reason: "lease-generation-mismatch", message: mismatch };

  return releaseLockedResidue({
    options,
    anchor,
    inspector,
    pathFlavor,
    row: { ...row, checkoutPath, recordId },
    branch: null,
    confirmedLeaseRelease: row.lease.state !== "dead",
    validateLockedRecord: (record) => record.recordId === recordId
      && record.checkoutPath === checkoutPath
      && record.role.subject.kind === role.subject.kind
      && record.role.subject.key === role.subject.key
      && record.role.subject.claimId === role.subject.claimId
      && record.lease?.leaseId === leaseId,
    prepareCheckout: async () => {
      const dirty = await worktreeIsDirty(options.exec, checkoutPath);
      if (dirty === null) return { kind: "error", message: "Could not read the Errand checkout state." };
      if (dirty) {
        return {
          kind: "refused",
          reason: "preservation-unproven",
          message: "The Errand checkout has uncommitted changes.",
        };
      }
      if (row.primary === true) return null;
      const marker = await readWorktreeMarkerGeneration(checkoutPath);
      const subject = role.subject;
      const provenance = subject.claimId === null
        ? null
        : classifyTransientWorktreeProvenance(marker, {
          kind: "errand",
          slug: subject.key,
          claimId: subject.claimId,
        });
      if (provenance?.kind !== "ready") {
        return { kind: "refused", reason: "role-conflict", message: "Spawned Errand provenance is not exact." };
      }
      try {
        await options.exec("git", ["worktree", "remove", checkoutPath], {
          cwd: state.roster.primaryPath,
        });
        return null;
      } catch (error) {
        return { kind: "error", message: errorMessage(error) };
      }
    },
    successText: "Retired Errand session locus released.",
  });
}

async function worktreeIsDirty(exec: GitExec, checkoutPath: string): Promise<boolean | null> {
  try {
    return (await exec("git", ["status", "--porcelain"], { cwd: checkoutPath })).stdout.trim() !== "";
  } catch {
    return null;
  }
}

interface LockedResidueReleaseOptions {
  readonly options: AbandonOrdinaryErrandRuntimeOptions;
  readonly anchor: Extract<SelectedSessionAnchor, { kind: "process" }>;
  readonly inspector: ReturnType<typeof createPlatformProcessInspector>;
  readonly pathFlavor: "windows" | "posix";
  readonly row: LocusRowV1 & { checkoutPath: string; recordId: string };
  readonly branch: string | null;
  /** Pop the exact locked lease generation under a previously bounded operator attestation. */
  readonly confirmedLeaseRelease: boolean;
  readonly validateLockedRecord: (record: LocusRecordV1) => boolean;
  readonly prepareCheckout: () => Promise<Extract<AbandonStepResult, { kind: "refused" | "error" }> | null>;
  readonly successText: string;
}

/** Pop one exact locked residue generation, tolerating a checkout already removed by a prior attempt. */
async function releaseLockedResidue(input: LockedResidueReleaseOptions): Promise<AbandonStepResult> {
  const { options, row } = input;
  const runtime = createNodeProvisioningDependencies({
    exec: options.exec,
    identity: options.identity,
    anchor: input.anchor,
    inspector: input.inspector,
    pathFlavor: input.pathFlavor,
    base: options.base,
    branch: input.branch,
    postCreateScript: options.postCreateScript,
    registeredHarnessDirs: options.registeredHarnessDirs,
  });
  const acquired = await runtime.acquireRecordLock(row.checkoutPath);
  if (acquired.kind !== "acquired") {
    return {
      kind: "refused",
      reason: acquired.reason === "live" ? "lease-live" : "lease-unknown",
      message: "The Errand session locus lock is not available.",
    };
  }
  try {
    const lockedRecord = await runtime.readRecord(acquired.handle.recordPath, acquired.handle);
    if (lockedRecord.kind !== "valid" || !input.validateLockedRecord(lockedRecord.record)) {
      return { kind: "refused", reason: "role-conflict", message: "Errand residue generation changed." };
    }
    const exists = await access(row.checkoutPath).then(() => true, () => false);
    if (exists) {
      const prepared = await input.prepareCheckout();
      if (prepared !== null) return prepared;
    }
    if (input.confirmedLeaseRelease) {
      const removed = await runtime.removeRecord(
        acquired.handle.recordPath,
        lockedRecord.bytes,
        acquired.handle,
      );
      if (removed.kind === "removed") return { kind: "applied" };
      const raced = await runtime.readRecord(acquired.handle.recordPath, acquired.handle);
      return raced.kind === "absent"
        ? { kind: "idempotent" }
        : {
          kind: "refused",
          reason: "lease-generation-mismatch",
          message: "Errand residue generation changed.",
        };
    }
    const popped = await popLocusRole({
      operation: "errand-abandon",
      recommendedPromptText: input.successText,
      recordId: row.recordId,
      checkoutPath: row.checkoutPath,
      expectedRole: lockedRecord.record.role,
      expectedLeaseId: row.lease?.leaseId ?? null,
      observedLiveness: row.lease?.state ?? null,
      duplicate: false,
      io: {
        read: () => runtime.readRecord(acquired.handle.recordPath, acquired.handle),
        remove: (expectedBytes) => runtime.removeRecord(acquired.handle.recordPath, expectedBytes, acquired.handle),
      },
    });
    if (popped.outcome === "refused") {
      return { kind: "refused", reason: popped.reason, message: popped.recommendedPromptText };
    }
    return popped.outcome === "error"
      ? { kind: "error", message: popped.error.message }
      : { kind: popped.outcome };
  } finally {
    await runtime.releaseRecordLock(acquired.handle);
  }
}

async function cleanupResidue(
  options: AbandonOrdinaryErrandRuntimeOptions,
  record: OrdinaryErrandRecord,
  anchor: SelectedSessionAnchor,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
  pathFlavor: "windows" | "posix",
): Promise<AbandonStepResult> {
  const expectedHead = await proveOrdinaryErrandAbandonmentPreservation(options.exec, options.base, record);
  if (expectedHead.kind !== "ready") return expectedHead;
  const state = await readRuntimeState(options, anchor, inspector, pathFlavor);
  const target = exactResidue(state, record);
  if (target.kind === "refused") return target.result;
  const mismatch = selectedGenerationMismatch(options.selected, target.row === null
    ? null
    : { recordId: target.row.recordId, leaseId: target.row.lease?.leaseId ?? null });
  if (mismatch !== null) return { kind: "refused", reason: "lease-generation-mismatch", message: mismatch };
  if (target.row === null) return { kind: "idempotent" };
  if (anchor.kind !== "process") {
    return {
      kind: "refused",
      reason: "lease-unknown",
      message: `Dead residue cleanup needs a durable session anchor: ${anchor.reason}`,
    };
  }
  const row = target.row;
  const confirmedNoLiveSession = options.confirmedNoLiveSession;
  if (row.lease?.state === "live" && (!row.lease.selfHeld || !confirmedNoLiveSession)) {
    return { kind: "refused", reason: "lease-live", message: "The Errand session locus still has a live lease." };
  }
  if (row.lease?.state === "unknown" && !confirmedNoLiveSession) {
    return { kind: "refused", reason: "lease-unknown", message: "The Errand session locus lease cannot be verified dead." };
  }
  if (row.checkoutPath === null || row.recordId === null) {
    return { kind: "refused", reason: "record-malformed", message: "Errand residue is incomplete." };
  }
  const checkoutPath = row.checkoutPath;
  const recordId = row.recordId;

  return releaseLockedResidue({
    options,
    anchor,
    inspector,
    pathFlavor,
    row: { ...row, checkoutPath, recordId },
    branch: record.branch,
    confirmedLeaseRelease: row.lease !== null && row.lease.state !== "dead",
    validateLockedRecord: (locked) => locked.recordId === recordId
      && locked.checkoutPath === checkoutPath
      && locked.role.subject.kind === "errand"
      && locked.role.subject.key === record.slug
      && locked.role.subject.claimId === record.claimId
      && locked.lease?.leaseId === row.lease?.leaseId,
    prepareCheckout: async () => {
      const clean = await proveCleanupCheckout(
        options.exec,
        checkoutPath,
        record.branch,
        expectedHead.head,
        row.primary === true ? options.base : null,
      );
      if (clean !== null) return clean;
      if (row.primary === true) {
        try {
          await options.exec("git", ["checkout", options.base], { cwd: checkoutPath });
          return null;
        } catch (error) {
          return { kind: "error", message: errorMessage(error) };
        }
      }
      const marker = await readWorktreeMarkerGeneration(checkoutPath);
      const provenance = classifyTransientWorktreeProvenance(marker, {
        kind: "errand", slug: record.slug, claimId: record.claimId,
      });
      if (provenance?.kind !== "ready") {
        return { kind: "refused", reason: "role-conflict", message: "Spawned Errand provenance is not exact." };
      }
      try {
        await options.exec("git", ["worktree", "remove", checkoutPath], {
          cwd: state.roster.primaryPath,
        });
        return null;
      } catch (error) {
        return { kind: "error", message: errorMessage(error) };
      }
    },
    successText: "Errand residue removed.",
  });
}

/** Prove that the exact local branch generation is retained by base or its freshly fetched remote. */
export async function proveOrdinaryErrandAbandonmentPreservation(
  exec: GitExec,
  base: string,
  record: OrdinaryErrandRecord,
): Promise<{ kind: "ready"; head: string } | Extract<AbandonStepResult, { kind: "refused" | "error" }>> {
  let head: string;
  try {
    head = (await exec("git", ["rev-parse", "--verify", `refs/heads/${record.branch}^{commit}`])).stdout.trim();
  } catch (error) {
    return { kind: "refused", reason: "preservation-unproven", message: `Errand branch is absent: ${errorMessage(error)}` };
  }
  const recorded = record.state === "paused"
    ? record.savedHead
    : record.state === "awaiting-merge" ? record.changeRequest.headSha : head;
  if (head !== recorded) {
    return { kind: "refused", reason: "preservation-unproven", message: "Errand branch head moved." };
  }
  try {
    await exec("git", ["merge-base", "--is-ancestor", head, base]);
    return { kind: "ready", head };
  } catch (error) {
    const exitCode = typeof error === "object" && error !== null && "exitCode" in error
      ? (error as { exitCode?: unknown }).exitCode
      : undefined;
    if (exitCode !== 1) return { kind: "error", message: errorMessage(error) };
  }
  if (await configuredIdentityRemote(exec) === null) {
    return {
      kind: "refused",
      reason: "preservation-unproven",
      message: "The 'origin' remote is absent, so remote preservation cannot be proven.",
    };
  }
  const remote = await provePauseHead(exec, { remote: "origin", branch: record.branch, savedHead: head });
  if (remote.kind === "proven") return { kind: "ready", head };
  return remote.kind === "refused"
    ? { kind: "refused", reason: "preservation-unproven", message: remote.reason }
    : { kind: "error", message: remote.message };
}

function exactResidue(
  state: LocusStateV1,
  record: OrdinaryErrandRecord,
): { kind: "ready"; row: LocusRowV1 | null } | { kind: "refused"; result: Extract<AbandonStepResult, { kind: "refused" }> } {
  const matches = state.roster.rows.filter((row) => row.role?.subject.kind === "errand"
    && row.role.subject.key === record.slug && row.role.subject.claimId === record.claimId);
  if (matches.length === 0) return { kind: "ready", row: null };
  if (matches.length !== 1) {
    return { kind: "refused", result: { kind: "refused", reason: "duplicate-locus", message: "Errand residue is ambiguous." } };
  }
  return { kind: "ready", row: matches[0] ?? null };
}

async function proveCleanupCheckout(
  exec: GitExec,
  checkoutPath: string,
  branch: string,
  expectedHead: string,
  baseBranch: string | null,
): Promise<Extract<AbandonStepResult, { kind: "refused" | "error" }> | null> {
  try {
    const currentBranch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: checkoutPath })).stdout.trim();
    const head = (await exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
    const dirty = (await exec("git", ["status", "--porcelain"], { cwd: checkoutPath })).stdout;
    const exactErrandCheckout = currentBranch === branch && head === expectedHead;
    const alreadyOnBase = baseBranch !== null && currentBranch === baseBranch;
    return dirty === "" && (exactErrandCheckout || alreadyOnBase)
      ? null
      : {
          kind: "refused",
          reason: "preservation-unproven",
          message: "Errand checkout is dirty, moved, or outside its Errand and base branches.",
        };
  } catch (error) {
    return { kind: "error", message: errorMessage(error) };
  }
}

async function readRuntimeState(
  options: AbandonOrdinaryErrandRuntimeOptions,
  anchor: SelectedSessionAnchor,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
  pathFlavor: "windows" | "posix",
): Promise<LocusStateV1> {
  return readLocusState({
    identity: options.identity,
    pathFlavor,
    evidenceIO: createLocusEvidenceIO({ exec: options.exec, identity: options.identity, inspector }),
    subjectMetaIO: {
      readFile: (path) => readFile(path, "utf8"),
      pathExists: async (path) => access(path).then(() => true, () => false),
      realpath,
      lstat,
    },
    identityGlobalUserDir: options.identityGlobalUserDir,
    enteringAnchor: anchor,
    readPrimarySafety: (path) => readPrimarySafety({ primaryPath: path, baseBranch: options.base, exec: options.exec }),
  });
}

async function configuredIdentityRemote(exec: GitExec): Promise<"origin" | null> {
  try {
    return (await exec("git", ["remote", "get-url", "origin"])).stdout.trim() === "" ? null : "origin";
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
