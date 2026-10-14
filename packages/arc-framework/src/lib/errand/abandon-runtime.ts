/** Identity, lifecycle, and derived-occupancy composition for ordinary Errand abandonment. */

import type { GitExec, GitExecInput } from "../git/exec.js";
import { normalizeGitRejection } from "../git/process-error.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import type { DerivedLocusFrame } from "../locus/derived-reader.js";
import {
  createGhChangeRequestLifecyclePort,
  resolveChangeRequestLifecycleConfiguration,
} from "./change-request-lifecycle.js";
import {
  abandonOrdinaryErrand,
  type AbandonBranchCleanupResult,
  type AbandonStepResult,
} from "./abandon-locus.js";
import {
  ordinaryErrandTransform,
  provePauseHead,
  type OrdinaryErrandRecord,
} from "./identity-transitions.js";
import { transactTransientIdentities } from "./identity-transaction.js";
import { authorizeErrandTerminal } from "./terminal-authority.js";
import { createTerminalOccupancyIO, settleTerminalOccupancy } from "./terminal-occupancy.js";
import { acquireErrandCloseBranchDeletionHeadLocks } from "./close-head-lock.js";
import { resolveOptionalCommit } from "./exact-branch-generation.js";

export interface AbandonOrdinaryErrandRuntimeOptions {
  readonly slug: string;
  readonly protection: "full";
  readonly base: string;
  readonly identity: string;
  readonly exec: GitExec;
  readonly execInput: GitExecInput;
  readonly readFrame: () => Promise<DerivedLocusFrame>;
  readonly confirmForeignGeneration?: string;
  readonly onAuthority?: (authority: ReturnType<typeof authorizeErrandTerminal>) => void;
  readonly clearExecuteBound: (
    record: OrdinaryErrandRecord,
    settlementCheckoutPath: string,
  ) => Promise<AbandonStepResult>;
}

/** Abandon one exact ordinary identity and its marker-derived local occupancy. */
export async function abandonOrdinaryErrandAtRuntime(
  options: AbandonOrdinaryErrandRuntimeOptions,
): ReturnType<typeof abandonOrdinaryErrand> {
  let primaryCheckoutPath: string | null = null;
  const exec: GitExec = (command, args, execOptions) => options.exec(command, args, {
    ...execOptions,
    ...(execOptions?.cwd === undefined && primaryCheckoutPath !== null ? { cwd: primaryCheckoutPath } : {}),
  });
  const execInput: GitExecInput = (args, input, execOptions) => options.execInput(args, input, {
    ...execOptions,
    ...(execOptions?.cwd === undefined && primaryCheckoutPath !== null ? { cwd: primaryCheckoutPath } : {}),
  });
  const identityIO = { exec, execInput, identity: options.identity };
  const remote = await configuredIdentityRemote(exec);
  const lifecyclePort = createGhChangeRequestLifecyclePort(exec);
  let preservedHead: string | null = null;
  return abandonOrdinaryErrand({
    slug: options.slug,
    protection: options.protection,
    dependencies: {
      readIdentity: async () => {
        const result = await transactTransientIdentities(identityIO, {
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
        const configured = await resolveChangeRequestLifecycleConfiguration(exec, options.base)
          ?? { repositoryRef: "", hostRef: "", baseRef: "" };
        return lifecyclePort.read(configured, record.changeRequest);
      },
      cleanupResidue: async (record) => {
        const preservation = await proveOrdinaryErrandAbandonmentPreservation(exec, options.base, record);
        if (preservation.kind !== "ready") return preservation;
        const frame = await options.readFrame();
        const primary = primaryPath(frame);
        if (primary === null) {
          return { kind: "refused", reason: "checkout-missing", message: "Primary checkout is unavailable." };
        }
        const settled = await cleanupOccupancy({ ...options, exec, execInput }, record, frame, primary);
        if (settled.kind === "applied" || settled.kind === "idempotent") {
          preservedHead = preservation.head;
          primaryCheckoutPath = primary;
        }
        return settled;
      },
      clearExecuteBound: async (record) => {
        if (primaryCheckoutPath === null) return { kind: "error", message: "Settlement checkout is unavailable." };
        return options.clearExecuteBound(record, primaryCheckoutPath);
      },
      retire: async (record, lifecycle) => {
        const result = await transactTransientIdentities(identityIO, {
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
      reapZeroDeltaBranch: (record) => reapZeroDeltaBranch(
        exec, execInput, options.base, record, preservedHead, primaryCheckoutPath,
      ),
    },
  });
}

async function cleanupOccupancy(
  options: AbandonOrdinaryErrandRuntimeOptions,
  record: OrdinaryErrandRecord,
  frame: DerivedLocusFrame,
  primaryCheckoutPath: string,
): Promise<AbandonStepResult> {
  const authority = authorizeErrandTerminal({
    frame,
    operation: "abandon",
    subject: { kind: "errand", slug: record.slug, claimId: record.claimId },
    confirmForeignGeneration: options.confirmForeignGeneration,
  });
  options.onAuthority?.(authority);
  if (authority.kind === "confirmation-required") {
    return { kind: "refused", reason: "role-conflict", message: authority.recommendedPromptText };
  }
  if (authority.kind === "refused") {
    return { kind: "refused", reason: "identity-conflict", message: authority.message };
  }
  if (authority.row !== null && authority.row.checkout.branch !== record.branch) {
    return { kind: "refused", reason: "preservation-unproven", message: "Errand branch generation changed." };
  }
  const expectedHead = terminalHead(record);
  if (expectedHead !== null && authority.row !== null && authority.row.checkout.head !== expectedHead) {
    return { kind: "refused", reason: "preservation-unproven", message: "Errand head generation changed." };
  }
  const settled = await settleTerminalOccupancy({
    authority,
    primaryCheckoutPath,
    io: createTerminalOccupancyIO(options.exec, { restorePrimaryTo: options.base }),
  });
  if (settled.kind === "refused") {
    return { kind: "refused", reason: "preservation-unproven", message: settled.message };
  }
  return settled.kind === "error" ? settled : { kind: settled.kind };
}

/** Work-unit ref set using its own mutex, exact heads, and retiring-head preservation container. */
export interface WorkItemZeroDeltaBranch {
  branch: string;
  localHead: string | null;
  remoteTrackingHead: string | null;
  containers: readonly { ref: string; oid: string }[];
  retiringHead: string | null;
  withWorkItemLock: (operation: () => Promise<AbandonBranchCleanupResult>) => Promise<AbandonBranchCleanupResult>;
}

export async function reapZeroDeltaBranch(
  exec: GitExec,
  execInput: GitExecInput,
  base: string,
  record: OrdinaryErrandRecord | WorkItemZeroDeltaBranch,
  expectedHead: string | null,
  primaryCheckoutPath: string | null,
): Promise<AbandonBranchCleanupResult> {
  if (expectedHead === null || primaryCheckoutPath === null) {
    return { kind: "preserved", reason: "the branch generation was not retained for cleanup" };
  }
  const inPrimary: GitExec = (command, args, options) => exec(command, args, {
    ...options,
    cwd: options?.cwd ?? primaryCheckoutPath,
  });
  const workItem = "withWorkItemLock" in record ? record : null;
  const baseHead = await zeroDeltaBase(inPrimary, base, workItem);
  if (baseHead.kind === "error") return { kind: "preserved", reason: baseHead.message };
  if (baseHead.kind === "absent") return { kind: "preserved", reason: "the local base head could not be proven" };
  const preservation = await proveZeroDelta(inPrimary, workItem, expectedHead, baseHead.oid);
  if (preservation !== undefined) return preservation;
  const action = async (): Promise<AbandonBranchCleanupResult> => {
    const roster = await scanRegisteredWorktrees(inPrimary);
    if (!roster.ok) return { kind: "preserved", reason: roster.message };
    if (roster.worktrees.some((worktree) => worktree.branch === record.branch)) return { kind: "preserved", reason: "the branch is checked out in a registered worktree" };
    const head = await resolveOptionalCommit(inPrimary, `refs/heads/${record.branch}`);
    if (head.kind === "error") return { kind: "preserved", reason: head.message };
    if (workItem !== null) {
      const actual = head.kind === "present" ? head.oid : null;
      if (actual !== workItem.localHead) throw new Error("The exact local branch head changed; retry teardown.");
      await deleteWorkItemZeroDeltaRefs(execInput, primaryCheckoutPath, workItem);
    } else {
      const removed = await deleteErrandZeroDeltaLocal(inPrimary, execInput, primaryCheckoutPath, base, record.branch, expectedHead, baseHead.oid, roster.worktrees, head);
      if (removed !== undefined) return removed;
    }
    return { kind: "removed" };
  };
  if (workItem !== null) return workItem.withWorkItemLock(action);
  if (!("claimId" in record)) return { kind: "preserved", reason: "the Errand claim is unavailable" };
  const lease = await acquireErrandCloseBranchDeletionHeadLocks({ exec: inPrimary, identity: { slug: record.slug, claimId: record.claimId }, branch: record.branch, guard: null });
  if (lease.kind !== "acquired") return { kind: "preserved", reason: lease.message };
  return settleAbandonBranchLease(action, () => lease.release());
}

async function deleteWorkItemZeroDeltaRefs(execInput: GitExecInput, cwd: string, record: WorkItemZeroDeltaBranch): Promise<void> {
  const lines = ["start", ...record.containers.map((container) => `verify ${container.ref} ${container.oid}`),
    ...(record.localHead === null ? [] : [`delete refs/heads/${record.branch} ${record.localHead}`]),
    ...(record.remoteTrackingHead === null ? [] : [`delete refs/remotes/origin/${record.branch} ${record.remoteTrackingHead}`]), "prepare", "commit", ""];
  if ([record.branch, ...record.containers.map((container) => container.ref)].some((ref) => /[\0\r\n]/u.test(ref))) throw new Error("Invalid work-item ref transaction operand");
  await execInput(["update-ref", "--stdin"], lines.join("\n"), { cwd });
}

/** Retain the branch result even when releasing its checkout locks fails afterward. */
export async function settleAbandonBranchLease(
  action: () => Promise<AbandonBranchCleanupResult>,
  release: () => Promise<void>,
): Promise<AbandonBranchCleanupResult> {
  let result: AbandonBranchCleanupResult;
  try {
    result = await action();
  } catch (error) {
    result = { kind: "preserved", reason: errorMessage(error) };
  }
  try {
    await release();
  } catch (error) {
    return { ...result, releaseError: errorMessage(error) };
  }
  return result;
}

/** Atomically verify an unoccupied base ref while deleting the exact local Errand branch. */
export async function deleteAbandonedBranchAtExactBase(
  execInput: GitExecInput,
  cwd: string,
  refs: { base: string; baseHead: string; branch: string; branchHead: string },
): Promise<void> {
  if ([refs.base, refs.branch].some((ref) => ref.includes("\0") || ref.includes("\n") || ref.includes("\r"))
    || [refs.baseHead, refs.branchHead].some((oid) => !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(oid))) {
    throw new Error("Invalid exact ref transaction operand.");
  }
  const commands = [
    "start",
    `verify refs/heads/${refs.base} ${refs.baseHead}`,
    `delete refs/heads/${refs.branch} ${refs.branchHead}`,
    "prepare",
    "commit",
    "",
  ].join("\n");
  await execInput(["update-ref", "--stdin"], commands, { cwd });
}

function terminalHead(record: OrdinaryErrandRecord): string | null {
  if (record.state === "paused") return record.savedHead;
  if (record.state === "awaiting-merge") return record.changeRequest.headSha;
  return null;
}

function primaryPath(frame: DerivedLocusFrame): string | null {
  return frame.roster.find((row) => row.checkout.primary)?.checkout.path ?? null;
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
  const recorded = terminalHead(record) ?? head;
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

async function zeroDeltaBase(exec: GitExec, base: string, workItem: WorkItemZeroDeltaBranch | null): Promise<Awaited<ReturnType<typeof resolveOptionalCommit>>> {
  if (workItem === null) return resolveOptionalCommit(exec, `refs/heads/${base}`);
  const container = workItem.containers[0];
  return container === undefined ? { kind: "absent" } : { kind: "present", oid: container.oid };
}

async function deleteErrandZeroDeltaLocal(exec: GitExec, execInput: GitExecInput, cwd: string, base: string, branch: string,
  expectedHead: string, baseOid: string, worktrees: readonly import("../git/worktree-roster.js").RegisteredWorktree[],
  head: Awaited<ReturnType<typeof resolveOptionalCommit>>): Promise<AbandonBranchCleanupResult | undefined> {
      if (head.kind !== "present" || head.oid !== expectedHead) return { kind: "preserved", reason: "the exact local branch head changed" };
      if (worktrees.some((worktree) => worktree.branch === base)) {
        const currentBase = await resolveOptionalCommit(exec, `refs/heads/${base}`);
        if (currentBase.kind === "error") return { kind: "preserved", reason: currentBase.message };
        if (currentBase.kind !== "present" || currentBase.oid !== baseOid) return { kind: "preserved", reason: "the local base head changed during cleanup" };
        await exec("git", ["update-ref", "-d", `refs/heads/${branch}`, expectedHead]);
      } else await deleteAbandonedBranchAtExactBase(execInput, cwd, { base, baseHead: baseOid, branch: branch, branchHead: expectedHead });
}

async function proveZeroDelta(exec: GitExec, workItem: WorkItemZeroDeltaBranch | null, expectedHead: string, baseOid: string): Promise<AbandonBranchCleanupResult | undefined> {
  const args = workItem === null ? ["merge-base", "--is-ancestor", expectedHead, baseOid]
    : ["rev-list", expectedHead, ...(workItem.remoteTrackingHead === null ? [] : [workItem.remoteTrackingHead]), "--not",
      ...workItem.containers.map((container) => container.oid), ...(workItem.retiringHead === null ? [] : [workItem.retiringHead])];
  try {
    const proof = await exec("git", args);
    if (workItem !== null && proof.stdout.trim() !== "") return { kind: "preserved", reason: "the ref carries work beyond base and the retiring branch" };
  } catch (error) {
    const failure = normalizeGitRejection(error, { command: "git", args });
    if (workItem !== null) throw error;
    return { kind: "preserved", reason: failure.exitCode === 1 ? "the branch has content outside the local base" : failure.message };
  }
}
