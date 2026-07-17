/** Git-backed retirement authority and replay evidence validation for teardown. */

import { isContainedIn, isLandedInBase } from "../git/branch-containment.js";
import type { GitExec } from "../git/exec.js";
import type {
  DecodedWorktreeHuskStamp,
  WorktreeHuskStamp,
} from "../git/worktree-marker.js";
import type { ManagedPath } from "../canonical/managed-path.js";
import {
  createGitRetirementAuthorizationContext,
  readCompletedProjectionDigest,
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
  readBlob: TeardownBlobReader,
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
  readBlob: TeardownBlobReader,
): Promise<boolean> {
  const { evidence } = proof;
  if (evidence.kind === "shipped") {
    let pinnedBase: string;
    try {
      pinnedBase = await resolveCommit(exec, baseRef);
    } catch {
      return false;
    }
    const sourcePreserved = await retiringProjectionPreserved(exec, stamp, proof, pinnedBase);
    if (!sourcePreserved) return false;
    try {
      await exec("git", ["merge-base", "--is-ancestor", evidence.baseProofOid, pinnedBase]);
    } catch {
      try {
        const evidenceDigest = await readCompletedProjectionDigest(
          exec,
          evidence.baseProofOid,
          stamp.subject,
          readBlob,
        );
        if (evidenceDigest !== evidence.resultDigest) return false;
      } catch {
        return false;
      }
    }
    try {
      const currentDigest = await readCompletedProjectionDigest(exec, pinnedBase, stamp.subject, readBlob);
      return currentDigest !== null && currentDigest === evidence.resultDigest;
    } catch {
      return false;
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

async function retiringProjectionPreserved(
  exec: GitExec,
  stamp: WorktreeHuskStamp,
  proof: Extract<TeardownAuthorizationDecision, { status: "authorized" }>,
  base: string,
): Promise<boolean> {
  if (proof.refs.localOid !== stamp.sha) return false;
  if (await isLandedInBase(exec, stamp.sha, base)) return true;
  const remote = proof.refs.remote;
  return remote !== null
    && remote.oid === stamp.sha
    && await isContainedIn(exec, stamp.sha, `${remote.remote}/${stamp.branch}`);
}

async function resolveCommit(exec: GitExec, ref: string): Promise<string> {
  const { stdout } = await exec("git", ["rev-parse", "--verify", `${ref}^{commit}`]);
  const oid = stdout.trim();
  if (oid === "") throw new Error(`cannot resolve commit: ${ref}`);
  return oid;
}

/** Validate one structurally decoded current stamp without treating the stamp as authority. */
export async function revalidateDecodedHuskRetirementEvidence(
  exec: GitExec,
  stamp: WorktreeHuskStamp,
  decoded: Extract<DecodedWorktreeHuskStamp, { kind: "current" }>,
  baseRef: string,
  readBlob: TeardownBlobReader,
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
