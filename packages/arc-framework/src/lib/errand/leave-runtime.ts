/** Production preservation, identity, and occupancy composition for ordinary Errand leave. */

import { access, lstat, readFile, realpath } from "node:fs/promises";

import type { GitExec, GitExecInput } from "../git/exec.js";
import {
  classifyTransientWorktreeProvenance,
  readWorktreeMarkerGeneration,
} from "../git/worktree-marker.js";
import { createLocusEvidenceIO } from "../locus/evidence.js";
import { popOwnedLocusRole } from "../locus/mutation.js";
import {
  createPlatformProcessAncestryInspector,
  createPlatformProcessInspector,
} from "../locus/platform-inspectors.js";
import { acquireSessionAnchor } from "../locus/process-inspector.js";
import { readPrimarySafety } from "../locus/primary-safety.js";
import { createNodeProvisioningDependencies } from "../locus/provisioning-runtime.js";
import { readLocusState } from "../locus/reader.js";
import { createLocusMutationResult } from "../locus/mutation.js";
import type {
  LocusChangeRequestV1,
  LocusMutationResultV1,
  LocusProcessAnchor,
  LocusRowV1,
  LocusStateV1,
} from "../locus/schema/index.js";
import {
  leaveOrdinaryErrand,
  type LeaveAuthorization,
  type LeaveCleanupResult,
} from "./leave.js";
import { provePauseHead, ordinaryErrandTransform, type OrdinaryErrandRecord } from "./identity-transitions.js";
import { transactTransientIdentities } from "./identity-transaction.js";

export interface LeaveOrdinaryErrandRuntimeOptions {
  readonly slug: string;
  readonly state: "paused" | "awaiting-merge";
  readonly protection: "full" | "partial";
  readonly base: string;
  readonly updatedAt: string;
  readonly identity: string;
  readonly identityGlobalUserDir: string;
  readonly activeExtensions: readonly string[];
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
  readonly exec: GitExec;
  readonly execInput: GitExecInput;
}

/** Run one production ordinary-Errand leave. */
export async function leaveOrdinaryErrandAtRuntime(
  options: LeaveOrdinaryErrandRuntimeOptions,
): Promise<LocusMutationResultV1> {
  if (options.protection !== "full") {
    return leaveOrdinaryErrand({
      ...options,
      dependencies: inertDependencies(),
    });
  }
  const inspector = createPlatformProcessInspector();
  const ancestry = createPlatformProcessAncestryInspector();
  const anchor = await acquireSessionAnchor(process.pid, ancestry);
  if (anchor.kind !== "process") {
    return createLocusMutationResult({
      outcome: "refused",
      operation: "errand-leave",
      reason: "cold-entry-required",
      recommendedPromptText: `Errand leave cannot establish a durable session anchor: ${anchor.reason}`,
    });
  }
  const pathFlavor = process.platform === "win32" ? "windows" : "posix";
  const io = { exec: options.exec, execInput: options.execInput, identity: options.identity };
  const readState = () => readRuntimeState(options, anchor, inspector, pathFlavor);
  return leaveOrdinaryErrand({
    slug: options.slug,
    state: options.state,
    protection: options.protection,
    updatedAt: options.updatedAt,
    dependencies: {
      readIdentity: () => transactTransientIdentities(io, {
        remote: "origin",
        message: `arc: reconcile errand identity ${options.slug}`,
        transform: (records) => ({ kind: "idempotent", value: records.get(options.slug) ?? null }),
      }),
      authorize: async (record) => options.state === "paused"
        ? authorizePause(options, record, await readState())
        : authorizeAwaitingMerge(options, record, await readState()),
      persist: (transition) => transactTransientIdentities(io, {
        remote: "origin",
        message: `arc: leave errand ${options.slug} ${options.state}`,
        transform: ordinaryErrandTransform(transition),
      }),
      cleanup: (record) => cleanupOccupancy(options, record, anchor, inspector, pathFlavor, readState),
    },
  });
}

function inertDependencies(): Parameters<typeof leaveOrdinaryErrand>[0]["dependencies"] {
  const unavailable = () => Promise.reject(new Error("partial leave has no identity authority"));
  return { readIdentity: unavailable, authorize: unavailable, persist: unavailable, cleanup: unavailable };
}

async function authorizePause(
  options: LeaveOrdinaryErrandRuntimeOptions,
  record: OrdinaryErrandRecord,
  state: LocusStateV1,
): Promise<LeaveAuthorization> {
  const target = exactOccupancy(state, record);
  if (target.kind !== "found") return target.result;
  const clean = await cleanExactHead(options.exec, target.row.checkoutPath, record.branch);
  if (clean.kind !== "ready") return clean.result;
  const proof = await provePauseHead(options.exec, {
    remote: "origin",
    branch: record.branch,
    savedHead: clean.head,
  });
  if (proof.kind === "refused") {
    return { kind: "refused", reason: "preservation-unproven", message: proof.reason };
  }
  if (proof.kind === "error") {
    return { kind: "error", code: `locus.errand-leave.pause-${proof.stage}`, message: proof.message };
  }
  return {
    kind: "authorized",
    transition: {
      kind: "pause",
      previous: record,
      savedHead: clean.head,
      evidence: proof.evidence,
      updatedAt: options.updatedAt,
    },
  };
}

async function authorizeAwaitingMerge(
  options: LeaveOrdinaryErrandRuntimeOptions,
  record: OrdinaryErrandRecord,
  state: LocusStateV1,
): Promise<LeaveAuthorization> {
  const target = exactOccupancy(state, record);
  if (target.kind !== "found") return target.result;
  const clean = await cleanExactHead(options.exec, target.row.checkoutPath, record.branch);
  if (clean.kind !== "ready") return clean.result;
  const observed = await observeOpenChangeRequest(options.exec, record.branch, options.base, clean.head);
  if (observed.kind !== "observed") {
    return {
      kind: "refused",
      reason: "change-request-unverifiable",
      message: observed.message,
    };
  }
  return {
    kind: "authorized",
    transition: {
      kind: "await-merge",
      previous: record,
      changeRequest: observed.changeRequest,
      configured: observed.configured,
      observed: observed.changeRequest,
      updatedAt: options.updatedAt,
    },
  };
}

async function cleanupOccupancy(
  options: LeaveOrdinaryErrandRuntimeOptions,
  record: OrdinaryErrandRecord,
  anchor: LocusProcessAnchor,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
  pathFlavor: "windows" | "posix",
  readState: () => Promise<LocusStateV1>,
): Promise<LeaveCleanupResult> {
  const state = await readState();
  const target = exactOccupancy(state, record);
  if (target.kind !== "found") {
    if (target.result.reason === "checkout-missing") {
      return { kind: "idempotent", allocation: null, recordId: null, restoredParent: restoredCurrentWu(state) };
    }
    return target.result;
  }
  const { row } = target;
  const checkoutPath = row.checkoutPath;
  const recordId = row.recordId;
  const leaseId = row.lease?.leaseId;
  if (checkoutPath === null || recordId === null || leaseId === undefined) {
    return { kind: "refused", reason: "record-malformed", message: "Errand occupancy is incomplete." };
  }
  const parent = restoredParent(state, row);
  const runtime = createNodeProvisioningDependencies({
    exec: options.exec,
    identity: options.identity,
    anchor,
    inspector,
    pathFlavor,
    base: options.base,
    branch: record.branch,
    postCreateScript: options.postCreateScript,
    registeredHarnessDirs: options.registeredHarnessDirs,
  });
  const acquired = await runtime.acquireRecordLock(checkoutPath);
  if (acquired.kind !== "acquired") {
    return {
      kind: "refused",
      reason: acquired.reason === "live" ? "lease-live" : "lease-unknown",
      message: "The Errand locus lock is not available.",
    };
  }
  try {
    const checkoutExists = await access(checkoutPath).then(() => true, () => false);
    if (!checkoutExists) {
      const branchReady = await exactBranchRef(options.exec, record.branch, terminalHead(record));
      if (branchReady !== null) return branchReady;
    } else if (row.primary === true) {
      const primaryReady = await restorePrimaryCheckout(options.exec, checkoutPath, options.base, record);
      if (primaryReady !== null) return primaryReady;
    } else {
      const ready = await cleanExactHead(options.exec, checkoutPath, record.branch, terminalHead(record));
      if (ready.kind !== "ready") return ready.result;
      const marker = await readWorktreeMarkerGeneration(checkoutPath);
      const provenance = classifyTransientWorktreeProvenance(marker, {
        kind: "errand",
        slug: record.slug,
        claimId: record.claimId,
      });
      if (provenance?.kind !== "ready") {
        return { kind: "refused", reason: "role-conflict", message: "Spawned Errand ownership is not exact." };
      }
      await options.exec("git", ["worktree", "remove", checkoutPath], { cwd: state.roster.primaryPath });
    }
    const popped = await popOwnedLocusRole({
      operation: "errand-leave",
      recommendedPromptText: "Errand occupancy removed.",
      recordId,
      checkoutPath,
      expectedSubject: { kind: "errand", key: record.slug, claimId: record.claimId },
      expectedLeaseId: leaseId,
      enteringAnchor: anchor,
      io: {
        read: () => runtime.readRecord(acquired.handle.recordPath, acquired.handle),
        remove: (expectedBytes) => runtime.removeRecord(acquired.handle.recordPath, expectedBytes, acquired.handle),
      },
    });
    if (popped.outcome === "refused") {
      return { kind: "refused", reason: popped.reason, message: popped.recommendedPromptText };
    }
    if (popped.outcome === "error") {
      return { kind: "error", code: popped.error.code, message: popped.error.message };
    }
    return {
      kind: popped.outcome,
      allocation: { kind: row.primary === true ? "primary" : "spawned", checkoutPath },
      recordId,
      restoredParent: parent,
    };
  } finally {
    await runtime.releaseRecordLock(acquired.handle);
  }
}

async function restorePrimaryCheckout(
  exec: GitExec,
  checkoutPath: string,
  base: string,
  record: OrdinaryErrandRecord,
): Promise<Extract<LeaveCleanupResult, { kind: "refused" }> | null> {
  try {
    const branch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: checkoutPath })).stdout.trim();
    const dirty = (await exec("git", ["status", "--porcelain"], { cwd: checkoutPath })).stdout;
    if (dirty !== "") {
      return { kind: "refused", reason: "preservation-unproven", message: "Primary Errand checkout is dirty." };
    }
    if (branch === record.branch) {
      const head = (await exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
      if (head !== terminalHead(record)) {
        return { kind: "refused", reason: "preservation-unproven", message: "Primary Errand head moved." };
      }
      await exec("git", ["checkout", base], { cwd: checkoutPath });
      return null;
    }
    if (branch !== base) {
      return { kind: "refused", reason: "role-conflict", message: "Primary checkout restored to an unexpected branch." };
    }
    return await exactBranchRef(exec, record.branch, terminalHead(record));
  } catch (error) {
    return { kind: "refused", reason: "checkout-missing", message: error instanceof Error ? error.message : String(error) };
  }
}

async function exactBranchRef(
  exec: GitExec,
  branch: string,
  expectedHead: string,
): Promise<Extract<LeaveCleanupResult, { kind: "refused" }> | null> {
  try {
    const head = (await exec("git", ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`])).stdout.trim();
    return head === expectedHead
      ? null
      : { kind: "refused", reason: "preservation-unproven", message: "Errand branch head moved after preservation." };
  } catch (error) {
    return { kind: "refused", reason: "preservation-unproven", message: error instanceof Error ? error.message : String(error) };
  }
}

function exactOccupancy(
  state: LocusStateV1,
  record: OrdinaryErrandRecord,
): { kind: "found"; row: LocusRowV1 } | { kind: "missing"; result: Extract<LeaveCleanupResult, { kind: "refused" }> } {
  const matches = state.roster.rows.filter((row) => row.role?.subject.kind === "errand"
    && row.role.subject.key === record.slug && row.role.subject.claimId === record.claimId);
  if (matches.length === 0) {
    return {
      kind: "missing",
      result: { kind: "refused", reason: "checkout-missing", message: "Exact Errand occupancy is absent." },
    };
  }
  const row = matches[0];
  if (matches.length !== 1 || row === undefined || row.checkoutPath === null) {
    return {
      kind: "missing",
      result: { kind: "refused", reason: "duplicate-locus", message: "Exact Errand occupancy is ambiguous." },
    };
  }
  return { kind: "found", row };
}

function restoredParent(
  state: LocusStateV1,
  row: LocusRowV1,
): { recordId: string; checkoutPath: string } | null {
  const parentPath = row.role?.parentCheckoutPath;
  if (parentPath === null || parentPath === undefined) return null;
  const parent = state.roster.rows.find((candidate) => candidate.checkoutPath === parentPath
    && candidate.role?.kind === "work-unit" && candidate.recordId !== null);
  return parent?.recordId !== null && parent?.recordId !== undefined && parent.checkoutPath !== null
    ? { recordId: parent.recordId, checkoutPath: parent.checkoutPath }
    : null;
}

function restoredCurrentWu(state: LocusStateV1): { recordId: string; checkoutPath: string } | null {
  if (state.current.kind !== "resolved") return null;
  const activeRecordId = state.current.activeRecordId;
  const row = state.roster.rows.find((candidate) => candidate.recordId === activeRecordId
    && candidate.role?.kind === "work-unit" && candidate.checkoutPath !== null);
  return row?.recordId !== null && row?.recordId !== undefined && row.checkoutPath !== null
    ? { recordId: row.recordId, checkoutPath: row.checkoutPath }
    : null;
}

function terminalHead(record: OrdinaryErrandRecord): string {
  if (record.state === "paused") return record.savedHead;
  if (record.state === "awaiting-merge") return record.changeRequest.headSha;
  throw new Error("Leave cleanup requires a persisted identity tail");
}

async function cleanExactHead(
  exec: GitExec,
  checkoutPath: string | null,
  branch: string,
  expectedHead?: string,
): Promise<
  | { kind: "ready"; head: string }
  | { kind: "refused"; result: Extract<LeaveCleanupResult, { kind: "refused" }> }
> {
  if (checkoutPath === null) {
    return { kind: "refused", result: { kind: "refused", reason: "checkout-missing", message: "Errand checkout is absent." } };
  }
  try {
    const currentBranch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: checkoutPath })).stdout.trim();
    const head = (await exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
    const dirty = (await exec("git", ["status", "--porcelain"], { cwd: checkoutPath })).stdout;
    if (currentBranch !== branch || dirty !== "" || (expectedHead !== undefined && head !== expectedHead)) {
      return {
        kind: "refused",
        result: { kind: "refused", reason: "preservation-unproven", message: "Errand checkout is dirty, moved, or off its exact branch head." },
      };
    }
    return { kind: "ready", head };
  } catch (error) {
    return {
      kind: "refused",
      result: { kind: "refused", reason: "checkout-missing", message: error instanceof Error ? error.message : String(error) },
    };
  }
}

async function observeOpenChangeRequest(
  exec: GitExec,
  branch: string,
  base: string,
  head: string,
): Promise<
  | { kind: "observed"; configured: Pick<LocusChangeRequestV1, "repositoryRef" | "hostRef" | "baseRef">; changeRequest: LocusChangeRequestV1 }
  | { kind: "unverifiable"; message: string }
> {
  try {
    const remoteUrl = (await exec("git", ["remote", "get-url", "origin"])).stdout.trim();
    const repository = parseRepositoryUrl(remoteUrl);
    if (repository === null) return { kind: "unverifiable", message: "Origin repository coordinates are unsupported." };
    const cliRepository = repository.hostRef === "github.com"
      ? repository.repositoryRef
      : `${repository.hostRef}/${repository.repositoryRef}`;
    const stdout = (await exec("gh", [
      "pr", "list", "--repo", cliRepository, "--state", "open", "--head", branch,
      "--limit", "2", "--json", "baseRefName,headRefName,headRefOid",
    ])).stdout;
    const decoded: unknown = JSON.parse(stdout);
    if (!Array.isArray(decoded) || decoded.length !== 1) {
      return { kind: "unverifiable", message: "Expected exactly one open change request for the Errand branch." };
    }
    const item: unknown = decoded[0];
    if (typeof item !== "object" || item === null) return { kind: "unverifiable", message: "Change-request evidence is malformed." };
    const value = item as Record<string, unknown>;
    if (value.baseRefName !== base || value.headRefName !== branch || value.headRefOid !== head) {
      return { kind: "unverifiable", message: "Change-request coordinates do not match the exact Errand head." };
    }
    const configured = { ...repository, baseRef: base };
    return {
      kind: "observed",
      configured,
      changeRequest: { ...configured, headRef: branch, headSha: head },
    };
  } catch (error) {
    return { kind: "unverifiable", message: error instanceof Error ? error.message : String(error) };
  }
}

function parseRepositoryUrl(url: string): { repositoryRef: string; hostRef: string } | null {
  const https = /^(?:https?|ssh):\/\/(?:[^@/]+@)?([^/]+)\/([^/]+\/[^/]+?)(?:\.git)?$/u.exec(url);
  const scp = /^(?:[^@]+@)?([^:]+):([^/]+\/[^/]+?)(?:\.git)?$/u.exec(url);
  const match = https ?? scp;
  const hostRef = match?.[1];
  const repositoryRef = match?.[2];
  return hostRef !== undefined && repositoryRef !== undefined
    ? { hostRef, repositoryRef }
    : null;
}

async function readRuntimeState(
  options: LeaveOrdinaryErrandRuntimeOptions,
  anchor: LocusProcessAnchor,
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
    activeExtensions: options.activeExtensions,
    enteringAnchor: anchor,
    readPrimarySafety: (path) => readPrimarySafety({
      primaryPath: path,
      baseBranch: options.base,
      exec: options.exec,
    }),
  });
}
