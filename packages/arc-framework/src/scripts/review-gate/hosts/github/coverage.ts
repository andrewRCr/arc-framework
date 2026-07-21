/**
 * Trusted-base change-set coverage resolution.
 *
 * Resolves the exact reviewed diff for a pull request without checking out or
 * executing its code. Objects are fetched only from the trusted base repository
 * remote — never a fork-controlled URL — through argument-array process
 * execution, so a fork-supplied ref or URL can neither redirect credentials nor
 * enter shell syntax. The merge base and changed-path set are computed locally,
 * and any missing, force-pushed, or unresolvable object fails `sensitive` rather
 * than producing a satisfiable-looking empty change set. The change-set identity
 * hashes `(base_ref, diff_base_sha, head_sha)`, so a retarget or merge-base
 * movement invalidates it while a base-tip advance that leaves the merge base
 * unchanged does not.
 *
 * @module
 */

import type { GitExec } from "../../../../lib/git/exec.js";
import {
  resolveChangeSet,
  type CanonicalChange,
  type RawGitExec,
} from "../../../../lib/change-facts.js";
import { computeChangeSetId } from "../../core/identity.js";

/** Local ref namespace the trusted fetch writes into; never checked out. */
const LOCAL_REF_PREFIX = "refs/arc-review-gate";
/** Conservative ref-name shape for a trusted base ref (fail-closed on anything unusual). */
const SAFE_REF = /^[A-Za-z0-9._/-]+$/u;
/** Conservative remote-name shape. */
const SAFE_REMOTE = /^[A-Za-z0-9._/-]+$/u;
const SHA = /^[0-9a-f]{40}$/u;

/** Inputs for resolving a pull request's coverage identity. */
export interface CoverageIdentityInput {
  /** Injected git executor (argument-array; no shell). */
  exec: GitExec;
  /** Optional byte-preserving Git boundary; production supplies it for raw diff parsing. */
  rawExec?: RawGitExec;
  /** Trusted base-repository remote name (e.g. `origin`); never a fork URL. */
  baseRemote: string;
  /** Base branch ref name reported by the host for the target repository. */
  baseRef: string;
  /** Expected head SHA reported by the host; a mismatch after fetch fails sensitive. */
  headSha: string;
  /** Pull-request number; the source of the trusted `refs/pull/<n>/head` ref. */
  prNumber: number;
}

/** Why coverage could not be resolved to a satisfiable change set. */
export type CoverageSensitiveReason =
  | "invalid-identity"
  | "objects-unavailable"
  | "head-mismatch"
  | "no-merge-base"
  | "diff-unresolvable";

/** Resolved coverage identity, or a fail-closed sensitive reason. */
export type CoverageIdentity =
  | {
      kind: "resolved";
      baseRef: string;
      baseSha: string;
      diffBaseSha: string;
      headSha: string;
      changeSetId: string;
      changedPaths: CanonicalChange[];
    }
  | { kind: "sensitive"; reason: CoverageSensitiveReason };

/** A conservative, git-ref-rule-shaped name: no `..`, leading `-`, or edge/double slashes. */
function safeName(name: string, pattern: RegExp): boolean {
  return (
    pattern.test(name)
    && !name.startsWith("-")
    && !name.includes("..")
    && !name.startsWith("/")
    && !name.endsWith("/")
    && !name.includes("//")
  );
}

function validIdentity(input: CoverageIdentityInput): boolean {
  return (
    safeName(input.baseRemote, SAFE_REMOTE)
    && safeName(input.baseRef, SAFE_REF)
    && SHA.test(input.headSha)
    && Number.isInteger(input.prNumber) && input.prNumber > 0
  );
}

async function clearLocalRef(exec: GitExec, ref: string): Promise<void> {
  try {
    await exec("git", ["update-ref", "-d", ref]);
  } catch {
    // Absent or already clear — nothing to remove.
  }
}

async function fetchTrustedObjects(input: CoverageIdentityInput): Promise<boolean> {
  const headTarget = `${LOCAL_REF_PREFIX}/${input.prNumber}/head`;
  const baseTarget = `${LOCAL_REF_PREFIX}/${input.prNumber}/base`;
  // Clear any prior local refs so a re-fetch into the same names cannot lock-conflict.
  await clearLocalRef(input.exec, headTarget);
  await clearLocalRef(input.exec, baseTarget);
  try {
    await input.exec("git", [
      "fetch",
      "--no-tags",
      "--no-recurse-submodules",
      input.baseRemote,
      `+refs/pull/${input.prNumber}/head:${headTarget}`,
      `+${input.baseRef}:${baseTarget}`,
    ]);
    return true;
  } catch {
    return false;
  }
}

async function revParseCommit(exec: GitExec, ref: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--verify", `${ref}^{commit}`]);
    const sha = stdout.trim();
    return SHA.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

async function computeMergeBase(exec: GitExec, left: string, right: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["merge-base", left, right]);
    const sha = stdout.trim();
    return SHA.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

function rawAdapter(exec: GitExec): RawGitExec {
  return async (args, options) => {
    const { stdout, stderr } = await exec(
      "git",
      args,
      options?.cwd === undefined ? undefined : { cwd: options.cwd },
    );
    return {
      stdout: new TextEncoder().encode(stdout),
      ...(stderr === undefined ? {} : { stderr: new TextEncoder().encode(stderr) }),
    };
  };
}

async function resolveChangedPaths(
  exec: RawGitExec,
  from: string,
  to: string,
): Promise<CanonicalChange[] | null> {
  const result = await resolveChangeSet(exec, from, to);
  return result.changeSet === "known" ? result.changes : null;
}

/**
 * Resolve the exact reviewed change set for a pull request from trusted objects.
 * Fails `sensitive` on any invalid identity, unavailable/force-pushed object,
 * absent merge base, or unresolvable diff.
 */
export async function resolveCoverageIdentity(input: CoverageIdentityInput): Promise<CoverageIdentity> {
  if (!validIdentity(input)) return { kind: "sensitive", reason: "invalid-identity" };
  if (!(await fetchTrustedObjects(input))) return { kind: "sensitive", reason: "objects-unavailable" };

  const headLocal = await revParseCommit(input.exec, `${LOCAL_REF_PREFIX}/${input.prNumber}/head`);
  const baseTip = await revParseCommit(input.exec, `${LOCAL_REF_PREFIX}/${input.prNumber}/base`);
  if (headLocal === null || baseTip === null) return { kind: "sensitive", reason: "objects-unavailable" };
  if (headLocal !== input.headSha) return { kind: "sensitive", reason: "head-mismatch" };

  const diffBaseSha = await computeMergeBase(input.exec, baseTip, headLocal);
  if (diffBaseSha === null) return { kind: "sensitive", reason: "no-merge-base" };

  const changedPaths = await resolveChangedPaths(input.rawExec ?? rawAdapter(input.exec), diffBaseSha, headLocal);
  if (changedPaths === null) return { kind: "sensitive", reason: "diff-unresolvable" };

  return {
    kind: "resolved",
    baseRef: input.baseRef,
    baseSha: baseTip,
    diffBaseSha,
    headSha: headLocal,
    changeSetId: computeChangeSetId({ baseRef: input.baseRef, diffBaseSha, headSha: headLocal }),
    changedPaths,
  };
}
