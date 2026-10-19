/** Marker- and topology-owned settlement for an authorized Errand checkout. */

import { resolve } from "node:path";
import { digestBytes } from "../kernel/index.js";
import { removeWorktreeCheckout, describeRemovalRefusal, type ProjectionRemovalSlots, type WorktreeRemovalResult } from "../git/worktree-removal.js";
import { parseGitWorktreePorcelainZ } from "../git/worktree-porcelain.js";
import type { GitExec } from "../git/exec.js";
import {
  readWorktreeMarkerGeneration,
  removePrimaryTransientOccupancy,
} from "../git/worktree-marker.js";

import type { ErrandTerminalAuthority, ErrandTerminalSubject } from "./terminal-authority.js";

import type { DerivedCheckoutRow } from "../locus/derived-roster.js";

type AuthorizedTerminal = Extract<ErrandTerminalAuthority, { kind: "authorized" }>;

export type TerminalOccupancySettlement =
  | {
      readonly kind: "applied" | "idempotent";
      readonly checkoutPath: string | null;
      readonly parentCheckoutPath: string | null;
    }
  | { readonly kind: "refused"; readonly reason: string; readonly message: string }
  | { readonly kind: "error"; readonly message: string };

export interface TerminalOccupancyInspection {
  readonly branch: string | null;
  readonly head: string;
  readonly dirty: boolean;
  readonly markerGeneration: string | null;
}

export interface TerminalOccupancyIO {
  inspect(checkoutPath: string, options?: { inspectStatus: boolean }): Promise<TerminalOccupancyInspection>;
  removePrimary(checkoutPath: string, subject: ErrandTerminalSubject): Promise<"removed" | "absent" | "changed">;
  removeSpawned(checkoutPath: string, primaryCheckoutPath: string, slots: ProjectionRemovalSlots | undefined,
    beforeRetire: () => Promise<void>): Promise<WorktreeRemovalResult | { kind: "absent" }>;
}

export interface SettleTerminalOccupancyOptions {
  readonly projectionRemovalSlots?: ProjectionRemovalSlots;
  readonly authority: AuthorizedTerminal;
  readonly primaryCheckoutPath: string;
  readonly io: TerminalOccupancyIO;
}

/** Build the production Git and marker boundaries for terminal occupancy settlement. */
export function createTerminalOccupancyIO(
  exec: GitExec,
  options: { readonly restorePrimaryTo?: string } = {},
): TerminalOccupancyIO {
  return {
    inspect: async (checkoutPath, inspectionOptions) => {
      const [branch, head, status, marker] = await Promise.all([
        exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: checkoutPath }),
        exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath }),
        inspectionOptions?.inspectStatus === false
          ? Promise.resolve({ stdout: "", stderr: "" })
          : exec("git", ["status", "--porcelain"], { cwd: checkoutPath }),
        readWorktreeMarkerGeneration(checkoutPath),
      ]);
      return {
        branch: branch.stdout.trim() === "HEAD" ? null : branch.stdout.trim(),
        head: head.stdout.trim(),
        dirty: status.stdout !== "",
        markerGeneration: marker.kind === "present" ? digestBytes(marker.bytes) : null,
      };
    },
    removePrimary: async (checkoutPath, subject) => {
      let previousBranch: string | null = null;
      if (options.restorePrimaryTo !== undefined) {
        previousBranch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: checkoutPath }))
          .stdout.trim();
        await exec("git", ["checkout", options.restorePrimaryTo], { cwd: checkoutPath });
      }
      const result = await removePrimaryTransientOccupancy(checkoutPath, subject);
      if (result.kind !== "removed" && result.kind !== "absent" && previousBranch !== null) {
        await exec("git", ["checkout", previousBranch], { cwd: checkoutPath }).catch(() => undefined);
      }
      return result.kind === "removed" || result.kind === "absent" ? result.kind : "changed";
    },
    removeSpawned: async (checkoutPath, primaryWorktreePath, slots, beforeRetire) => {
      const { stdout } = await exec("git", ["worktree", "list", "--porcelain", "-z"], { cwd: primaryWorktreePath });
      const present = parseGitWorktreePorcelainZ(stdout).some((entry) => resolve(entry.path) === resolve(checkoutPath));
      if (!present) return { kind: "absent" };
      return removeWorktreeCheckout({ exec, checkoutPath, primaryWorktreePath, slots, beforeRetire });
    },
  };
}

/** Revalidate and remove one exact authorized transient occupancy. */
export async function settleTerminalOccupancy(
  options: SettleTerminalOccupancyOptions,
): Promise<TerminalOccupancySettlement> {
  const row = options.authority.row;
  if (row === null) {
    return { kind: "idempotent", checkoutPath: null, parentCheckoutPath: null };
  }
  if (row.kind !== "transient"
    || options.authority.checkoutPath !== row.checkout.path
    || row.markerGeneration === null) {
    return refused("authority-unresolved", "The authorized Errand checkout evidence is incomplete.");
  }
  try {
    const refusal = await inspectOccupancy(options, row);
    if (refusal !== null) return refusal;
  } catch (error) {
    return { kind: "error", message: errorMessage(error) };
  }
  let removal: Awaited<ReturnType<typeof removeOccupancy>>;
  try {
    removal = await removeOccupancy(options, row);
  } catch (error) {
    return { kind: "error", message: errorMessage(error) };
  }
  if (removal.kind === "refused" || removal.kind === "error") return removal;
  return {
    kind: removal.kind === "removed" ? "applied" : "idempotent",
    checkoutPath: row.checkout.path,
    parentCheckoutPath: row.parentCheckoutPath,
  };
}

async function inspectOccupancy(options: SettleTerminalOccupancyOptions,
  row: DerivedCheckoutRow): Promise<Extract<TerminalOccupancySettlement, { kind: "refused" }> | null> {
  const inspection = await options.io.inspect(row.checkout.path, { inspectStatus: row.checkout.primary });
  if ((row.checkout.primary && inspection.dirty)
    || inspection.branch !== row.checkout.branch
    || inspection.head !== row.checkout.head) {
    return refused(
      "preservation-unproven",
      "The Errand checkout is dirty or its exact branch/HEAD generation changed. Preserve the checkout, inspect arc locus --json, then retry the Errand command.",
    );
  }
  if (inspection.markerGeneration !== row.markerGeneration) {
    return refused("generation-mismatch", "The Errand marker generation changed before settlement. Inspect arc locus --json, then retry against the current generation.");
  }
  return null;
}

async function removeOccupancy(
  options: SettleTerminalOccupancyOptions,
  row: DerivedCheckoutRow,
): Promise<{ kind: "removed" | "absent" } | Extract<TerminalOccupancySettlement, { kind: "refused" | "error" }>> {
  if (row.checkout.primary) {
    const result = await options.io.removePrimary(row.checkout.path, options.authority.subject);
    return result === "changed"
      ? refused("generation-mismatch", "The Errand checkout generation changed during settlement.")
      : { kind: result };
  }
  const revalidation: { refusal: Extract<TerminalOccupancySettlement, { kind: "refused" }> | null } = { refusal: null };
  const result = await options.io.removeSpawned(row.checkout.path, options.primaryCheckoutPath, options.projectionRemovalSlots, async () => {
    revalidation.refusal = await inspectOccupancy(options, row);
    if (revalidation.refusal !== null) throw new Error(revalidation.refusal.message);
  });
  if (revalidation.refusal !== null) return revalidation.refusal;
  switch (result.kind) {
    case "removed": case "pruned": return { kind: "removed" };
    case "absent": return result;
    case "refused": return refused(result.check.reason, describeRemovalRefusal(result.check));
    case "failed": return result.remedy === undefined
      ? { kind: "error", message: `Checkout removal failed at ${result.step}: ${result.detail}; repair the condition and retry.` }
      : refused("persist-would-refuse", result.remedy.text);
  }
}

function refused(reason: string, message: string): Extract<TerminalOccupancySettlement, { kind: "refused" }> {
  return { kind: "refused", reason, message };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
