/** Marker- and topology-owned settlement for an authorized Errand checkout. */

import { digestBytes } from "../kernel/index.js";
import type { GitExec } from "../git/exec.js";
import {
  readWorktreeMarkerGeneration,
  removePrimaryTransientOccupancy,
} from "../git/worktree-marker.js";

import type { ErrandTerminalAuthority, ErrandTerminalSubject } from "./terminal-authority.js";

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
  inspect(checkoutPath: string): Promise<TerminalOccupancyInspection>;
  removePrimary(checkoutPath: string, subject: ErrandTerminalSubject): Promise<"removed" | "absent" | "changed">;
  removeSpawned(checkoutPath: string, primaryCheckoutPath: string): Promise<"removed" | "absent" | "changed">;
}

export interface SettleTerminalOccupancyOptions {
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
    inspect: async (checkoutPath) => {
      const [branch, head, status, marker] = await Promise.all([
        exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: checkoutPath }),
        exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath }),
        exec("git", ["status", "--porcelain"], { cwd: checkoutPath }),
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
    removeSpawned: async (checkoutPath, primaryCheckoutPath) => {
      try {
        await exec("git", ["worktree", "remove", checkoutPath], { cwd: primaryCheckoutPath });
        return "removed";
      } catch {
        const roster = await exec("git", ["worktree", "list", "--porcelain"], { cwd: primaryCheckoutPath });
        return roster.stdout.includes(`worktree ${checkoutPath}\n`) ? "changed" : "absent";
      }
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
  let inspection: TerminalOccupancyInspection;
  try {
    inspection = await options.io.inspect(row.checkout.path);
  } catch (error) {
    return { kind: "error", message: errorMessage(error) };
  }
  if (inspection.dirty
    || inspection.branch !== row.checkout.branch
    || inspection.head !== row.checkout.head) {
    return refused(
      "preservation-unproven",
      "The Errand checkout is dirty or its exact branch/HEAD generation changed.",
    );
  }
  if (inspection.markerGeneration !== row.markerGeneration) {
    return refused("generation-mismatch", "The Errand marker generation changed before settlement.");
  }
  let removed: "removed" | "absent" | "changed";
  try {
    removed = row.checkout.primary
      ? await options.io.removePrimary(row.checkout.path, options.authority.subject)
      : await options.io.removeSpawned(row.checkout.path, options.primaryCheckoutPath);
  } catch (error) {
    return { kind: "error", message: errorMessage(error) };
  }
  if (removed === "changed") {
    return refused("generation-mismatch", "The Errand checkout generation changed during settlement.");
  }
  return {
    kind: removed === "removed" ? "applied" : "idempotent",
    checkoutPath: row.checkout.path,
    parentCheckoutPath: row.parentCheckoutPath,
  };
}

function refused(reason: string, message: string): TerminalOccupancySettlement {
  return { kind: "refused", reason, message };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
