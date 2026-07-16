/** Git-backed retirement authority and replay evidence validation for teardown. */

import { assessReapSafety } from "../git/branch-containment.js";
import type { GitExec } from "../git/exec.js";
import type {
  DecodedWorktreeHuskStamp,
  WorktreeHuskStamp,
  WorktreeSubject,
} from "../git/worktree-marker.js";
import { canonicalDigest } from "../canonical/canonical-json.js";
import type { ManagedPath } from "../canonical/managed-path.js";
import {
  createGitRetirementAuthorizationContext,
  validateGitRetirementReceiptEvidence,
} from "./git-retirement-authorization-context.js";
import {
  authorizeRetirement,
  revalidateRetirementAuthorization,
} from "./retirement-authorization.js";
import {
  type RetirementAuthorityPort,
  type TeardownAuthorizationDecision,
} from "./retirement-authority.js";

/** Exact committed-blob reader used where canonical artifact digests depend on trailing bytes. */
export type TeardownBlobReader = (ref: string, path: ManagedPath) => Promise<Uint8Array | null>;

/** Build the Git-backed authorize/revalidate port consumed by directional teardown. */
export function createTeardownRetirementAuthority(
  exec: GitExec,
  baseRef: string,
  readBlob?: TeardownBlobReader,
): Pick<RetirementAuthorityPort, "authorize" | "revalidate"> {
  const context = createGitRetirementAuthorizationContext(exec, baseRef, readBlob);
  return {
    authorize: async (request) => await authorizeRetirement(context, request),
    revalidate: async (request, proof) => await revalidateRetirementAuthorization(context, request, proof),
  };
}

/** Re-resolve one persisted stamp's transition-specific evidence. */
export async function revalidateHuskRetirementEvidence(
  exec: GitExec,
  stamp: WorktreeHuskStamp,
  proof: Extract<TeardownAuthorizationDecision, { status: "authorized" }>,
  baseRef: string,
  readBlob?: TeardownBlobReader,
): Promise<boolean> {
  const { evidence } = proof;
  if (evidence.kind === "shipped") {
    try {
      await exec("git", ["merge-base", "--is-ancestor", evidence.baseProofOid, baseRef]);
      const currentDigest = await readCompletedProjectionDigest(exec, baseRef, stamp.subject);
      return currentDigest === null || currentDigest === evidence.resultDigest;
    } catch {
      const safety = await assessReapSafety(exec, { branch: stamp.branch, base: baseRef });
      return safety.safe;
    }
  }
  return await validateGitRetirementReceiptEvidence(exec, baseRef, {
    subject: stamp.subject,
    branch: stamp.branch,
    retiringHead: stamp.sha,
    authorization: proof.authorization,
    evidence,
  }, readBlob);
}

/** Validate one structurally decoded current stamp without treating the stamp as authority. */
export async function revalidateDecodedHuskRetirementEvidence(
  exec: GitExec,
  stamp: WorktreeHuskStamp,
  decoded: Extract<DecodedWorktreeHuskStamp, { kind: "current" }>,
  baseRef: string,
  readBlob?: TeardownBlobReader,
): Promise<boolean> {
  return await revalidateHuskRetirementEvidence(
    exec,
    stamp,
    {
      status: "authorized",
      authorization: decoded.authorization,
      authorityVersion: "decoded-husk",
      evidence: decoded.evidence,
      refs: { localOid: stamp.sha, remote: decoded.remoteRef },
    },
    baseRef,
    readBlob,
  );
}

async function readCompletedProjectionDigest(
  exec: GitExec,
  baseRef: string,
  subject: WorktreeSubject,
): Promise<ReturnType<typeof canonicalDigest> | null> {
  if (subject.kind !== "work-unit") return canonicalDigest({ subject });
  const { stdout } = await exec("git", [
    "ls-tree", "--full-tree", "-r", "--name-only", baseRef, "--", ".arc/completed",
  ]);
  const suffix = `/meta-${subject.name}.md`;
  const metaPath = stdout.split("\n").find((path) => path.endsWith(suffix));
  if (metaPath === undefined) return null;
  const directory = metaPath.slice(0, -suffix.length);
  const { stdout: treeOid } = await exec("git", ["rev-parse", `${baseRef}:${directory}`]);
  return canonicalDigest({ treeOid: treeOid.trim() });
}
