/** Production ports for exact ordinary-v3 Errand merge finalization. */

import { access, lstat, open, readFile, realpath, unlink } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import type { GitExec, GitExecInput } from "../git/exec.js";
import { readWorktreeMarker } from "../git/worktree-marker.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import { createLocusEvidenceIO } from "../locus/evidence.js";
import {
  createPlatformProcessAncestryInspector,
  createPlatformProcessInspector,
} from "../locus/platform-inspectors.js";
import { acquireSessionAnchor } from "../locus/process-inspector.js";
import { deriveLocusRecordId } from "../locus/path-identity.js";
import { readPrimarySafety } from "../locus/primary-safety.js";
import { readLocusState } from "../locus/reader.js";
import type { LocusMutationResultV1, LocusStateV1 } from "../locus/schema/index.js";
import {
  createGhChangeRequestLifecyclePort,
  observeExactChangeRequest,
  resolveChangeRequestLifecycleConfiguration,
} from "./change-request-lifecycle.js";
import { resolveOptionalCommit, tearDownExactBranchGeneration } from "./exact-branch-generation.js";
import {
  classifyErrandCloseOccupancy,
  type BaseCheckoutCloseProof,
} from "./close-occupancy.js";
import {
  closeOrdinaryErrand,
  type CloseAuthorityGuard,
  type CloseAuthorityLeaseResult,
  type CloseInboxResult,
  type CloseOccupancyResult,
  type CloseRefCleanupResult,
  type CloseTarget,
  type CloseTargetResolution,
} from "./close-locus.js";
import { projectLocusIdentity, type TransientIdentityRecord } from "./identity-record.js";
import { ordinaryErrandTransform, type OrdinaryErrandRecord } from "./identity-transitions.js";
import { transactTransientIdentities } from "./identity-transaction.js";

export interface CloseOrdinaryErrandRuntimeOptions {
  readonly slug: string;
  readonly base: string;
  readonly protection: "full" | "partial";
  readonly force: boolean;
  readonly identity: string;
  readonly identityGlobalUserDir: string;
  readonly exec: GitExec;
  readonly execInput: GitExecInput;
  readonly removeInbox: (record: OrdinaryErrandRecord) => Promise<CloseInboxResult>;
}

/** Boundaries required to read the authoritative identity generation used by close dispatch. */
export interface ReadCloseIdentityRuntimeOptions {
  readonly slug: string;
  readonly identity: string;
  readonly exec: GitExec;
  readonly execInput: GitExecInput;
}

/** Authoritative identity read outcome for close dispatch. */
export type CloseIdentityRuntimeRead =
  | { kind: "ready"; record: TransientIdentityRecord | null }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

/**
 * Reconcile local and configured-remote identity state before selecting the close implementation.
 *
 * @param options - Identity coordinates and Git boundaries for the close command.
 * @returns The exact reconciled record, an identity conflict, or an operational failure.
 */
export async function readCloseIdentityAtRuntime(
  options: ReadCloseIdentityRuntimeOptions,
): Promise<CloseIdentityRuntimeRead> {
  const io = { exec: options.exec, execInput: options.execInput, identity: options.identity };
  return readReconciledCloseIdentity(io, options.slug, await configuredIdentityRemote(options.exec));
}

/** Run exact host, ref, inbox, and identity finalization against production boundaries. */
export async function closeOrdinaryErrandAtRuntime(
  options: CloseOrdinaryErrandRuntimeOptions,
): Promise<LocusMutationResultV1> {
  const io = { exec: options.exec, execInput: options.execInput, identity: options.identity };
  const lifecyclePort = createGhChangeRequestLifecyclePort(options.exec);
  const remote = await configuredIdentityRemote(options.exec);
  return closeOrdinaryErrand({
    slug: options.slug,
    protection: options.protection,
    force: options.force,
    dependencies: {
      readIdentity: async () => {
        return readReconciledCloseIdentity(io, options.slug, remote);
      },
      resolveTarget: (record) => resolveCloseChangeRequest(options, record),
      readOccupancy: (record) => readCloseOccupancy(options, record),
      readLifecycle: async (target) => {
        return lifecyclePort.read(target.changeRequest, target.changeRequest);
      },
      cleanupRefs: (target, guard) => cleanupOrdinaryErrandRefs(options.exec, target, guard),
      removeInbox: options.removeInbox,
      retire: async (target, lifecycle) => {
        const result = await transactTransientIdentities(io, {
          remote,
          message: `arc: finalize errand ${options.slug}`,
          transform: ordinaryErrandTransform({
            kind: "retire",
            previous: target.record,
            reason: "close",
            changeRequest: target.changeRequest,
            lifecycle,
          }),
        });
        if (result.kind === "applied" || result.kind === "idempotent") return { kind: result.kind };
        return result.kind === "refused"
          ? { kind: "refused", reason: result.reason }
          : { kind: "error", message: result.message };
      },
    },
  });
}

async function readReconciledCloseIdentity(
  io: { exec: GitExec; execInput: GitExecInput; identity: string },
  slug: string,
  remote: "origin" | null,
): Promise<CloseIdentityRuntimeRead> {
  const result = await transactTransientIdentities(io, {
    remote,
    message: `arc: reconcile errand identity ${slug}`,
    transform: (records) => ({ kind: "idempotent", value: records.get(slug) ?? null }),
  });
  if (result.kind === "applied" || result.kind === "idempotent") {
    return { kind: "ready", record: result.value };
  }
  return result.kind === "refused"
    ? { kind: "refused", reason: result.reason }
    : { kind: "error", message: result.message };
}

/**
 * Read what local occupancy permits for the exact Errand under close.
 *
 * The session anchor is required rather than best-effort: without it the reader cannot say which
 * occupancy is this session's own, and unprovable ownership is refused rather than assumed.
 */
async function readCloseOccupancy(
  options: CloseOrdinaryErrandRuntimeOptions,
  record: OrdinaryErrandRecord,
): Promise<CloseOccupancyResult> {
  const inspector = createPlatformProcessInspector();
  const anchor = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  if (anchor.kind !== "process") {
    return {
      kind: "refused",
      reason: "lease-unknown",
      message: `Errand close cannot establish a durable session anchor: ${anchor.reason}`,
    };
  }
  const pathFlavor = process.platform === "win32" ? "windows" : "posix";
  let state: LocusStateV1;
  let baseCheckoutProof: BaseCheckoutCloseProof | null = null;
  let currentCheckoutPath: string;
  try {
    currentCheckoutPath = (await options.exec("git", ["rev-parse", "--show-toplevel"])).stdout.trim();
    if (currentCheckoutPath === "") throw new Error("Git returned no current checkout path.");
    const [currentBranch, currentMarker] = await Promise.all([
      options.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: currentCheckoutPath }),
      readWorktreeMarker(currentCheckoutPath),
    ]);
    const currentBranchName = currentBranch.stdout.trim();
    state = await readLocusState({
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
      readPrimarySafety: (path) => readPrimarySafety({
        primaryPath: path,
        baseBranch: options.base,
        exec: options.exec,
      }),
    });
    const [confirmedBranch, confirmedMarker] = await Promise.all([
      options.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: currentCheckoutPath }),
      readWorktreeMarker(currentCheckoutPath),
    ]);
    const confirmedBranchName = confirmedBranch.stdout.trim();
    if (currentBranchName === options.base
      && confirmedBranchName === currentBranchName
      && currentBranchName !== record.branch
      && currentMarker.kind === "absent"
      && confirmedMarker.kind === "absent") {
      const checkoutIdentity = deriveLocusRecordId(currentCheckoutPath, pathFlavor);
      baseCheckoutProof = {
        recordId: checkoutIdentity.recordId,
        checkoutPath: checkoutIdentity.normalizedPath,
        identity: projectLocusIdentity(record),
      };
    }
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
  const verdict = classifyErrandCloseOccupancy({
    state,
    slug: record.slug,
    claimId: record.claimId,
    baseCheckoutProof,
  });
  if (verdict.kind !== "clear") return verdict;
  return {
    kind: "clear",
    guard: verdict.authority === "base-checkout"
      ? createBaseCheckoutCloseGuard(options, currentCheckoutPath)
      : null,
  };
}

function createBaseCheckoutCloseGuard(
  options: CloseOrdinaryErrandRuntimeOptions,
  checkoutPath: string,
): CloseAuthorityGuard {
  const revalidate: CloseAuthorityGuard["revalidate"] = async () => {
    try {
      const before = (await options.exec(
        "git",
        ["rev-parse", "--abbrev-ref", "HEAD"],
        { cwd: checkoutPath },
      )).stdout.trim();
      const marker = await readWorktreeMarker(checkoutPath);
      const after = (await options.exec(
        "git",
        ["rev-parse", "--abbrev-ref", "HEAD"],
        { cwd: checkoutPath },
      )).stdout.trim();
      if (before === options.base && after === before && marker.kind === "absent") {
        return { kind: "valid" };
      }
      return {
        kind: "refused",
        reason: "role-conflict",
        message: `Errand close lost base-checkout authority at '${checkoutPath}'; switch it to '${options.base}' and retry.`,
      };
    } catch (error) {
      return { kind: "error", message: error instanceof Error ? error.message : String(error) };
    }
  };
  return {
    revalidate,
    acquire: () => acquireBaseCheckoutCloseLease(options, checkoutPath, revalidate),
  };
}

async function acquireBaseCheckoutCloseLease(
  options: CloseOrdinaryErrandRuntimeOptions,
  checkoutPath: string,
  revalidate: CloseAuthorityGuard["revalidate"],
): Promise<CloseAuthorityLeaseResult> {
  let gitHeadPath: string;
  try {
    gitHeadPath = (await options.exec("git", ["rev-parse", "--git-path", "HEAD"], {
      cwd: checkoutPath,
    })).stdout.trim();
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
  if (gitHeadPath === "") return { kind: "error", message: "Git returned no checkout HEAD path." };
  const lockPath = `${isAbsolute(gitHeadPath) ? gitHeadPath : resolve(checkoutPath, gitHeadPath)}.lock`;
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return {
        kind: "refused",
        reason: "role-conflict",
        message: `Errand close cannot lock checkout HEAD at '${checkoutPath}'; wait for the other Git operation and retry.`,
      };
    }
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }

  let released = false;
  const release = async (): Promise<void> => {
    if (released) return;
    let closeError: unknown = null;
    try {
      await handle.close();
    } catch (error) {
      closeError = error;
    }
    let unlinkError: unknown = null;
    try {
      await unlink(lockPath);
    } catch (error) {
      unlinkError = error;
    }
    if (unlinkError !== null) {
      throw unlinkError instanceof Error ? unlinkError : new Error("Unknown checkout HEAD unlock failure");
    }
    released = true;
    if (closeError !== null) {
      throw closeError instanceof Error ? closeError : new Error("Unknown checkout HEAD handle-close failure");
    }
  };
  const authorization = await revalidate();
  if (authorization.kind === "valid") return { kind: "acquired", release };
  try {
    await release();
  } catch (error) {
    return {
      kind: "error",
      message: `Errand close could not release rejected checkout authority: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return authorization;
}

/**
 * Resolve the change request close finalizes against.
 *
 * An `awaiting-merge` record already carries exact coordinates. An `open` record merged in
 * place and carries none, so they are observed here against the exact local branch head.
 */
async function resolveCloseChangeRequest(
  options: CloseOrdinaryErrandRuntimeOptions,
  record: OrdinaryErrandRecord,
): Promise<CloseTargetResolution> {
  if (record.state === "awaiting-merge") {
    const configured = await resolveChangeRequestLifecycleConfiguration(options.exec, options.base);
    if (configured === null) {
      return {
        kind: "refused",
        reason: "change-request-unverifiable",
        message: "Origin repository coordinates are unsupported.",
      };
    }
    if (configured.repositoryRef !== record.changeRequest.repositoryRef
      || configured.hostRef !== record.changeRequest.hostRef
      || configured.baseRef !== record.changeRequest.baseRef) {
      return {
        kind: "refused",
        reason: "change-request-unverifiable",
        message: "Configured repository coordinates do not match the retained change request.",
      };
    }
    return { kind: "resolved", changeRequest: record.changeRequest };
  }
  const head = await resolveOptionalCommit(options.exec, `refs/heads/${record.branch}`);
  if (head.kind === "error") return { kind: "error", message: head.message };
  if (head.kind === "absent") {
    return {
      kind: "refused",
      reason: "preservation-unproven",
      message: "The Errand branch is absent locally, so its merged head cannot be proven.",
    };
  }
  const observed = await observeExactChangeRequest(
    options.exec,
    record.branch,
    options.base,
    head.oid,
    "merged",
  );
  return observed.kind === "observed"
    ? { kind: "resolved", changeRequest: observed.changeRequest }
    : { kind: "refused", reason: "change-request-unverifiable", message: observed.message };
}

async function configuredIdentityRemote(exec: GitExec): Promise<"origin" | null> {
  try {
    return (await exec("git", ["remote", "get-url", "origin"])).stdout.trim() === "" ? null : "origin";
  } catch {
    return null;
  }
}

/** Delete only local and remote refs still equal to the proven merged head. */
export async function cleanupOrdinaryErrandRefs(
  exec: GitExec,
  target: CloseTarget,
  guard: CloseAuthorityGuard | null = null,
): Promise<CloseRefCleanupResult> {
  const result = await tearDownExactBranchGeneration(exec, {
    branch: target.record.branch,
    expectedHead: target.changeRequest.headSha,
    subject: "Errand",
    temporaryRefNamespace: "refs/arc/tmp/errand-close",
    ...(guard === null ? {} : {
      authorizeDelete: async () => {
        const authorization = await guard.revalidate();
        if (authorization.kind === "valid") return { kind: "authorized" };
        return authorization.kind === "refused"
          ? { kind: "refused", message: authorization.message }
          : authorization;
      },
      authorizeLocalDelete: async () => {
        const roster = await scanRegisteredWorktrees(exec);
        if (!roster.ok) {
          return {
            kind: "refused" as const,
            message: `Local Errand branch occupancy cannot be proven: ${roster.message}`,
          };
        }
        const occupied = roster.worktrees.find((worktree) => worktree.branch === target.record.branch);
        return occupied === undefined
          ? { kind: "authorized" as const }
          : {
              kind: "refused" as const,
              message: `Local Errand branch is checked out by registered worktree '${occupied.path}'.`,
            };
      },
    }),
  });
  if (result.kind === "authorization-refused") {
    return { kind: "refused", reason: "role-conflict", message: result.message };
  }
  return result.kind === "refused"
    ? { kind: "refused", reason: "preservation-unproven", message: result.message }
    : result;
}
