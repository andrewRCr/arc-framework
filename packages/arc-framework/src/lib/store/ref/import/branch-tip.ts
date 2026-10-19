/** Resolve locally held code branches without fetching or hiding Git failures. */
import type { RefStorePorts } from "../../ports.js";
import { isGitProcessError } from "../../../git/process-error.js";

type ImportSource = NonNullable<RefStorePorts["importSource"]>;
/** A single tip containing all held branch work, or an explicit missing/diverged state. */
export type ImportBranchTip = { status: "available"; tip: string } | { status: "missing" | "diverged" };

/** Select the containing local or origin-tracking tip, including a remote-only branch. */
export async function resolveImportBranchTip(source: ImportSource, branch: string): Promise<ImportBranchTip> {
  const [local, remote] = await Promise.all([readImportCodeTip(source, `refs/heads/${branch}`),
    readImportCodeTip(source, `refs/remotes/origin/${branch}`)]);
  if (local === null) return remote === null ? { status: "missing" } : { status: "available", tip: remote };
  if (remote === null || local === remote) return { status: "available", tip: local };
  if (await isCodeAncestor(source, local, remote)) return { status: "available", tip: remote };
  if (await isCodeAncestor(source, remote, local)) return { status: "available", tip: local };
  return { status: "diverged" };
}

/** Resolve one exact code ref; only Git's not-found exit becomes absence. */
export async function readImportCodeTip(source: ImportSource, ref: string): Promise<string | null> {
  try {
    const result = await source.ports.exec("git", ["--no-replace-objects", "rev-parse", "--verify", "--quiet", `${ref}^{commit}`],
      { cwd: source.ports.checkoutRoot, objectAccess: "local-only" });
    return result.stdout.trim() || null;
  } catch (error) {
    if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1) return null;
    throw error;
  }
}

async function isCodeAncestor(source: ImportSource, older: string, newer: string): Promise<boolean> {
  try {
    await source.ports.exec("git", ["--no-replace-objects", "merge-base", "--is-ancestor", older, newer],
      { cwd: source.ports.checkoutRoot, objectAccess: "local-only" });
    return true;
  } catch (error) {
    if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1) return false;
    throw error;
  }
}
