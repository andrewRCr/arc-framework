/** Production Git and filesystem seams for one v3 decomposition operation. */

import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  rmdir,
} from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";

import { digestBytes } from "../canonical/canonical-json.js";
import { validateManagedPath } from "../canonical/managed-path.js";
import { atomicWriteFile } from "../fs.js";
import type { GitExec } from "../git/exec.js";
import {
  ensureWorktreeMarkerIgnored,
  nodeWorktreeMarkerIgnoreFs,
  readWorktreeMarker,
  writeWorktreeOwnershipMarker,
} from "../git/worktree-marker.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import { readGitBlobBytes } from "../io-context.js";
import type {
  DecomposeCandidateCreationRequest,
  DecomposeCandidateCreationResult,
  DecomposeCandidateObservation,
  DecomposeResultOccupationAdapter,
} from "./decompose-result-occupation.js";
import { decomposeCandidateWorktreeToken } from "./decompose-candidate.js";
import type {
  V3PartialPathImage,
  V3PartialPathPreimage,
  V3PartialRecoveryIO,
} from "./decompose-v3-operation.js";
import type { V3PlanBlob } from "./decompose-v3-plan-composer.js";
import type { V3MaterializerIO } from "./decompose-v3-materializer.js";
import type { V3PlanCanonicalPathState } from "./decompose-v3-plan.js";
import { pruneEmptyBacklogSource } from "./mutators/relocate-artifacts.js";

export interface GitV3DecomposeOperationIO {
  occupation: DecomposeResultOccupationAdapter;
  materializer(cwd: string): V3MaterializerIO;
  partialRecovery(cwd: string): V3PartialRecoveryIO;
  writeAndStage(cwd: string, path: string, bytes: Uint8Array, mode: "100644" | "100755"): Promise<void>;
}

export interface GitV3DecomposeOperationIOInput {
  cwd: string;
  exec: GitExec;
  spawningIdentity: string;
  blobs: readonly V3PlanBlob[];
}

interface CandidateFacts {
  observation: DecomposeCandidateObservation;
  worktreePaths: Set<string>;
  pathExists: boolean;
  marker: Awaited<ReturnType<typeof readWorktreeMarker>>;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function resolveCommit(exec: GitExec, cwd: string, ref: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function resolveBranch(exec: GitExec, cwd: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function resolveGitCommonDirectory(exec: GitExec, cwd: string): Promise<string> {
  const { stdout } = await exec("git", ["rev-parse", "--git-common-dir"], { cwd });
  const common = stdout.trim();
  if (common === "") throw new Error("Git did not resolve its common directory.");
  const absolute = normalize(isAbsolute(common) ? common : resolve(cwd, common));
  if (!isAbsolute(absolute)) throw new Error("Git returned a non-absolute common directory.");
  return absolute;
}

function bindGitCwd(exec: GitExec, cwd: string): GitExec {
  return async (command, args, options) => await exec(command, args, {
    ...options,
    cwd: options?.cwd ?? cwd,
  });
}

function markerProjection(
  result: Awaited<ReturnType<typeof readWorktreeMarker>>,
  candidateBranch: string,
): boolean {
  return result.kind === "present"
    && result.marker.spawnedByArc
    && result.marker.createdFor?.kind === "branch"
    && result.marker.createdFor.ref === candidateBranch;
}

async function observeCandidate(
  exec: GitExec,
  cwd: string,
  candidateBranch: string,
  candidatePath: string,
): Promise<DecomposeCandidateObservation> {
  const bound = bindGitCwd(exec, cwd);
  const [branchHead, scan] = await Promise.all([
    resolveCommit(exec, cwd, `refs/heads/${candidateBranch}`),
    scanRegisteredWorktrees(bound),
  ]);
  if (!scan.ok) throw new Error(scan.message);
  const registered = scan.worktrees.filter(({ branch, path }) =>
    branch === candidateBranch || normalize(path) === candidatePath);
  const registrations = await Promise.all(registered.map(async (worktree) => ({
    path: normalize(worktree.path),
    candidateBranch,
    head: worktree.head,
    occupied: false,
    markerOwned: markerProjection(await readWorktreeMarker(worktree.path), candidateBranch),
  })));
  return { branchHead, registrations };
}

async function candidateFacts(
  exec: GitExec,
  cwd: string,
  request: DecomposeCandidateCreationRequest,
): Promise<CandidateFacts> {
  const scan = await scanRegisteredWorktrees(bindGitCwd(exec, cwd));
  if (!scan.ok) throw new Error(scan.message);
  const worktreePaths = new Set(scan.worktrees.map(({ path }) => normalize(path)));
  const [observation, exists] = await Promise.all([
    observeCandidate(exec, cwd, request.branch, request.path),
    pathExists(request.path),
  ]);
  return {
    observation,
    worktreePaths,
    pathExists: exists,
    marker: exists ? await readWorktreeMarker(request.path) : { kind: "absent" },
  };
}

function exactMarker(
  facts: CandidateFacts,
  request: DecomposeCandidateCreationRequest,
): boolean {
  return facts.marker.kind === "present"
    && facts.marker.marker.spawnedByArc
    && facts.marker.marker.createdFor?.kind === "branch"
    && facts.marker.marker.createdFor.ref === request.branch;
}

function exactRegistration(
  facts: CandidateFacts,
  request: DecomposeCandidateCreationRequest,
): boolean {
  return facts.observation.branchHead === request.baseHead
    && facts.observation.registrations.length === 1
    && facts.observation.registrations[0]?.path === request.path
    && facts.observation.registrations[0].head === request.baseHead
    && facts.observation.registrations[0].candidateBranch === request.branch;
}

function absenceEvidence(
  facts: CandidateFacts,
  request: DecomposeCandidateCreationRequest,
): {
  registrationAbsent: boolean;
  markerAbsent: boolean;
  branchAbsent: boolean;
  pathAbsent: boolean;
} {
  return {
    registrationAbsent: facts.observation.registrations.length === 0
      && !facts.worktreePaths.has(request.path),
    markerAbsent: facts.marker.kind === "absent",
    branchAbsent: facts.observation.branchHead === null,
    pathAbsent: !facts.pathExists,
  };
}

function collision(
  facts: CandidateFacts,
  request: DecomposeCandidateCreationRequest,
): DecomposeCandidateCreationResult {
  const absence = absenceEvidence(facts, request);
  const noMutation = Object.values(absence).every(Boolean);
  return {
    status: "collision",
    noMutation,
    ...(noMutation ? { absence } : {}),
  };
}

async function ensureCandidate(
  input: Pick<GitV3DecomposeOperationIOInput, "cwd" | "exec" | "spawningIdentity">,
  request: DecomposeCandidateCreationRequest,
): Promise<DecomposeCandidateCreationResult> {
  let facts = await candidateFacts(input.exec, input.cwd, request);
  if (exactRegistration(facts, request)) {
    return exactMarker(facts, request)
      ? { status: "ready", observation: facts.observation }
      : collision(facts, request);
  }

  const absence = absenceEvidence(facts, request);
  if (!Object.values(absence).every(Boolean)) return collision(facts, request);
  try {
    await mkdir(dirname(request.path), { recursive: true });
    await input.exec(
      "git",
      ["worktree", "add", request.path, "-b", request.branch, request.baseHead],
      { cwd: input.cwd },
    );
    await ensureWorktreeMarkerIgnored(request.path, input.exec, nodeWorktreeMarkerIgnoreFs);
    await writeWorktreeOwnershipMarker(request.path, {
      createdByArc: true,
      createdFor: { kind: "branch", ref: request.branch },
      spawningIdentity: input.spawningIdentity,
    });
  } catch {
    facts = await candidateFacts(input.exec, input.cwd, request);
    return exactRegistration(facts, request) && exactMarker(facts, request)
      ? { status: "ready", observation: facts.observation }
      : collision(facts, request);
  }
  facts = await candidateFacts(input.exec, input.cwd, request);
  return exactRegistration(facts, request) && exactMarker(facts, request)
    ? { status: "ready", observation: facts.observation }
    : collision(facts, request);
}

function literalPath(path: string): string {
  return `:(literal)${validateManagedPath(path)}`;
}

async function changedPaths(
  exec: GitExec,
  cwd: string,
  args: string[],
  paths: readonly string[],
): Promise<boolean> {
  if (paths.length === 0) return false;
  const { stdout } = await exec(
    "git",
    [...args, "--", ...paths.map(literalPath)],
    { cwd },
  );
  return stdout !== "";
}

async function repositoryChanged(
  exec: GitExec,
  cwd: string,
  args: string[],
): Promise<boolean> {
  const { stdout } = await exec("git", args, { cwd });
  return stdout !== "";
}

interface IndexEntry {
  mode: "100644" | "100755";
  bytes: Uint8Array;
}

async function readIndexEntry(
  exec: GitExec,
  cwd: string,
  path: string,
): Promise<IndexEntry | null> {
  const { stdout } = await exec(
    "git",
    ["ls-files", "--stage", "-z", "--", literalPath(path)],
    { cwd },
  );
  if (stdout === "") return null;
  const entries = stdout.split("\0").filter(Boolean);
  const match = entries.length === 1
    ? /^(100644|100755) [0-9a-f]{40,64} 0\t/u.exec(entries[0] ?? "")
    : null;
  const mode = match?.[1];
  if (mode !== "100644" && mode !== "100755") throw new Error(`Unsupported index state: ${path}`);
  const bytes = await readGitBlobBytes(cwd, null, validateManagedPath(path));
  if (bytes === null) throw new Error(`Unreadable index state: ${path}`);
  return { mode, bytes };
}

async function readIndexState(
  exec: GitExec,
  cwd: string,
  path: string,
): Promise<V3PlanCanonicalPathState> {
  const entry = await readIndexEntry(exec, cwd, path);
  return entry === null
    ? { kind: "absent" }
    : { kind: "file", mode: entry.mode, contentDigest: digestBytes(entry.bytes) };
}

async function readIndexImage(exec: GitExec, cwd: string, path: string): Promise<V3PartialPathImage> {
  const entry = await readIndexEntry(exec, cwd, path);
  return entry === null
    ? { kind: "absent" }
    : { kind: "object", objectKind: "blob", mode: entry.mode, bytes: entry.bytes };
}

async function readWorktreeImage(cwd: string, path: string): Promise<V3PartialPathImage> {
  const absolute = join(cwd, ...validateManagedPath(path).split("/"));
  let stat: Awaited<ReturnType<typeof lstat>>;
  try {
    stat = await lstat(absolute);
  } catch (error) {
    if (isMissing(error)) return { kind: "absent" };
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Unsupported worktree state: ${path}`);
  }
  return {
    kind: "object",
    objectKind: "blob",
    mode: (stat.mode & 0o111) === 0 ? "100644" : "100755",
    bytes: await readFile(absolute),
  };
}

async function ensureSafeParents(cwd: string, path: string): Promise<string> {
  const managed = validateManagedPath(path);
  let current = cwd;
  for (const segment of dirname(managed).split("/")) {
    if (segment === ".") continue;
    current = join(current, segment);
    try {
      const stat = await lstat(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error(`Managed-path parent is not a real directory: ${current}`);
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
      await mkdir(current);
    }
  }
  return join(cwd, ...managed.split("/"));
}

async function writePathImage(cwd: string, path: string, image: V3PartialPathImage): Promise<void> {
  const absolute = join(cwd, ...validateManagedPath(path).split("/"));
  if (image.kind === "absent") {
    await rm(absolute, { force: true });
    return;
  }
  if (image.objectKind !== "blob" || (image.mode !== "100644" && image.mode !== "100755")) {
    throw new Error(`Unsupported path image: ${path}`);
  }
  await ensureSafeParents(cwd, path);
  await atomicWriteFile(absolute, image.bytes);
  await chmod(absolute, image.mode === "100755" ? 0o755 : 0o644);
}

async function stagePath(exec: GitExec, cwd: string, path: string): Promise<void> {
  await exec("git", ["add", "-A", "--", literalPath(path)], { cwd });
}

function imagesEqual(left: V3PartialPathImage, right: V3PartialPathImage): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "absent" || right.kind === "absent") return true;
  return left.objectKind === right.objectKind
    && left.mode === right.mode
    && Buffer.from(left.bytes).equals(Buffer.from(right.bytes));
}

function preimagesEqual(left: V3PartialPathPreimage, right: V3PartialPathPreimage): boolean {
  return left.path === right.path
    && imagesEqual(left.index, right.index)
    && imagesEqual(left.worktree, right.worktree);
}

function partialRecovery(exec: GitExec, cwd: string): V3PartialRecoveryIO {
  const capture = async (paths: readonly string[]): Promise<V3PartialPathPreimage[]> =>
    await Promise.all(paths.map(async (path) => ({
      path,
      index: await readIndexImage(exec, cwd, path),
      worktree: await readWorktreeImage(cwd, path),
    })));
  return {
    capture,
    restore: async (preimages) => {
      for (const preimage of preimages) {
        if (preimage.index.kind === "absent") {
          await exec(
            "git",
            ["rm", "--cached", "--ignore-unmatch", "--", literalPath(preimage.path)],
            { cwd },
          );
        } else {
          await writePathImage(cwd, preimage.path, preimage.index);
          await stagePath(exec, cwd, preimage.path);
        }
        await writePathImage(cwd, preimage.path, preimage.worktree);
      }
    },
    verify: async (preimages) => {
      const observed = await capture(preimages.map(({ path }) => path));
      for (const expected of preimages) {
        const actual = observed.find(({ path }) => path === expected.path);
        if (actual === undefined || !preimagesEqual(expected, actual)) {
          return { status: "mismatch", path: expected.path };
        }
      }
      return { status: "restored" };
    },
  };
}

function materializer(
  exec: GitExec,
  cwd: string,
  blobs: ReadonlyMap<string, Uint8Array>,
): V3MaterializerIO {
  return {
    observe: async (path) => {
      const dirty = await changedPaths(
        exec,
        cwd,
        ["diff", "--name-only", "--no-renames", "-z"],
        [path],
      );
      const untracked = await changedPaths(
        exec,
        cwd,
        ["ls-files", "--others", "--exclude-standard", "-z"],
        [path],
      );
      if (dirty || untracked) throw new Error(`Worktree differs from index: ${path}`);
      return await readIndexState(exec, cwd, path);
    },
    readBlob: (contentDigest) => {
      const bytes = blobs.get(contentDigest);
      return Promise.resolve(bytes === undefined ? null : new Uint8Array(bytes));
    },
    applyAndStageFinal: async (path, state, bytes) => {
      let removedParent: string | null = null;
      if (state.kind === "absent") {
        const absolute = join(cwd, ...validateManagedPath(path).split("/"));
        await rm(absolute, { force: true });
        removedParent = dirname(absolute);
      } else {
        if (bytes === null) throw new Error(`Missing final bytes: ${path}`);
        const absolute = await ensureSafeParents(cwd, path);
        await atomicWriteFile(absolute, bytes);
        await chmod(absolute, state.mode === "100755" ? 0o755 : 0o644);
      }
      await stagePath(exec, cwd, path);
      if (removedParent !== null) {
        await pruneEmptyBacklogSource({ readdir, rmdir }, removedParent);
      }
    },
  };
}

/**
 * Bind exact candidate occupation, plan materialization, and partial restoration to Git.
 *
 * @param input - Repository locus, Git executor, identity, and content-addressed final blobs.
 * @returns Production adapters for the pure occupation and operation state machines.
 */
export async function createGitV3DecomposeOperationIO(
  input: GitV3DecomposeOperationIOInput,
): Promise<GitV3DecomposeOperationIO> {
  const common = await resolveGitCommonDirectory(input.exec, input.cwd);
  const blobs = new Map(input.blobs.map(({ contentDigest, bytes }) => [
    contentDigest,
    new Uint8Array(bytes),
  ]));
  return {
    occupation: {
      resolveBaseHead: async (baseBranch) =>
        await resolveCommit(input.exec, input.cwd, `refs/heads/${baseBranch}`),
      observeCandidate: async (candidateBranch, candidatePath) =>
        await observeCandidate(input.exec, input.cwd, candidateBranch, candidatePath),
      inspectPartial: async (baseBranch, relevantPaths) => {
        const [baseHead, head, branch, indexDirty, worktreeDirty, untracked] = await Promise.all([
          resolveCommit(input.exec, input.cwd, `refs/heads/${baseBranch}`),
          resolveCommit(input.exec, input.cwd, "HEAD"),
          resolveBranch(input.exec, input.cwd),
          repositoryChanged(
            input.exec,
            input.cwd,
            ["diff", "--cached", "--name-only", "--no-renames", "-z"],
          ),
          changedPaths(
            input.exec,
            input.cwd,
            ["diff", "--name-only", "--no-renames", "-z"],
            relevantPaths,
          ),
          changedPaths(
            input.exec,
            input.cwd,
            ["ls-files", "--others", "--exclude-standard", "-z"],
            relevantPaths,
          ),
        ]);
        return {
          baseHead: head === baseHead && branch === baseBranch ? baseHead : null,
          indexClean: !indexDirty,
          worktreeClean: !worktreeDirty && !untracked,
        };
      },
      candidatePath: (origin) =>
        Promise.resolve(normalize(join(
          common,
          "arc",
          "decompose-worktrees",
          decomposeCandidateWorktreeToken(origin),
        ))),
      ensureCandidate: async (request) => await ensureCandidate(input, request),
    },
    materializer: (cwd) => materializer(input.exec, cwd, blobs),
    partialRecovery: (cwd) => partialRecovery(input.exec, cwd),
    writeAndStage: async (cwd, path, bytes, mode) => {
      const absolute = await ensureSafeParents(cwd, path);
      await atomicWriteFile(absolute, bytes);
      await chmod(absolute, mode === "100755" ? 0o755 : 0o644);
      await stagePath(input.exec, cwd, path);
    },
  };
}

/** Production lifecycle scan seam shared with the durable preparation driver. */
export const nodeV3DecomposeLifecycleFs = {
  readdir: async (path: string) => await readdir(path, { withFileTypes: true }),
  readFile: async (path: string) => await readFile(path, "utf8"),
};
