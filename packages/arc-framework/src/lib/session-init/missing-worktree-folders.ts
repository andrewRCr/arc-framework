/** Corroborated missing-registration reports and guarded cleanup offers. */
import type { Store } from "../store/contract.js";
import { readStoreMissingFolderActions } from "./missing-worktree-store.js";
import { z } from "zod";
import { checkWorktreeRemoval, PROJECTION_LOCK_REASON, type RemovalCheck, type WorktreeRemovalOptions } from "../git/worktree-removal.js";
import type { DerivedCheckoutRow } from "../locus/derived-roster.js";
import { quoteShellArgument } from "../release/commit-message-retry.js";
import { branchToWorkUnitSlug } from "../work-unit/work-unit-slug.js";
import { SessionActionsSchema, workUnitTeardownAction, type SessionAction } from "./actions.js";

/** One missing folder, kept apart from marker-owned worktree cleanup. */
export const MissingWorktreeFolderSchema = z.strictObject({
  worktreePath: z.string(), branch: z.string().nullable(), outcome: z.enum(["missing", "locked"]), actions: SessionActionsSchema,
});
/** Corroborated missing checkout registration. */
export type MissingWorktreeFolder = z.infer<typeof MissingWorktreeFolderSchema>;

/**
 * Offer one registration repair with its missing-folder and lock-owner preconditions. Teardown unlocks the projection's
 * own lock, so a registration under it keeps the typed teardown; every other lock is named first, as Git refuses past it.
 * @param options - The registration's lock reason (absent when unlocked, null for a bare lock), and the work unit
 * whose teardown may remove it.
 */
export function missingRegistrationActions(
  checkoutPath: string,
  options: { lock: string | null | undefined; workUnitName?: string | null },
): SessionAction[] {
  const name = options.workUnitName;
  if ((options.lock === undefined || options.lock === PROJECTION_LOCK_REASON) && name != null) return [workUnitTeardownAction(name)];
  const path = quoteShellArgument(checkoutPath);
  const repair = name == null ? `git worktree remove ${path}` : workUnitTeardownAction(name).text;
  return [{ text: `After confirming the folder is still missing, ${unlockFirst(options.lock, path)}${repair}.` }];
}
/**
 * The lock a missing registration's remedy names: the check's own reading of another tool's lock, else the roster row's,
 * since the check answers `missing` under the projection's lock, which only the registration then names.
 */
export function missingRegistrationLock(check: RemovalCheck, row: DerivedCheckoutRow): string | null | undefined {
  return check.kind === "refused" && check.reason === "locked" ? check.lockReason : row.checkout.locked;
}
function unlockFirst(lock: string | null | undefined, path: string): string {
  if (lock === undefined) return "";
  return lock === PROJECTION_LOCK_REASON ? `git worktree unlock ${path}, then ` : `its lock's owner may run git worktree unlock ${path}, then `;
}

/** Read-only inputs for corroborating the reader's missing-folder observations. */
export interface MissingWorktreeFolderOptions extends Pick<WorktreeRemovalOptions, "exec" | "check" | "folderExists"> {
  store?: Store;
  projectId?: () => Promise<string>;
  warnings?: string[];
  rows: readonly DerivedCheckoutRow[];
  shipped: ReadonlySet<string>;
}

/** Report only absent, unmarked registrations whose removal check agrees with the roster. */
export async function readMissingWorktreeFolders(options: MissingWorktreeFolderOptions): Promise<MissingWorktreeFolder[]> {
  const rows = options.rows.filter((row) => !row.checkout.folderPresent && row.markerGeneration === null);
  const reports = await Promise.all(rows.map(async (row): Promise<MissingWorktreeFolder | null> => {
    const { path: worktreePath, branch } = row.checkout;
    const check = await checkWorktreeRemoval({ exec: options.exec, checkoutPath: worktreePath, disposition: "remove",
      check: options.check, folderExists: options.folderExists });
    const locked = check.kind === "refused" && check.reason === "locked" && !check.folderPresent;
    if (check.kind !== "missing" && !locked) return null;
    const lock = missingRegistrationLock(check, row);
    if (options.store?.capabilities.stateOffBranch) {
      const actions = await readStoreMissingFolderActions({ ...options, store: options.store }, row.checkout, lock);
      return actions === null ? null : { worktreePath, branch, outcome: locked ? "locked" : "missing", actions };
    }
    const slug = branch === null ? null : branchToWorkUnitSlug(branch);
    return { worktreePath, branch, outcome: locked ? "locked" : "missing",
      actions: missingRegistrationActions(worktreePath, { lock, workUnitName: slug !== null && options.shipped.has(slug) ? slug : null }) };
  }));
  return reports.filter((report): report is MissingWorktreeFolder => report !== null);
}
