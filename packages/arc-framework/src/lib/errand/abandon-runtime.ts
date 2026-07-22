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
import type { LocusMutationResultV1, LocusRowV1, LocusStateV1 } from "../locus/schema/index.js";
import {
  createGhChangeRequestLifecyclePort,
  resolveChangeRequestLifecycleConfiguration,
} from "./change-request-lifecycle.js";
import { abandonOrdinaryErrand, type AbandonStepResult } from "./abandon-locus.js";
import { ordinaryErrandTransform, provePauseHead, type OrdinaryErrandRecord } from "./identity-transitions.js";
import { transactTransientIdentities } from "./identity-transaction.js";

export interface AbandonOrdinaryErrandRuntimeOptions {
  readonly slug: string;
  readonly protection: "full" | "partial";
  readonly base: string;
  readonly identity: string;
  readonly identityGlobalUserDir: string;
  readonly activeExtensions: readonly string[];
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
  readonly exec: GitExec;
  readonly execInput: GitExecInput;
  readonly clearDispatch: (record: OrdinaryErrandRecord) => Promise<AbandonStepResult>;
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
      cleanupResidue: (record) => cleanupResidue(options, record, anchor, inspector, pathFlavor),
      clearDispatch: options.clearDispatch,
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
  if (target.row === null) return { kind: "idempotent" };
  if (anchor.kind !== "process") {
    return {
      kind: "refused",
      reason: "lease-unknown",
      message: `Dead residue cleanup needs a durable session anchor: ${anchor.reason}`,
    };
  }
  const row = target.row;
  if (row.lease?.state === "live") {
    return { kind: "refused", reason: "lease-live", message: "The Errand locus still has a live lease." };
  }
  if (row.lease?.state === "unknown") {
    return { kind: "refused", reason: "lease-unknown", message: "The Errand locus lease cannot be verified dead." };
  }
  if (row.checkoutPath === null || row.recordId === null) {
    return { kind: "refused", reason: "record-malformed", message: "Errand residue is incomplete." };
  }

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
  const acquired = await runtime.acquireRecordLock(row.checkoutPath);
  if (acquired.kind !== "acquired") {
    return {
      kind: "refused",
      reason: acquired.reason === "live" ? "lease-live" : "lease-unknown",
      message: "The Errand locus lock is not available.",
    };
  }
  try {
    const lockedRecord = await runtime.readRecord(acquired.handle.recordPath, acquired.handle);
    if (lockedRecord.kind !== "valid"
      || lockedRecord.record.recordId !== row.recordId
      || lockedRecord.record.checkoutPath !== row.checkoutPath
      || lockedRecord.record.role.subject.kind !== "errand"
      || lockedRecord.record.role.subject.key !== record.slug
      || lockedRecord.record.role.subject.claimId !== record.claimId
      || lockedRecord.record.lease?.leaseId !== row.lease?.leaseId) {
      return { kind: "refused", reason: "role-conflict", message: "Errand residue generation changed." };
    }
    const exists = await access(row.checkoutPath).then(() => true, () => false);
    if (!exists) {
      return { kind: "refused", reason: "checkout-missing", message: "Recorded Errand checkout is absent." };
    }
    const clean = await cleanExactCheckout(options.exec, row.checkoutPath, record.branch, expectedHead.head);
    if (clean !== null) return clean;
    if (row.primary === true) {
      try {
        await options.exec("git", ["checkout", options.base], { cwd: row.checkoutPath });
      } catch (error) {
        return { kind: "error", message: errorMessage(error) };
      }
    } else {
      const marker = await readWorktreeMarkerGeneration(row.checkoutPath);
      const provenance = classifyTransientWorktreeProvenance(marker, {
        kind: "errand", slug: record.slug, claimId: record.claimId,
      });
      if (provenance?.kind !== "ready") {
        return { kind: "refused", reason: "role-conflict", message: "Spawned Errand provenance is not exact." };
      }
      try {
        await options.exec("git", ["worktree", "remove", row.checkoutPath], { cwd: state.roster.primaryPath });
      } catch (error) {
        return { kind: "error", message: errorMessage(error) };
      }
    }

    const popped = await popLocusRole({
      operation: "errand-abandon",
      recommendedPromptText: "Errand residue removed.",
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
    if (popped.outcome === "error") return { kind: "error", message: popped.error.message };
    return { kind: popped.outcome };
  } finally {
    await runtime.releaseRecordLock(acquired.handle);
  }
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

async function cleanExactCheckout(
  exec: GitExec,
  checkoutPath: string,
  branch: string,
  expectedHead: string,
): Promise<Extract<AbandonStepResult, { kind: "refused" | "error" }> | null> {
  try {
    const currentBranch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: checkoutPath })).stdout.trim();
    const head = (await exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
    const dirty = (await exec("git", ["status", "--porcelain"], { cwd: checkoutPath })).stdout;
    return currentBranch === branch && head === expectedHead && dirty === ""
      ? null
      : { kind: "refused", reason: "preservation-unproven", message: "Errand checkout is dirty, moved, or off branch." };
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
    activeExtensions: options.activeExtensions,
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
