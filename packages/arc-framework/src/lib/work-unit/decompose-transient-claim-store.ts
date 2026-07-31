/** Repository-common serialized storage for decomposition candidate claims. */

import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { canonicalize, type CanonicalDigest } from "../canonical/canonical-json.js";
import { atomicWriteFile } from "../fs.js";
import type { GitExec } from "../git/exec.js";
import {
  acquireAdvisoryLock,
  releaseAdvisoryLock,
} from "../user-sync/notes-lock.js";
import {
  acquireDecomposeTransientClaim,
  occupyDecomposeTransientClaim,
  releaseDecomposeTransientWorktree,
  restateDecomposeTransientClaimBinding,
  rollbackDecomposeTransientWorktreeReservation,
  parseDecomposeTransientClaim,
  projectLiveDecomposeCandidateBranches,
  reserveDecomposeTransientWorktree,
  retireDecomposeTransientClaim,
  type DecomposeTransientAcquireResult,
  type DecomposeTransientClaim,
  type DecomposeTransientClaimBinding,
  type DecomposeTransientOccupationEvidence,
  type DecomposeTransientOccupyResult,
  type DecomposeTransientReleaseEvidence,
  type DecomposeTransientReleaseResult,
  type DecomposeTransientRestateBindingResult,
  type DecomposeTransientReservationRollbackEvidence,
  type DecomposeTransientReservationRollbackResult,
  type DecomposeTransientReserveResult,
  type DecomposeTransientRetireResult,
  type DecomposeTransientTerminal,
} from "./decompose-transient-claim.js";

export interface DecomposeTransientClaimStoreDeps {
  root: string;
  read(path: string): Promise<string | null>;
  list(root: string): Promise<string[]>;
  writeAtomic(path: string, value: string): Promise<void>;
  withLock<T>(path: string, operation: () => Promise<T>): Promise<T>;
}

export interface DecomposeTransientClaimStore {
  read(
    claimId: CanonicalDigest,
  ): Promise<
    | { status: "found"; claim: DecomposeTransientClaim }
    | { status: "missing" }
    | { status: "malformed" }
  >;
  list(): Promise<{ claims: DecomposeTransientClaim[]; malformed: string[] }>;
  acquire(
    claimId: CanonicalDigest,
    binding: DecomposeTransientClaimBinding,
  ): Promise<DecomposeTransientAcquireResult>;
  reserve(
    claimId: CanonicalDigest,
    generation: number,
    path: string,
  ): Promise<DecomposeTransientReserveResult>;
  rollbackReservation(
    claimId: CanonicalDigest,
    generation: number,
    path: string,
    evidence: DecomposeTransientReservationRollbackEvidence,
  ): Promise<DecomposeTransientReservationRollbackResult>;
  occupy(
    claimId: CanonicalDigest,
    generation: number,
    path: string,
    evidence: DecomposeTransientOccupationEvidence,
  ): Promise<DecomposeTransientOccupyResult>;
  retire(
    claimId: CanonicalDigest,
    generation: number,
    terminal: DecomposeTransientTerminal,
  ): Promise<DecomposeTransientRetireResult>;
  restateBinding(
    claimId: CanonicalDigest,
    generation: number,
    expectedBinding: DecomposeTransientClaimBinding,
    next: Pick<DecomposeTransientClaimBinding, "resultBaseHead" | "cutMapDigest">,
  ): Promise<DecomposeTransientRestateBindingResult>;
  release(
    claimId: CanonicalDigest,
    generation: number,
    candidateWorktree: CanonicalDigest,
    path: string,
    evidence: DecomposeTransientReleaseEvidence,
  ): Promise<DecomposeTransientReleaseResult>;
}

type PersistableResult =
  | DecomposeTransientAcquireResult
  | DecomposeTransientReserveResult
  | DecomposeTransientReservationRollbackResult
  | DecomposeTransientOccupyResult
  | DecomposeTransientRetireResult
  | DecomposeTransientRestateBindingResult
  | DecomposeTransientReleaseResult;

function changedClaim(result: PersistableResult): DecomposeTransientClaim | null {
  switch (result.status) {
    case "acquired":
    case "reserved":
    case "occupied":
    case "retired":
    case "restated":
    case "released":
    case "rolled-back":
      return result.claim;
    default:
      return null;
  }
}

/**
 * Create one lock-per-key claim store over an already-resolved Git common directory.
 *
 * @param deps - Repository-common root plus read, atomic-write, and lock boundaries.
 * @returns Serialized claim lifecycle operations.
 */
export function createDecomposeTransientClaimStore(
  deps: DecomposeTransientClaimStoreDeps,
): DecomposeTransientClaimStore {
  const claimPath = (claimId: CanonicalDigest): string => join(deps.root, `${claimId}.json`);
  const lockPath = (claimId: CanonicalDigest): string => join(deps.root, `${claimId}.lock`);

  const mutate = async <Result extends PersistableResult>(
    claimId: CanonicalDigest,
    operation: (current: string | null) => Result,
  ): Promise<Result> => deps.withLock(lockPath(claimId), async () => {
    const result = operation(await deps.read(claimPath(claimId)));
    const claim = changedClaim(result);
    if (claim !== null) await deps.writeAtomic(claimPath(claimId), canonicalize(claim));
    return result;
  });

  return {
    read: (claimId) => deps.withLock(lockPath(claimId), async () => {
      const current = await deps.read(claimPath(claimId));
      if (current === null) return { status: "missing" };
      const claim = parseDecomposeTransientClaim(current);
      return claim === null ? { status: "malformed" } : { status: "found", claim };
    }),
    list: async () => {
      const names = (await deps.list(deps.root))
        .filter((name) => name.endsWith(".json"))
        .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
      const claims: DecomposeTransientClaim[] = [];
      const malformed: string[] = [];
      for (const name of names) {
        const value = await deps.read(join(deps.root, name));
        const claim = value === null ? null : parseDecomposeTransientClaim(value);
        if (claim === null || name !== `${claim.claimId}.json`) malformed.push(name);
        else claims.push(claim);
      }
      return { claims, malformed };
    },
    acquire: (claimId, binding) =>
      mutate(claimId, (current) => acquireDecomposeTransientClaim(current, claimId, binding)),
    reserve: (claimId, generation, path) =>
      mutate(claimId, (current) =>
        reserveDecomposeTransientWorktree(current, claimId, generation, path)),
    rollbackReservation: (claimId, generation, path, evidence) =>
      mutate(claimId, (current) =>
        rollbackDecomposeTransientWorktreeReservation(
          current,
          claimId,
          generation,
          path,
          evidence,
        )),
    occupy: (claimId, generation, path, evidence) =>
      mutate(claimId, (current) =>
        occupyDecomposeTransientClaim(current, claimId, generation, path, evidence)),
    retire: (claimId, generation, terminal) =>
      mutate(claimId, (current) =>
        retireDecomposeTransientClaim(current, claimId, generation, terminal)),
    restateBinding: (claimId, generation, expectedBinding, next) =>
      mutate(claimId, (current) =>
        restateDecomposeTransientClaimBinding(
          current,
          claimId,
          generation,
          expectedBinding,
          next,
        )),
    release: (claimId, generation, candidateWorktree, path, evidence) =>
      mutate(claimId, (current) =>
        releaseDecomposeTransientWorktree(
          current,
          claimId,
          generation,
          candidateWorktree,
          path,
          evidence,
        )),
  };
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * Resolve and create the production repository-common claim store.
 *
 * @param exec - Git executor for the current repository.
 * @param cwd - Any attached checkout of that repository.
 * @returns A store rooted at `<git-common-dir>/arc/transient-claims`.
 */
export async function createNodeDecomposeTransientClaimStore(
  exec: GitExec,
  cwd: string,
): Promise<DecomposeTransientClaimStore> {
  const { stdout } = await exec("git", ["rev-parse", "--git-common-dir"], { cwd });
  const common = stdout.trim();
  if (common === "") throw new Error("Git did not resolve its common directory.");
  return createDecomposeTransientClaimStore({
    root: join(resolve(cwd, common), "arc", "transient-claims"),
    read: async (path) => {
      try {
        return await readFile(path, "utf8");
      } catch (error) {
        if (isMissingFile(error)) return null;
        throw error;
      }
    },
    list: async (root) => {
      try {
        return await readdir(root);
      } catch (error) {
        if (isMissingFile(error)) return [];
        throw error;
      }
    },
    writeAtomic: atomicWriteFile,
    withLock: async (path, operation) => {
      const lock = await acquireAdvisoryLock(path);
      try {
        return await operation();
      } finally {
        await releaseAdvisoryLock(lock);
      }
    },
  });
}

export interface LiveDecomposeTransientClaimProjection {
  branches: ReadonlySet<string>;
  diagnostics: readonly string[];
}

/**
 * Read the exact live candidate branches that residue readers may suppress.
 *
 * @param exec - Git executor for the current repository.
 * @param cwd - Any attached checkout of that repository.
 * @returns Unambiguous live branches plus fail-closed operational diagnostics.
 */
export async function readLiveDecomposeTransientClaimProjection(
  exec: GitExec,
  cwd: string,
): Promise<LiveDecomposeTransientClaimProjection> {
  try {
    const listed = await (await createNodeDecomposeTransientClaimStore(exec, cwd)).list();
    return {
      branches: projectLiveDecomposeCandidateBranches(listed.claims),
      diagnostics: listed.malformed.map((name) => `Malformed decomposition candidate claim: ${name}`),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      branches: new Set(),
      diagnostics: [`Could not read decomposition candidate claims: ${detail}`],
    };
  }
}
