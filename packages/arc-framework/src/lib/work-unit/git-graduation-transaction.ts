/**
 * Read-only Git adapter that binds one exact `start` graduation transaction.
 *
 * @module
 */

import { isAbsolute, posix, resolve } from "node:path";

import { canonicalize, digestBytes } from "../kernel/canonical/canonical-json.js";
import type { GitExec } from "../git/exec.js";
import { parseGitWorktreePorcelain } from "../git/worktree-porcelain.js";
import { artifactMatcher } from "./mutators/relocate-artifacts.js";
import {
  prepareValidatedGraduationTransaction,
  type GraduationClassResolution,
  type GraduationStoredArtifact,
  type PrepareGraduationTransactionInput,
  type ValidatedGraduationTransaction,
} from "./validated-graduation-transaction.js";

const TREE_ENTRY = /^([0-7]{6}) ([^ ]+) ([0-9a-f]{40}(?:[0-9a-f]{24})?)\t(.+)$/u;

/** External reads needed to prepare and immediately revalidate graduation. */
export interface GitGraduationTransactionDependencies {
  exec: GitExec;
  readBlob(ref: string | null, path: string): Promise<Uint8Array | null>;
  readWorktreeFile(path: string): Promise<Uint8Array | null>;
  pathExists(path: string): Promise<boolean>;
}

/** Start-arm facts known before any branch, worktree, or artifact mutation. */
export interface PrepareGitGraduationTransactionInput {
  cwd: string;
  slug: string;
  location: "planned" | "provisional";
  sourceRef: string;
  sourceDirectory: string;
  targetDirectory: string;
  mode: "spawned" | "in-place";
  worktreePath: string;
  classResolution: GraduationClassResolution;
  spawn?: {
    locationTemplate: string;
    repo: string;
    spawningIdentity: string;
    postCreateScript?: string;
    primaryWorktreePath?: string;
    registeredHarnessDirs?: string;
  };
}

/** Closed Git-backed preflight result. */
export type GitGraduationTransactionResult =
  | { status: "ready"; transaction: ValidatedGraduationTransaction }
  | {
    status: "refused";
    reason: "git-read" | "source-shape" | "anchor-policy" | "transaction" | "snapshot-drift";
    locus: string;
    detail?: string;
  };

interface CapturedGraduationInput {
  input: PrepareGraduationTransactionInput;
  sourceHead: string;
  sourceTree: string;
}

type GraduationCaptureReason = "git-read" | "source-shape";

class GraduationCaptureError extends Error {
  constructor(
    readonly reason: GraduationCaptureReason,
    message: string,
  ) {
    super(message);
  }
}

function captureRefusal(reason: GraduationCaptureReason, message: string): never {
  throw new GraduationCaptureError(reason, message);
}

function comparePaths(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizePath(path: string, cwd: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(cwd, path);
}

async function resolveOid(exec: GitExec, cwd: string, expression: string): Promise<string> {
  const { stdout } = await exec("git", ["rev-parse", "--verify", expression], { cwd });
  const oid = stdout.trim();
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(oid)) {
    throw new Error(`Git returned an invalid object id for ${expression}.`);
  }
  return oid;
}

async function readTreeArtifacts(
  deps: GitGraduationTransactionDependencies,
  input: PrepareGitGraduationTransactionInput,
): Promise<GraduationStoredArtifact[]> {
  const { stdout } = await deps.exec(
    "git",
    ["ls-tree", "--full-tree", "-r", "-z", input.sourceRef, "--", input.sourceDirectory],
    { cwd: input.cwd },
  );
  const matcher = artifactMatcher(input.slug);
  const records = stdout.split("\0").filter(Boolean);
  const artifacts: GraduationStoredArtifact[] = [];
  for (const record of records) {
    const match = TREE_ENTRY.exec(record);
    if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined || match[4] === undefined) {
      captureRefusal("source-shape", `Malformed tree entry under ${input.sourceDirectory}.`);
    }
    const [, mode, objectKind, oid, path] = match;
    const basename = posix.basename(path);
    if (posix.dirname(path) !== input.sourceDirectory
      || !matcher.test(basename)
      || objectKind !== "blob"
      || (mode !== "100644" && mode !== "100755")) {
      captureRefusal("source-shape", `Unexpected stored artifact ${path}. `
        + `Rename a regular file to <kind>-${input.slug}.md and place it directly inside ${input.sourceDirectory}, `
        + "or move this entry out of the directory. Commit the repair to the configured base branch "
        + `(and push or merge it there when origin is available), then rerun arc start ${input.slug}.`);
    }
    const bytes = await deps.readBlob(input.sourceRef, path);
    if (bytes === null) captureRefusal("source-shape", `Stored artifact disappeared: ${path}.`);
    artifacts.push({
      basename,
      sourcePath: path,
      targetPath: posix.join(input.targetDirectory, basename),
      objectKind,
      mode,
      oid,
      contentDigest: digestBytes(bytes),
      bytes,
    });
  }
  return artifacts.sort((left, right) => comparePaths(left.sourcePath, right.sourcePath));
}

async function targetDirectoryIsAbsent(
  deps: GitGraduationTransactionDependencies,
  input: PrepareGitGraduationTransactionInput,
): Promise<boolean> {
  const { stdout } = await deps.exec(
    "git",
    ["ls-tree", "--full-tree", "-r", "-z", input.sourceRef, "--", input.targetDirectory],
    { cwd: input.cwd },
  );
  const matcher = artifactMatcher(input.slug);
  return stdout.split("\0").filter(Boolean).every((record) => {
    const match = TREE_ENTRY.exec(record);
    return match?.[4] !== undefined && !matcher.test(posix.basename(match[4]));
  });
}

async function inPlaceProjectionMatches(
  deps: GitGraduationTransactionDependencies,
  request: PrepareGitGraduationTransactionInput,
  artifacts: readonly GraduationStoredArtifact[],
): Promise<boolean> {
  if (request.mode !== "in-place") return true;
  const pathspecs = artifacts.flatMap(({ sourcePath, targetPath }) => [
    `:(literal)${sourcePath}`,
    `:(literal)${targetPath}`,
  ]);
  const { stdout } = await deps.exec(
    "git",
    ["ls-files", "--stage", "-z", "--", ...pathspecs],
    { cwd: request.cwd },
  );
  const indexed = new Map<string, { mode: string; oid: string }>();
  for (const record of stdout.split("\0").filter(Boolean)) {
    const match = /^(100644|100755) ([0-9a-f]{40}(?:[0-9a-f]{24})?) 0\t(.+)$/u.exec(record);
    if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) return false;
    indexed.set(match[3], { mode: match[1], oid: match[2] });
  }
  for (const artifact of artifacts) {
    const indexEntry = indexed.get(artifact.sourcePath);
    if (indexEntry?.mode !== artifact.mode || indexEntry.oid !== artifact.oid
      || indexed.has(artifact.targetPath)) return false;
    const [indexBytes, worktreeBytes, targetBytes] = await Promise.all([
      deps.readBlob(null, artifact.sourcePath),
      deps.readWorktreeFile(artifact.sourcePath),
      deps.readWorktreeFile(artifact.targetPath),
    ]);
    if (indexBytes === null || worktreeBytes === null || targetBytes !== null
      || digestBytes(indexBytes) !== artifact.contentDigest
      || digestBytes(worktreeBytes) !== artifact.contentDigest) return false;
  }
  return true;
}

async function branchIsAbsent(
  deps: GitGraduationTransactionDependencies,
  input: PrepareGitGraduationTransactionInput,
): Promise<boolean> {
  const ref = `refs/heads/plan/${input.slug}`;
  const { stdout } = await deps.exec(
    "git",
    ["for-each-ref", "--format=%(refname)", ref],
    { cwd: input.cwd },
  );
  const refs = stdout.split("\n").filter(Boolean);
  return refs.length === 0;
}

async function capture(
  deps: GitGraduationTransactionDependencies,
  request: PrepareGitGraduationTransactionInput,
): Promise<CapturedGraduationInput> {
  const indexTreeRead = request.mode === "spawned"
    ? Promise.resolve<string | null>(null)
    : resolveOid(deps.exec, request.cwd, "HEAD^{tree}").then(async () => {
        const { stdout } = await deps.exec("git", ["write-tree"], { cwd: request.cwd });
        const oid = stdout.trim();
        if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(oid)) {
          throw new Error("Git returned an invalid index tree.");
        }
        return oid;
      });
  const [sourceHead, sourceTree, capturedIndexTree, artifacts, targetsAbsent, branchAbsent, worktreeResult] =
    await Promise.all([
      resolveOid(deps.exec, request.cwd, `${request.sourceRef}^{commit}`),
      resolveOid(deps.exec, request.cwd, `${request.sourceRef}^{tree}`),
      indexTreeRead,
      readTreeArtifacts(deps, request),
      targetDirectoryIsAbsent(deps, request),
      branchIsAbsent(deps, request),
      deps.exec("git", ["worktree", "list", "--porcelain"], { cwd: request.cwd }),
    ]);
  if (!targetsAbsent) throw new Error(`Destination directory is occupied: ${request.targetDirectory}.`);
  if (!branchAbsent) throw new Error(`Branch is occupied: refs/heads/plan/${request.slug}.`);
  if (!await inPlaceProjectionMatches(deps, request, artifacts)) {
    throw new Error("In-place source, destination, index, or worktree state differs from the pinned source.");
  }

  const worktrees = parseGitWorktreePorcelain(worktreeResult.stdout);
  const requestedWorktree = normalizePath(request.worktreePath, request.cwd);
  const registeredAtTarget = worktrees.find(({ path }) => normalizePath(path, request.cwd) === requestedWorktree);
  let worktree: PrepareGraduationTransactionInput["occupation"]["worktree"];
  if (request.mode === "spawned") {
    if (registeredAtTarget !== undefined || await deps.pathExists(requestedWorktree)) {
      throw new Error(`Worktree destination is occupied: ${requestedWorktree}.`);
    }
    worktree = { kind: "absent", path: requestedWorktree };
  } else {
    if (registeredAtTarget === undefined
      || registeredAtTarget.head !== sourceHead
      || registeredAtTarget.branch === null) {
      throw new Error(`Current worktree does not match ${request.sourceRef}: ${requestedWorktree}.`);
    }
    worktree = {
      kind: "current",
      path: requestedWorktree,
      head: registeredAtTarget.head,
      branch: registeredAtTarget.branch,
    };
  }

  const metaPath = posix.join(request.sourceDirectory, `meta-${request.slug}.md`);
  const metaArtifact = artifacts.find(({ sourcePath }) => sourcePath === metaPath);
  if (metaArtifact === undefined) captureRefusal("source-shape", `Backlog meta is absent: ${metaPath}.`);
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(metaArtifact.bytes);
  } catch {
    captureRefusal("source-shape", `Backlog meta is not valid UTF-8: ${metaPath}.`);
  }
  return {
    sourceHead,
    sourceTree,
    input: {
      slug: request.slug,
      location: request.location,
      sourceDirectory: request.sourceDirectory,
      targetDirectory: request.targetDirectory,
      artifacts,
      destinations: artifacts.map(({ targetPath }) => ({ path: targetPath, state: { kind: "absent" } })),
      classResolution: request.classResolution,
      occupation: {
        mode: request.mode,
        baseHead: sourceHead,
        branch: { kind: "absent", ref: `refs/heads/plan/${request.slug}` },
        worktree,
        indexTree: capturedIndexTree ?? sourceTree,
        operation: request.mode === "spawned"
          ? {
              kind: "spawned",
              branch: `plan/${request.slug}`,
              base: sourceHead,
              worktreePath: requestedWorktree,
              locationTemplate: request.spawn?.locationTemplate ?? "",
              repo: request.spawn?.repo ?? "",
              wuName: request.slug,
              spawningIdentity: request.spawn?.spawningIdentity ?? "",
              ...(request.spawn?.postCreateScript === undefined
                ? {}
                : { postCreateScript: request.spawn.postCreateScript }),
              ...(request.spawn?.primaryWorktreePath === undefined
                ? {}
                : { primaryWorktreePath: request.spawn.primaryWorktreePath }),
              ...(request.spawn?.registeredHarnessDirs === undefined
                ? {}
                : { registeredHarnessDirs: request.spawn.registeredHarnessDirs }),
            }
          : {
              kind: "in-place",
              branch: `plan/${request.slug}`,
              worktreePath: requestedWorktree,
            },
      },
    },
  };
}

function transactionIdentity(transaction: ValidatedGraduationTransaction): string {
  return canonicalize(JSON.parse(JSON.stringify(transaction, (_key, value: unknown) =>
    value instanceof Uint8Array
      ? { $bytes: Buffer.from(value).toString("base64") }
      : value)) as unknown);
}

/**
 * Capture, construct, and immediately revalidate one start graduation transaction.
 *
 * @param deps - Exact Git/blob/path/anchor read dependencies
 * @param request - Resolved start-arm source and occupation facts
 * @returns A validated transaction or a typed pre-mutation refusal
 */
export async function prepareGitGraduationTransaction(
  deps: GitGraduationTransactionDependencies,
  request: PrepareGitGraduationTransactionInput,
): Promise<GitGraduationTransactionResult> {
  let first: CapturedGraduationInput;
  try {
    first = await capture(deps, request);
  } catch (error) {
    const detail = errorMessage(error);
    const reason = error instanceof GraduationCaptureError ? error.reason : "git-read";
    return { status: "refused", reason, locus: request.sourceDirectory, detail };
  }
  const prepared = prepareValidatedGraduationTransaction(first.input);
  if (prepared.status === "refused") {
    return {
      status: "refused",
      reason: "transaction",
      locus: prepared.locus,
      detail: `${prepared.reason}${prepared.detail === undefined ? "" : `: ${prepared.detail}`}`,
    };
  }

  let second: CapturedGraduationInput;
  try {
    second = await capture(deps, request);
  } catch (error) {
    return {
      status: "refused",
      reason: "snapshot-drift",
      locus: request.sourceDirectory,
      detail: errorMessage(error),
    };
  }
  const revalidated = prepareValidatedGraduationTransaction(second.input);
  if (revalidated.status !== "ready"
    || first.sourceHead !== second.sourceHead
    || first.sourceTree !== second.sourceTree
    || transactionIdentity(prepared.transaction) !== transactionIdentity(revalidated.transaction)) {
    return {
      status: "refused",
      reason: "snapshot-drift",
      locus: request.sourceDirectory,
      detail: "Graduation inputs changed during read-only preflight.",
    };
  }
  return prepared;
}
