/** Lazy repository selection and atomic installation of the separate bare store. */
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { readGitDirectories } from "../../git/directories.js";
import { isGitProcessError } from "../../git/process-error.js";
import type { RefBackendContext } from "./context.js";
import { readRefTips } from "./batch-read.js";
import { isStateRef, readObjectFormat } from "./manifest.js";
import { directoryExists, readRefDesignation } from "./designation.js";
import { bindRefRepository } from "./repository-context.js";

/** Reads select an existing directory without commands and never create a repository. */
export async function readRefRepository(context: RefBackendContext): Promise<RefBackendContext> {
  if (context.repository) return context;
  const { commonDir } = await readGitDirectories(context.checkoutRoot, context.fs);
  const directory = join(commonDir, "arc", "store");
  return bindRefRepository(context, commonDir, await directoryExists(context, directory) ? directory : null);
}

/** The separate store an operation bound is gone, as a move into the code repository's refs leaves it; given an error,
 * only a Git failure counts, so any other stays the caller's.
 */
export async function storeDirectoryVanished(bound: RefBackendContext, error?: unknown): Promise<boolean> {
  const gitDir = bound.repository?.gitDir;
  if (!gitDir || error !== undefined && !isGitProcessError(error)) return false;
  return !await directoryExists(bound, gitDir);
}

/** Run an operation bound to the current layout, starting it again when the store directory it bound goes beneath it,
 * whether a Git command failed on the absence or the operation returned what the departing copy held; a caller that
 * bound its own repository keeps it.
 */
export async function restartOnVanishedStore<T>(context: RefBackendContext, operation: (bound: RefBackendContext) => Promise<T>): Promise<T> {
  if (context.repository) return operation(context);
  for (;;) {
    const bound = await readRefRepository(context);
    let result: T;
    try { result = await operation(bound); }
    catch (error) { if (await storeDirectoryVanished(bound, error)) continue; throw error; }
    if (!await storeDirectoryVanished(bound)) return result;
  }
}

/** A first mutation places an empty store by designation, preserving either existing location.
 * @param captured Receives the initial namespace only when it proves the code repository already holds state.
 */
export async function writeRefRepository(context: RefBackendContext,
  captured?: (tips: ReadonlyMap<string, string>) => void): Promise<RefBackendContext> {
  if (context.repository) return context;
  const selected = await readRefRepository(context);
  const location = selected.repository;
  if (!location) throw new Error("Repository selection did not return its coordinate");
  if (location.gitDir || await codeHoldsState(context, captured)) return selected;
  const designation = await readRefDesignation(context, location.commonDir);
  if (designation.backing === null && designation.pushes.length === 1 && designation.pushes[0]?.name === designation.codeRemote) return selected;
  const release = await context.lock("layout");
  try {
    const directory = join(location.commonDir, "arc", "store");
    if (await directoryExists(context, directory)) return bindRefRepository(context, location.commonDir, directory);
    if (await codeHoldsState(context, captured)) return selected;
    await createStoreDirectory(context, location.commonDir, directory);
    return bindRefRepository(context, location.commonDir, directory);
  } finally { await release(); }
}

/** Whether the bound repository holds any state ref, as the code repository does before a move out of it.
 * @param captured Receives the namespace only when it holds state.
 */
export async function codeHoldsState(context: RefBackendContext, captured?: (tips: ReadonlyMap<string, string>) => void): Promise<boolean> {
  const tips = await readRefTips(context, { includeHistory: true });
  const present = [...tips.keys()].some(isStateRef);
  if (present) captured?.(tips);
  return present;
}

async function createStoreDirectory(context: RefBackendContext, commonDir: string, directory: string): Promise<void> {
  const temporary = join(commonDir, "arc", `store-init-${randomUUID()}`);
  await context.fs.mkdir(join(commonDir, "arc"), { recursive: true });
  try {
    const format = await readObjectFormat(context);
    await context.exec("git", ["init", "--bare", "--ref-format=reftable", `--object-format=${format}`, temporary], { cwd: context.checkoutRoot });
    await context.fs.rename(temporary, directory);
  } finally { await context.fs.removeDirectory(temporary); }
}
