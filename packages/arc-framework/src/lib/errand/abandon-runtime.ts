/** Identity, lifecycle, and derived-occupancy composition for ordinary Errand abandonment. */

import type { GitExec, GitExecInput } from "../git/exec.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import type { DerivedLocusFrame } from "../locus/derived-reader.js";
import {
  createGhChangeRequestLifecyclePort,
  resolveChangeRequestLifecycleConfiguration,
} from "./change-request-lifecycle.js";
import { abandonOrdinaryErrand, type AbandonStepResult } from "./abandon-locus.js";
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
  readonly clearExecuteBound: (record: OrdinaryErrandRecord) => Promise<AbandonStepResult>;
}

/** Abandon one exact ordinary identity and its marker-derived local occupancy. */
export async function abandonOrdinaryErrandAtRuntime(
  options: AbandonOrdinaryErrandRuntimeOptions,
): ReturnType<typeof abandonOrdinaryErrand> {
  const identityIO = { exec: options.exec, execInput: options.execInput, identity: options.identity };
  const remote = await configuredIdentityRemote(options.exec);
  const lifecyclePort = createGhChangeRequestLifecyclePort(options.exec);
  let preservedHead: string | null = null;
  let primaryCheckoutPath: string | null = null;
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
        const configured = await resolveChangeRequestLifecycleConfiguration(options.exec, options.base)
          ?? { repositoryRef: "", hostRef: "", baseRef: "" };
        return lifecyclePort.read(configured, record.changeRequest);
      },
      cleanupResidue: async (record) => {
        const preservation = await proveOrdinaryErrandAbandonmentPreservation(options.exec, options.base, record);
        if (preservation.kind !== "ready") return preservation;
        const frame = await options.readFrame();
        const primary = primaryPath(frame);
        if (primary === null) {
          return { kind: "refused", reason: "checkout-missing", message: "Primary checkout is unavailable." };
        }
        const settled = await cleanupOccupancy(options, record, frame, primary);
        if (settled.kind === "applied" || settled.kind === "idempotent") {
          preservedHead = preservation.head;
          primaryCheckoutPath = primary;
        }
        return settled;
      },
      clearExecuteBound: options.clearExecuteBound,
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
        options.exec, options.execInput, options.base, record, preservedHead, primaryCheckoutPath,
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

async function reapZeroDeltaBranch(
  exec: GitExec,
  execInput: GitExecInput,
  base: string,
  record: OrdinaryErrandRecord,
  expectedHead: string | null,
  primaryCheckoutPath: string | null,
): Promise<{ kind: "removed" | "preserved"; reason?: string }> {
  if (expectedHead === null || primaryCheckoutPath === null) {
    return { kind: "preserved", reason: "the branch generation was not retained for cleanup" };
  }
  const inPrimary: GitExec = (command, args, options) => exec(command, args, {
    ...options,
    cwd: options?.cwd ?? primaryCheckoutPath,
  });
  const baseHead = await resolveOptionalCommit(inPrimary, `refs/heads/${base}`);
  if (baseHead.kind !== "present") {
    return { kind: "preserved", reason: "the local base head could not be proven" };
  }
  try {
    await inPrimary("git", ["merge-base", "--is-ancestor", expectedHead, baseHead.oid]);
  } catch {
    return { kind: "preserved", reason: "the branch has content outside the local base" };
  }
  const lease = await acquireErrandCloseBranchDeletionHeadLocks({
    exec: inPrimary,
    identity: { slug: record.slug, claimId: record.claimId },
    branch: record.branch,
    guard: null,
  });
  if (lease.kind !== "acquired") return { kind: "preserved", reason: lease.message };
  try {
    const roster = await scanRegisteredWorktrees(inPrimary);
    if (!roster.ok) return { kind: "preserved", reason: roster.message };
    if (roster.worktrees.some((worktree) => worktree.branch === record.branch)) {
      return { kind: "preserved", reason: "the branch is checked out in a registered worktree" };
    }
    const head = await resolveOptionalCommit(inPrimary, `refs/heads/${record.branch}`);
    if (head.kind !== "present" || head.oid !== expectedHead) {
      return { kind: "preserved", reason: "the exact local branch head changed" };
    }
    if (roster.worktrees.some((worktree) => worktree.branch === base)) {
      // The acquired HEAD locks hold every checkout of base through deletion.
      const currentBase = await resolveOptionalCommit(inPrimary, `refs/heads/${base}`);
      if (currentBase.kind !== "present" || currentBase.oid !== baseHead.oid) {
        return { kind: "preserved", reason: "the local base head changed during cleanup" };
      }
      await inPrimary("git", ["update-ref", "-d", `refs/heads/${record.branch}`, expectedHead]);
    } else {
      await deleteAbandonedBranchAtExactBase(execInput, primaryCheckoutPath, {
        base, baseHead: baseHead.oid, branch: record.branch, branchHead: expectedHead,
      });
    }
    return { kind: "removed" };
  } catch (error) {
    return { kind: "preserved", reason: errorMessage(error) };
  } finally {
    await lease.release();
  }
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
