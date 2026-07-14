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
import { computeChangeSetId } from "../../core/identity.js";
import type { ChangedPath, ChangedPathStatus } from "../../policy/self-hosting/lane.js";

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
      changedPaths: ChangedPath[];
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

function mapStatus(code: string): ChangedPathStatus {
  switch (code) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    default:
      return "modified";
  }
}

/**
 * Parse `git diff --name-status -z` output. NUL framing preserves arbitrary
 * valid Git filenames (spaces, newlines, non-ASCII); rename/copy records carry
 * the previous path as a separate NUL field.
 */
export function parseNameStatusZ(stdout: string): ChangedPath[] {
  const fields = stdout.split("\0");
  const changes: ChangedPath[] = [];
  let index = 0;
  while (index < fields.length) {
    const status = fields[index];
    if (status === undefined || status === "") {
      index += 1;
      continue;
    }
    const code = status[0] ?? "";
    if (code === "R" || code === "C") {
      const previousPath = fields[index + 1];
      const path = fields[index + 2];
      if (previousPath === undefined || path === undefined) break;
      changes.push(
        code === "R"
          ? { status: "renamed", path, previousPath }
          : { status: "added", path },
      );
      index += 3;
    } else {
      const path = fields[index + 1];
      if (path === undefined) break;
      changes.push({ status: mapStatus(code), path });
      index += 2;
    }
  }
  return changes;
}

async function resolveChangedPaths(exec: GitExec, from: string, to: string): Promise<ChangedPath[] | null> {
  try {
    const { stdout } = await exec("git", ["diff", "--name-status", "-z", "-M", from, to]);
    return parseNameStatusZ(stdout);
  } catch {
    return null;
  }
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

  const changedPaths = await resolveChangedPaths(input.exec, diffBaseSha, headLocal);
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
