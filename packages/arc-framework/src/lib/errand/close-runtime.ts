/** Production ports for exact ordinary-v3 Errand merge finalization. */

import { access, lstat, readFile, realpath } from "node:fs/promises";

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
  type CloseInboxResult,
  type CloseOccupancyResult,
  type CloseRefCleanupResult,
  type CloseTarget,
  type CloseTargetResolution,
} from "./close-locus.js";
import { settleOrdinaryErrandCloseLocusAtRuntime } from "./close-settlement-runtime.js";
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
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
  readonly exec: GitExec;
  readonly execInput: GitExecInput;
  readonly removeInbox: (record: OrdinaryErrandRecord, sessionHomePath: string | null) => Promise<CloseInboxResult>;
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
  // Spawned settlement removes the CLI process's original cwd. Once the roster establishes the
  // surviving primary, every unpinned Git operation must use it explicitly.
  let fallbackCwd: string | null = null;
  const exec: GitExec = (command, args, execOptions) => options.exec(command, args, {
    ...execOptions,
    ...(execOptions?.cwd === undefined && fallbackCwd !== null ? { cwd: fallbackCwd } : {}),
  });
  const execInput: GitExecInput = (args, input) => fallbackCwd === null
    ? options.execInput(args, input)
    : options.execInput(args, input, { cwd: fallbackCwd });
  const runtimeOptions = { ...options, exec };
  const io = { exec, execInput, identity: options.identity };
  const lifecyclePort = createGhChangeRequestLifecyclePort(exec);
  const remote = await configuredIdentityRemote(exec);
  return closeOrdinaryErrand({
    slug: options.slug,
    protection: options.protection,
    force: options.force,
    dependencies: {
      readIdentity: async () => {
        return readReconciledCloseIdentity(io, options.slug, remote);
      },
      resolveTarget: (record) => resolveCloseChangeRequest(runtimeOptions, record),
      readOccupancy: (target) => readCloseOccupancy(runtimeOptions, target, (path) => { fallbackCwd = path; }),
      readLifecycle: async (target) => {
        return lifecyclePort.read(target.changeRequest, target.changeRequest);
      },
      cleanupRefs: (target, guard) => cleanupOrdinaryErrandRefs(exec, target, guard),
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
  target: CloseTarget,
  setFallbackCwd: (path: string) => void,
): Promise<CloseOccupancyResult> {
  const record = target.record;
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
    setFallbackCwd(state.roster.primaryPath);
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
  const authority = verdict.authority;
  if (authority === "unclaimed") {
    return {
      kind: "clear",
      settle: () => Promise.resolve({
        kind: "idempotent",
        guard: null,
        recordId: null,
        sessionHomePath: null,
        restoredParent: null,
      }),
    };
  }
  const rows = state.roster.rows.filter((row) => row.role?.subject.kind === "errand"
    && row.role.subject.key === record.slug && row.role.subject.claimId === record.claimId);
  const row = rows.length === 1 ? rows[0] : undefined;
  if (row === undefined) {
    return { kind: "error", message: "Errand close lost its selected occupancy row." };
  }
  return {
    kind: "clear",
    settle: () => settleOrdinaryErrandCloseLocusAtRuntime({
      authority,
      target,
      state,
      row,
      currentCheckoutPath,
      base: options.base,
      identity: options.identity,
      postCreateScript: options.postCreateScript,
      registeredHarnessDirs: options.registeredHarnessDirs,
      anchor,
      inspector,
      pathFlavor,
      exec: options.exec,
    }),
  };
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
    ...(guard === null ? {} : {
      authorizeDelete: async () => {
        const authorization = await guard.revalidate();
        if (authorization.kind === "valid") return { kind: "authorized" };
        return authorization.kind === "refused"
          ? { kind: "refused", message: authorization.message }
          : authorization;
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
