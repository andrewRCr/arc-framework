/** Read native markerless branch candidates without deriving a session or conferring checkout ownership. */
import { realpath, stat } from "node:fs/promises";
import type { GitExec } from "../git/exec.js";
import { scanRegisteredWorktrees, type RegisteredWorktree } from "../git/worktree-roster.js";
import { readWorktreeMarkerGeneration, resolveWorktreeMarkerPath } from "../git/worktree-marker.js";
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import { createProjectIdentityReader } from "../store/project-identity.js";
import { findWorkBranchCheckoutPaths } from "./markerless-work-units.js";

/** Find branch advice for the selected exact primary, preserving unavailable or ambiguous native evidence. */
export async function findNativeMarkerlessWorkUnitCheckouts(input: {
  store: Store; record: StoreRecord; checkout: string; exec: GitExec;
}): Promise<string[]> {
  if ((input.record.links?.branches?.length ?? 0) === 0) return [];
  const exec: GitExec = (command, args, options) => input.exec(command, args, { cwd: input.checkout, ...options });
  const scan = await scanRegisteredWorktrees(exec);
  if (!scan.ok) throw new Error(`${scan.message} Repair the registered-worktree listing, then retry.`);
  if (scan.worktrees.length === 0) throw new Error("The registered-worktree listing is incomplete. Run again once Git lists all registered worktrees.");
  const seen = new Set<string>();
  const candidates: RegisteredWorktree[] = [];
  for (const row of scan.worktrees) if (await isNativeMarkerlessCandidate(row, seen)) candidates.push(row);
  return findWorkBranchCheckoutPaths(input.record, await createProjectIdentityReader(input.store)(), candidates);
}

async function isNativeMarkerlessCandidate(row: RegisteredWorktree, seen: Set<string>): Promise<boolean> {
  if (!row.folderPresent || !(await stat(row.path)).isDirectory()) {
    throw new Error(`Registered checkout ${row.path} is unavailable. Repair or prune its registration, then retry.`);
  }
  const canonical = await realpath(row.path);
  if (seen.has(canonical)) throw new Error(`Duplicate registrations identify checkout ${row.path}. Repair the registered-worktree listing, then retry.`);
  seen.add(canonical);
  let marker;
  try { marker = await readWorktreeMarkerGeneration(row.path); }
  catch (error) {
    throw new Error(`Cannot read ${resolveWorktreeMarkerPath(row.path)}: ${error instanceof Error ? error.message : String(error)}. Repair its marker, then retry.`, { cause: error });
  }
  if (marker.kind === "malformed") throw new Error(`Cannot read ${marker.path}: ${marker.message}. Repair its marker, then retry.`);
  return marker.kind === "absent";
}
