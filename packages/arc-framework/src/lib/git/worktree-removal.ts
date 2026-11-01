/** Read-only removal authorization and projection-aware checkout retirement. */
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { Remedy } from "../store/refusal.js";
import type { GitExec } from "./exec.js";
import { readWorktreeMarker, type WorktreeMarkerReadResult } from "./worktree-marker.js";
import { decodeGitQuotedText, parseGitWorktreePorcelainZ } from "./worktree-porcelain.js";

/**
 * The exact lock reason the projection owns, as distinct from a lock anyone else sets. Git prints it in its refusal of a
 * plain removal, so it names the exits that remove such a checkout.
 */
export const PROJECTION_LOCK_REASON = "arc: remove with 'arc teardown' (work unit) or 'arc errand close|abandon|leave' (Errand)";
/** Projection hooks; dormant until the projection binds them. */
export interface ProjectionRemovalSlots {
  check: (checkout: string) => Promise<{ kind: "passes" } | { kind: "would-refuse"; remedy: Remedy } | { kind: "unobservable"; detail: string }>;
  persist: (checkout: string) => Promise<{ kind: "persisted" } | { kind: "refused"; remedy: Remedy }>;
  release: (checkout: string, isPrimary: boolean) => Promise<{ kind: "released" } | { kind: "refused"; remedy: Remedy }>;
}
/** Default hooks preserve behavior before projection installation. */
export const passingProjectionRemovalSlots: ProjectionRemovalSlots = {
  check: () => Promise.resolve({ kind: "passes" }),
  persist: () => Promise.resolve({ kind: "persisted" }),
  release: () => Promise.resolve({ kind: "released" }),
};
/** Removal eligibility, preserving uncertainty and operator lock ownership. */
export type RemovalCheck =
  | { kind: "removable" } | { kind: "missing" }
  | { kind: "refused"; reason: "dirty"; paths: readonly string[] }
  | { kind: "refused"; reason: "unobservable"; detail: string }
  | { kind: "refused"; reason: "locked"; path: string; lockReason: string | null; folderPresent: boolean }
  | { kind: "refused"; reason: "persist-would-refuse"; remedy: Remedy };
/** Git and folder boundaries for a removal decision. */
export interface WorktreeRemovalOptions {
  exec: GitExec;
  checkoutPath: string;
  disposition: "remove" | "release";
  check?: ProjectionRemovalSlots["check"];
  folderExists?: (path: string) => Promise<boolean>;
}
/** Check without mutation or locking. */
export async function checkWorktreeRemoval(options: WorktreeRemovalOptions): Promise<RemovalCheck> {
  try {
    if (options.disposition === "remove") {
      const present = await (options.folderExists ?? folderExists)(options.checkoutPath);
      const registration = await readRegistration(options.exec, options.checkoutPath);
      if (registration?.locked !== undefined && registration.locked !== PROJECTION_LOCK_REASON) {
        return { kind: "refused", reason: "locked", path: options.checkoutPath, lockReason: registration.locked, folderPresent: present };
      }
      if (!present) return { kind: "missing" };
      const { stdout } = await options.exec("git", ["status", "--porcelain"], { cwd: options.checkoutPath, preserveOutput: true });
      const paths = statusPaths(stdout);
      if (paths.length !== 0) return { kind: "refused", reason: "dirty", paths };
    }
    const projection = await (options.check ?? passingProjectionRemovalSlots.check)(options.checkoutPath);
    if (projection.kind === "would-refuse") return { kind: "refused", reason: "persist-would-refuse", remedy: projection.remedy };
    if (projection.kind === "unobservable") return { kind: "refused", reason: "unobservable", detail: projection.detail };
    return { kind: "removable" };
  } catch (error) { return { kind: "refused", reason: "unobservable", detail: message(error) }; }
}
/** Complete physical removal outcome. */
export type WorktreeRemovalResult =
  | { kind: "removed" } | { kind: "pruned" }
  | { kind: "refused"; check: Extract<RemovalCheck, { kind: "refused" }> }
  | { kind: "failed"; step: "persist" | "unlock" | "remove"; detail: string; remedy?: Remedy };
/** Inputs for a caller-authorized, caller-serialized retirement. */
export interface RemoveWorktreeCheckoutOptions extends Omit<WorktreeRemovalOptions, "disposition" | "check"> {
  primaryWorktreePath: string;
  slots?: ProjectionRemovalSlots;
  /** Spawn repair must never remove a checkout whose folder has returned. */
  onlyMissing?: boolean;
  /** Re-observe caller-owned generation and lifecycle authority after persistence and before retirement. */
  beforeRetire?: () => Promise<void>;
}
/** Remove exactly one checkout or stale registration. */
export async function removeWorktreeCheckout(options: RemoveWorktreeCheckoutOptions): Promise<WorktreeRemovalResult> {
  const slots = options.slots ?? passingProjectionRemovalSlots;
  const check = await checkWorktreeRemoval({ ...options, disposition: "remove", check: slots.check });
  if (check.kind === "refused") return { kind: "refused", check };
  if (options.onlyMissing && (check.kind !== "missing" || await (options.folderExists ?? folderExists)(options.checkoutPath))) {
    return { kind: "failed", step: "remove", detail: `Checkout folder has returned at ${options.checkoutPath}; its registration was left intact.` };
  }
  let step: "persist" | "unlock" | "remove" = "persist";
  let unlocked = false;
  try {
    if (check.kind !== "missing") {
      const persisted = await slots.persist(options.checkoutPath);
      if (persisted.kind === "refused") return { kind: "failed", step, detail: persisted.remedy.text, remedy: persisted.remedy };
    }
    step = "unlock";
    const registration = await readRegistration(options.exec, options.checkoutPath);
    await options.beforeRetire?.();
    if (registration?.locked === PROJECTION_LOCK_REASON) {
      await options.exec("git", ["worktree", "unlock", options.checkoutPath], { cwd: options.primaryWorktreePath });
      unlocked = true;
    }
    step = "remove";
    if (options.onlyMissing && await (options.folderExists ?? folderExists)(options.checkoutPath)) {
      return await relock(options, unlocked,
        { kind: "failed", step, detail: `Checkout folder has returned at ${options.checkoutPath}; its registration was left intact.` });
    }
    await options.beforeRetire?.();
    await options.exec("git", ["worktree", "remove", options.checkoutPath], { cwd: options.primaryWorktreePath });
    return { kind: check.kind === "missing" ? "pruned" : "removed" };
  } catch (error) { return relock(options, unlocked, { kind: "failed", step, detail: message(error) }); }
}
/** A retirement that unlocked the projection's lock and kept the checkout locks it again before it reports failing. */
async function relock(
  options: RemoveWorktreeCheckoutOptions, unlocked: boolean, failed: Extract<WorktreeRemovalResult, { kind: "failed" }>,
): Promise<WorktreeRemovalResult> {
  if (!unlocked) return failed;
  try {
    await options.exec("git", ["worktree", "lock", "--reason", PROJECTION_LOCK_REASON, options.checkoutPath], { cwd: options.primaryWorktreePath });
    return failed;
  } catch (error) {
    return { ...failed, detail: `${failed.detail}; locking the checkout again failed too (${message(error)}): `
      + `lock it with git worktree lock --reason "${PROJECTION_LOCK_REASON}" ${options.checkoutPath}` };
  }
}
/** Persist a retained checkout before its caller touches its marker. */
export async function releaseWorktreeCheckout(options: RemoveWorktreeCheckoutOptions): Promise<{ kind: "released" } | { kind: "refused"; check: Extract<RemovalCheck, { kind: "refused" }> }> {
  const slots = options.slots ?? passingProjectionRemovalSlots;
  const check = await checkWorktreeRemoval({ ...options, disposition: "release", check: slots.check });
  if (check.kind === "refused") return { kind: "refused", check };
  const released = await slots.release(options.checkoutPath, resolve(options.checkoutPath) === resolve(options.primaryWorktreePath));
  return released.kind === "released" ? released : { kind: "refused", check: { kind: "refused", reason: "persist-would-refuse", remedy: released.remedy } };
}

/** What a spawn's lock left: the projection's lock, a lock another tool set first, or no lock. */
export type SpawnLock =
  | { kind: "locked" }
  | { kind: "kept"; lockReason: string | null }
  | { kind: "failed"; detail: string };
/**
 * Lock a checkout a verb spawned with the projection's reason, as the spawn's last step.
 * @param exec - Git boundary.
 * @param checkoutPath - A linked checkout the verb placed, never the primary or one claimed in place.
 * @returns Locked, already or now; kept under another tool's lock; or left unlocked because locking failed.
 */
export async function lockSpawnedCheckout(exec: GitExec, checkoutPath: string): Promise<SpawnLock> {
  try {
    const registration = await readRegistration(exec, checkoutPath);
    if (registration?.locked === PROJECTION_LOCK_REASON) return { kind: "locked" };
    if (registration?.locked !== undefined) return { kind: "kept", lockReason: registration.locked };
    await exec("git", ["worktree", "lock", "--reason", PROJECTION_LOCK_REASON, checkoutPath]);
    return { kind: "locked" };
  } catch (error) { return { kind: "failed", detail: message(error) }; }
}
/** The warning a spawn prints where its checkout lacks the projection's lock, or null where it carries it. */
export function describeSpawnLock(checkoutPath: string, lock: SpawnLock): string | null {
  switch (lock.kind) {
    case "locked": return null;
    case "kept": return `${checkoutPath} was already locked by another tool${lock.lockReason === null ? "" : ` (${lock.lockReason})`}; `
      + `ARC left that lock, so its exits refuse this checkout until that tool's owner runs git worktree unlock ${checkoutPath}`;
    case "failed": return `could not lock ${checkoutPath}: ${lock.detail}; `
      + `lock it with git worktree lock --reason "${PROJECTION_LOCK_REASON}" ${checkoutPath}`;
  }
}

/** Human repairs for refused removal observations. */
export function describeRemovalRefusal(check: Extract<RemovalCheck, { kind: "refused" }>): string {
  switch (check.reason) {
    case "dirty": return `refusing to remove a dirty worktree; commit or discard changes: ${check.paths.join(", ")}`;
    case "unobservable": return `cannot observe worktree removal safety: ${check.detail}; retry the observation`;
    case "locked": return `worktree is locked${check.lockReason === null ? "" : ` (${check.lockReason})`}: ${check.path}; its owner may run git worktree unlock ${check.path}`;
    case "persist-would-refuse": return check.remedy.text;
  }
}

async function folderExists(path: string): Promise<boolean> {
  try { return (await stat(path)).isDirectory(); }
  catch (error) { if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false; throw error; }
}
async function readRegistration(exec: GitExec, path: string) {
  const { stdout } = await exec("git", ["worktree", "list", "--porcelain", "-z"]);
  return parseGitWorktreePorcelainZ(stdout).find((entry) => resolve(entry.path) === resolve(path));
}
function statusPaths(stdout: string): string[] {
  return [...new Set(stdout.split("\n").filter((line) => line !== "").flatMap((line) => {
    const payload = line.slice(3);
    if (!/[RC]/u.test(line.slice(0, 2))) return [decodeGitQuotedText(payload)];
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < payload.length; index++) {
      const char = payload[index];
      if (escaped) { escaped = false; continue; }
      if (quoted && char === "\\") { escaped = true; continue; }
      if (char === '"') quoted = !quoted;
      if (!quoted && payload.slice(index, index + 4) === " -> ") {
        return [decodeGitQuotedText(payload.slice(0, index)), decodeGitQuotedText(payload.slice(index + 4))];
      }
    }
    return [decodeGitQuotedText(payload)];
  }))];
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

/** Check the checkout's marker-selected remove or retain disposition before lifecycle writes. */
export async function checkRetiringCheckout(options: Omit<WorktreeRemovalOptions, "disposition"> & { readMarker?: (path: string) => Promise<WorktreeMarkerReadResult> }): Promise<RemovalCheck> {
  try {
    const marker = await (options.readMarker ?? readWorktreeMarker)(options.checkoutPath);
    return await checkWorktreeRemoval({ ...options, disposition: marker.kind === "present" && !marker.marker.spawnedByArc ? "release" : "remove" });
  } catch (error) { return { kind: "refused", reason: "unobservable", detail: message(error) }; }
}

/** Clear only missing registrations obstructing a lifecycle spawn or branch checkout. */
export async function clearMissingWorktreeRegistrations(options: Omit<RemoveWorktreeCheckoutOptions, "checkoutPath"> & {
  targetPath?: string;
  branch?: string;
}): Promise<{ kind: "clear"; prunedPaths: string[] } | { kind: "refused"; reason: string }> {
  try {
    const { stdout } = await options.exec("git", ["worktree", "list", "--porcelain", "-z"]);
    const candidates = parseGitWorktreePorcelainZ(stdout).filter((entry) =>
      (options.targetPath !== undefined && resolve(entry.path) === resolve(options.targetPath))
      || (options.branch !== undefined && entry.branch === options.branch));
    const prunedPaths: string[] = [];
    for (const candidate of candidates) {
      if (await (options.folderExists ?? folderExists)(candidate.path)) continue;
      const result = await removeWorktreeCheckout({ ...options, checkoutPath: candidate.path, onlyMissing: true });
      if (result.kind === "refused") return { kind: "refused", reason: describeRemovalRefusal(result.check) };
      if (result.kind === "failed") return { kind: "refused", reason: `Stale worktree repair failed at ${result.step}: ${result.detail}` };
      prunedPaths.push(candidate.path);
    }
    return { kind: "clear", prunedPaths };
  } catch (error) { return { kind: "refused", reason: `Could not observe stale worktree registrations: ${message(error)}; retry.` }; }
}

/** Read the removal check's Git change evidence without locks or projection policy.
 * @param exec - Git boundary.
 * @param checkoutPath - Holding checkout to inspect.
 * @returns Changed paths, or the explicit observation failure.
 */
export async function readCheckoutChanges(exec: GitExec, checkoutPath: string): Promise<
  { kind: "known"; paths: string[] } | { kind: "unobservable"; detail: string }
> {
  try {
    const { stdout } = await exec("git", ["status", "--porcelain"], { cwd: checkoutPath, preserveOutput: true });
    return { kind: "known", paths: statusPaths(stdout) };
  } catch (error) { return { kind: "unobservable", detail: message(error) }; }
}
