/** Lazy repository selection and atomic installation of the separate bare store. */
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { readGitDirectories } from "../../git/directories.js";
import type { RefBackendContext } from "./context.js";
import { readRefTips } from "./batch-read.js";
import { isManifestRef, readObjectFormat } from "./manifest.js";
import { directoryExists, readRefDesignation } from "./designation.js";
import { bindRefRepository } from "./repository-context.js";

/** Reads select an existing directory without commands and never create a repository. */
export async function readRefRepository(context: RefBackendContext): Promise<RefBackendContext> {
  if (context.repository) return context;
  const { commonDir } = await readGitDirectories(context.checkoutRoot, context.fs);
  const directory = join(commonDir, "arc", "store");
  return bindRefRepository(context, commonDir, await directoryExists(context, directory) ? directory : null);
}

/** A first mutation places an empty store by designation, preserving either existing location. */
export async function writeRefRepository(context: RefBackendContext): Promise<RefBackendContext> {
  if (context.repository) return context;
  const selected = await readRefRepository(context);
  const location = selected.repository;
  if (!location) throw new Error("Repository selection did not return its coordinate");
  if (location.gitDir || await codeHoldsState(context)) return selected;
  const designation = await readRefDesignation(context, location.commonDir);
  if (designation.backing === null && designation.pushes.length === 1 && designation.pushes[0]?.name === designation.codeRemote) return selected;
  const release = await context.lock("layout");
  try {
    const directory = join(location.commonDir, "arc", "store");
    if (await directoryExists(context, directory)) return bindRefRepository(context, location.commonDir, directory);
    if (await codeHoldsState(context)) return selected;
    await createStoreDirectory(context, location.commonDir, directory);
    return bindRefRepository(context, location.commonDir, directory);
  } finally { await release(); }
}

async function codeHoldsState(context: RefBackendContext): Promise<boolean> {
  const tips = await readRefTips(context, { includeHistory: true });
  return [...tips.keys()].some((ref) => isManifestRef(ref.replace("refs/arc/history/", "refs/arc/")));
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
