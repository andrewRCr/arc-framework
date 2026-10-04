/** Parent-only publication of validated owned compiler generations. */
import type { BuildArtifactLease } from "./build-ownership.js";
import type { StagedBuildGeneration } from "./build-entry.js";
import type { BuildEvidence } from "./build-evidence.js";
import { checkStagedCli } from "./build-entry.js";
import { DEV_BUILD_STAMP_NAME, hasKernelSchemas } from "./build-evidence.js";
import { mkdir, readFile, readdir, rename, rm, lstat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { retryTransientFileSystemRefusal } from "./fs.js";

/** Filesystem and native parser boundaries for ordered publication. */
export interface BuildPublicationDependencies {
  readonly readFile: (file: string) => Promise<string>;
  readonly writeFile: (file: string, contents: string) => Promise<void>;
  readonly mkdir: (directory: string) => Promise<void>;
  readonly rename: (source: string, destination: string) => Promise<void>;
  readonly remove: (file: string) => Promise<void>;
  readonly listFiles: (directory: string) => Promise<readonly string[]>;
  readonly fileStatus: (file: string) => Promise<{ readonly regular: boolean; readonly size: number }>;
  readonly checkCli: (file: string, packageRoot: string) => Promise<void>;
}

const nativePublication: BuildPublicationDependencies = {
  readFile: async (file) => await readFile(file, "utf8"),
  writeFile: async (file, contents) => { await writeFile(file, contents, "utf8"); },
  mkdir: async (directory) => { await mkdir(directory, { recursive: true }); },
  rename,
  remove: async (file) => { await rm(file, { force: true }); },
  listFiles: listRelativeFiles,
  fileStatus: async (file) => {
    const status = await lstat(file);
    return { regular: status.isFile(), size: status.size };
  },
  checkCli: checkStagedCli,
};

/**
 * Publish a completed candidate while retaining its owning artifact capability.
 * @param lease - Current artifact owner
 * @param staged - Completed generation retained by the owning parent
 * @param evidence - Stable generation evidence ready for publication
 * @param overrides - Filesystem and native parser boundaries
 * @returns Only after required output and qualification are live
 */
export async function publishStagedBuild(
  lease: BuildArtifactLease, staged: StagedBuildGeneration, evidence: BuildEvidence,
  overrides: Partial<BuildPublicationDependencies> = {},
): Promise<void> {
  const io = { ...nativePublication, ...overrides };
  try {
    const files = await validateStagedOutput(staged, lease.packageRoot, io);
    await lease.confirmOwnership();
    const live = join(lease.packageRoot, "dist");
    const previous = await io.listFiles(live);
    await io.mkdir(live);
    const stamp = DEV_BUILD_STAMP_NAME;
    await io.writeFile(join(staged.directory, stamp), `${JSON.stringify(evidence)}\n`);
    // An interrupted replacement must not retain authority from an older generation.
    await lease.confirmOwnership();
    await io.remove(join(live, stamp));
    for (const file of files.filter((file) => file !== "cli.js" && file !== stamp)) {
      await replaceOwnedFile(lease, staged.directory, live, file, io);
    }
    await replaceOwnedFile(lease, staged.directory, live, "cli.js", io);
    const retained = new Set([...files, stamp]);
    for (const file of previous.filter((file) => !retained.has(file))) {
      await lease.confirmOwnership();
      await io.remove(join(live, file));
    }
    await replaceOwnedFile(lease, staged.directory, live, stamp, io);
  } catch (error) {
    const command = staged.mode === "full" ? "npm run build" : "npm run build:fast";
    throw new Error(`Build publication failed; repair output access and rerun ${command}.`, { cause: error });
  }
}

async function replaceOwnedFile(
  lease: BuildArtifactLease, source: string, live: string, file: string, io: BuildPublicationDependencies,
): Promise<void> {
  await lease.confirmOwnership();
  await io.mkdir(dirname(join(live, file)));
  await retryTransientFileSystemRefusal(async () => {
    await lease.confirmOwnership();
    await io.rename(join(source, file), join(live, file));
  });
}

async function validateStagedOutput(
  staged: StagedBuildGeneration, packageRoot: string, io: BuildPublicationDependencies,
): Promise<readonly string[]> {
  const files = await io.listFiles(staged.directory);
  const required = ["cli.js", "schemas/kernel.json", ...(staged.mode === "full" ? ["cli.d.ts"] : [])];
  for (const file of required) {
    if (!files.includes(file)) throw new Error(`Required staged artifact ${file} is missing.`);
  }
  for (const file of files) {
    const status = await io.fileStatus(join(staged.directory, file));
    if (!status.regular || status.size === 0) throw new Error(`Staged artifact ${file} is not a complete regular file.`);
  }
  const schema: unknown = JSON.parse(await io.readFile(join(staged.directory, "schemas/kernel.json")));
  if (!hasKernelSchemas(schema)) throw new Error("Staged kernel schema is unusable.");
  await io.checkCli(join(staged.directory, "cli.js"), packageRoot);
  return files;
}

async function listRelativeFiles(root: string, current = root): Promise<string[]> {
  let entries;
  try { entries = await readdir(current, { withFileTypes: true }); }
  catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const file = join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listRelativeFiles(root, file));
    else files.push(relative(root, file));
  }
  return files.sort();
}
