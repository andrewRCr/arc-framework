/** Production ports for exact ordinary-v3 Errand completion. */

import type { GitExec, GitExecInput } from "../git/exec.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import type { DerivedLocusFrame } from "../locus/derived-reader.js";
import {
  createGhChangeRequestLifecyclePort,
  observeExactChangeRequest,
  resolveChangeRequestLifecycleConfiguration,
} from "./change-request-lifecycle.js";
import {
  resolveOptionalCommit,
  tearDownExactBranchGeneration,
  type ExactBranchTeardownLockResult,
} from "./exact-branch-generation.js";
import { pinRemoteBaseHead } from "./identity-claims.js";
import {
  acquireErrandCloseBranchDeletionHeadLocks,
  recoverFinalizedErrandCloseHeadLock,
} from "./close-head-lock.js";
import {
  closeOrdinaryErrand,
  type CloseAuthorityGuard,
  type CloseInboxResult,
  type CloseLocusSettlementResult,
  type CloseOccupancyResult,
  type CloseOrdinaryErrandDependencies,
  type CloseRefCleanupResult,
  type CloseTarget,
  type CloseTargetResolution,
} from "./close-locus.js";
import { ordinaryErrandTransform, type OrdinaryErrandRecord } from "./identity-transitions.js";
import { transactTransientIdentities } from "./identity-transaction.js";
import { authorizeErrandTerminal } from "./terminal-authority.js";
import { createTerminalOccupancyIO, settleTerminalOccupancy } from "./terminal-occupancy.js";
import type { TransientIdentityRecord } from "./identity-record.js";

export interface CloseOrdinaryErrandRuntimeOptions {
  readonly slug: string;
  readonly base: string;
  readonly protection: "full" | "partial";
  readonly identity: string;
  readonly exec: GitExec;
  readonly execInput: GitExecInput;
  readonly readFrame: () => Promise<DerivedLocusFrame>;
  readonly confirmForeignGeneration?: string;
  readonly onAuthority?: (authority: ReturnType<typeof authorizeErrandTerminal>) => void;
  readonly removeInbox: (record: OrdinaryErrandRecord, parentCheckoutPath: string | null) => Promise<CloseInboxResult>;
}

/** Authoritative identity read outcome for close dispatch. */
type CloseIdentityRuntimeRead =
  | { kind: "ready"; record: TransientIdentityRecord | null }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

/** Finalize an ordinary Errand from identity, completion evidence, and derived checkout authority. */
export async function closeOrdinaryErrandAtRuntime(
  options: CloseOrdinaryErrandRuntimeOptions,
): ReturnType<typeof closeOrdinaryErrand> {
  let fallbackCwd: string | null = null;
  const exec: GitExec = (command, args, execOptions) => options.exec(command, args, {
    ...execOptions,
    ...(execOptions?.cwd === undefined && fallbackCwd !== null ? { cwd: fallbackCwd } : {}),
  });
  const execInput: GitExecInput = (args, input, execOptions) => options.execInput(args, input, {
    ...execOptions,
    ...(execOptions?.cwd === undefined && fallbackCwd !== null ? { cwd: fallbackCwd } : {}),
  });
  const runtimeOptions = { ...options, exec };
  const identityIO = { exec, execInput, identity: options.identity };
  const lifecyclePort = createGhChangeRequestLifecyclePort(exec);
  const remote = await configuredIdentityRemote(exec);
  const dependencies: CloseOrdinaryErrandDependencies = {
    readIdentity: () => readReconciledCloseIdentity(identityIO, options.slug, remote),
    resolveTarget: (record) => resolveCloseChangeRequest(runtimeOptions, record),
    readLifecycle: (target) => target.kind === "merged"
      ? lifecyclePort.read(target.changeRequest, target.changeRequest)
      : Promise.reject(new Error("An unchanged-base close has no change request lifecycle.")),
    readOccupancy: (target) => readCloseOccupancy(runtimeOptions, target, (path) => { fallbackCwd = path; }),
    cleanupRefs: (target, guard) => cleanupOrdinaryErrandRefs(
      exec,
      target,
      guard,
      guard === null ? undefined : () => Promise.resolve({
        kind: "acquired",
        release: () => Promise.resolve(),
      }),
    ),
    removeInbox: options.removeInbox,
    retire: async (target, lifecycle) => {
      let transform: ReturnType<typeof ordinaryErrandTransform>;
      if (target.kind === "unchanged-base") {
        transform = ordinaryErrandTransform({
          kind: "retire",
          previous: target.record,
          reason: "close",
          authorization: "unchanged-base",
        });
      } else {
        if (lifecycle === null) {
          return { kind: "error", message: "Merged Errand close is missing lifecycle evidence." };
        }
        transform = ordinaryErrandTransform({
          kind: "retire",
          previous: target.record,
          reason: "close",
          changeRequest: target.changeRequest,
          lifecycle,
        });
      }
      const result = await transactTransientIdentities(identityIO, {
        remote,
        message: `arc: finalize errand ${options.slug}`,
        transform,
      });
      if (result.kind === "applied" || result.kind === "idempotent") return { kind: result.kind };
      return result.kind === "refused"
        ? { kind: "refused", reason: result.reason }
        : { kind: "error", message: result.message };
    },
  };
  return closeOrdinaryErrand({
    slug: options.slug,
    protection: options.protection,
    dependencies,
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
    if (result.value === null) {
      const recovery = await recoverFinalizedErrandCloseHeadLock({
        exec: io.exec,
        slug,
      });
      if (recovery.kind === "blocked") return { kind: "refused", reason: recovery.message };
      if (recovery.kind === "error") return recovery;
    }
    return { kind: "ready", record: result.value };
  }
  return result.kind === "refused"
    ? { kind: "refused", reason: result.reason }
    : { kind: "error", message: result.message };
}

async function readCloseOccupancy(
  options: CloseOrdinaryErrandRuntimeOptions,
  target: CloseTarget,
  setFallbackCwd: (path: string) => void,
): Promise<CloseOccupancyResult> {
  const frame = await options.readFrame();
  const authority = authorizeErrandTerminal({
    frame,
    operation: "close",
    subject: { kind: "errand", slug: target.record.slug, claimId: target.record.claimId },
    confirmForeignGeneration: options.confirmForeignGeneration,
  });
  options.onAuthority?.(authority);
  if (authority.kind === "confirmation-required") {
    return { kind: "refused", reason: "role-conflict", message: authority.recommendedPromptText };
  }
  if (authority.kind === "refused") {
    return { kind: "refused", reason: "identity-conflict", message: authority.message };
  }
  if (authority.row !== null
    && (authority.row.checkout.branch !== target.record.branch
      || authority.row.checkout.head !== closeTargetHead(target))) {
    return { kind: "refused", reason: "preservation-unproven", message: "Errand branch or HEAD generation changed." };
  }
  const primaryCheckoutPath = primaryPath(frame);
  if (primaryCheckoutPath === null) {
    return { kind: "refused", reason: "checkout-missing", message: "Primary checkout is unavailable." };
  }
  return {
    kind: "clear",
    settle: async (): Promise<CloseLocusSettlementResult> => {
      const settled = await settleTerminalOccupancy({
        authority,
        primaryCheckoutPath,
        io: createTerminalOccupancyIO(options.exec, { restorePrimaryTo: options.base }),
      });
      setFallbackCwd(primaryCheckoutPath);
      if (settled.kind === "refused") {
        return { kind: "refused", reason: "preservation-unproven", message: settled.message };
      }
      if (settled.kind === "error") return settled;
      return {
        kind: settled.kind,
        guard: createPostSettlementCloseGuard(options.exec, target, primaryCheckoutPath),
        parentCheckoutPath: settled.parentCheckoutPath,
      };
    },
  };
}

/** Resolve exact merged-change-request or unchanged-base completion evidence. */
async function resolveCloseChangeRequest(
  options: CloseOrdinaryErrandRuntimeOptions,
  record: OrdinaryErrandRecord,
): Promise<CloseTargetResolution> {
  if (record.state === "awaiting-merge") {
    const configured = await resolveChangeRequestLifecycleConfiguration(options.exec, options.base);
    if (configured === null) {
      return { kind: "refused", reason: "change-request-unverifiable", message: "Origin repository coordinates are unsupported." };
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
  const localBase = await resolveOptionalCommit(options.exec, `refs/heads/${options.base}`);
  if (localBase.kind === "present" && localBase.oid === head.oid) {
    const remoteBase = await pinRemoteBaseHead(options.exec, { remote: "origin", baseRef: options.base });
    if (remoteBase.kind === "pinned" && remoteBase.head === head.oid) {
      return { kind: "unchanged-base", headSha: head.oid };
    }
  }
  const observed = await observeExactChangeRequest(options.exec, record.branch, options.base, head.oid, "merged");
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
  acquireLocalDelete: () => Promise<ExactBranchTeardownLockResult> = () =>
    acquireErrandCloseBranchDeletionHeadLocks({
      exec,
      identity: { slug: target.record.slug, claimId: target.record.claimId },
      branch: target.record.branch,
      guard,
    }),
): Promise<CloseRefCleanupResult> {
  const result = await tearDownExactBranchGeneration(exec, {
    branch: target.record.branch,
    expectedHead: closeTargetHead(target),
    subject: "Errand",
    temporaryRefNamespace: "refs/arc/tmp/errand-close",
    authorizeLocalDelete: async () => {
      const roster = await scanRegisteredWorktrees(exec);
      if (!roster.ok) {
        return { kind: "refused" as const, message: `Local Errand branch occupancy cannot be proven: ${roster.message}` };
      }
      const occupied = roster.worktrees.find((worktree) => worktree.branch === target.record.branch);
      return occupied === undefined
        ? { kind: "authorized" as const }
        : { kind: "refused" as const, message: `Local Errand branch is checked out by registered worktree '${occupied.path}'.` };
    },
    acquireLocalDelete,
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

function closeTargetHead(target: CloseTarget): string {
  return target.kind === "merged" ? target.changeRequest.headSha : target.headSha;
}

function primaryPath(frame: DerivedLocusFrame): string | null {
  return frame.roster.find((row) => row.checkout.primary)?.checkout.path ?? null;
}

function createPostSettlementCloseGuard(
  exec: GitExec,
  target: CloseTarget,
  checkoutPath: string,
): CloseAuthorityGuard {
  const revalidate: CloseAuthorityGuard["revalidate"] = async () => {
    const roster = await scanRegisteredWorktrees(exec);
    if (!roster.ok) return { kind: "error", message: roster.message };
    const occupied = roster.worktrees.find((worktree) => worktree.branch === target.record.branch);
    return occupied === undefined
      ? { kind: "valid" }
      : {
          kind: "refused",
          reason: "role-conflict",
          message: `Local Errand branch is checked out by registered worktree '${occupied.path}'.`,
        };
  };
  return {
    checkoutPath,
    revalidate,
    acquire: async () => {
      const acquired = await acquireErrandCloseBranchDeletionHeadLocks({
        exec,
        identity: { slug: target.record.slug, claimId: target.record.claimId },
        branch: target.record.branch,
        guard: null,
      });
      return acquired.kind === "refused"
        ? { kind: "refused", reason: "role-conflict", message: acquired.message }
        : acquired;
    },
  };
}
