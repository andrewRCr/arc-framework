/** Git-backed retirement authority and replay evidence validation for teardown. */

import { assessReapSafety, isLandedInBase } from "../git/branch-containment.js";
import type { GitExec } from "../git/exec.js";
import type { WorktreeHuskStamp, WorktreeSubject } from "../git/worktree-marker.js";
import { canonicalDigest } from "../canonical/canonical-json.js";
import { contentDigest, type ArtifactSetEntry } from "../canonical/content-digest.js";
import { validateManagedPath, type ManagedPath } from "../canonical/managed-path.js";
import { artifactGroupDigest } from "../canonical/receipt-id.js";
import {
  worktreeSubjectsEqual,
  type RetirementAuthorityPort,
  type RetirementReceipt,
  type TeardownAuthorizationDecision,
  type TeardownAuthorizationRequest,
} from "./retirement-authority.js";
import { RETIREMENT_RECORD_NAMESPACE, resolveRetirementRecordRelativePath } from "./retirement-record-store.js";

/** Exact committed-blob reader used where canonical artifact digests depend on trailing bytes. */
export type TeardownBlobReader = (ref: string, path: ManagedPath) => Promise<Uint8Array | null>;

/** Build the Git-backed authorize/revalidate port consumed by directional teardown. */
export function createTeardownRetirementAuthority(
  exec: GitExec,
  baseRef: string,
): Pick<RetirementAuthorityPort, "authorize" | "revalidate"> {
  const authorize = async (request: TeardownAuthorizationRequest): Promise<TeardownAuthorizationDecision> => {
    if (request.requestedMode !== "shipped") return await authorizeReceiptRetirement(exec, baseRef, request);
    const safety = await assessReapSafety(exec, { branch: request.branch, base: baseRef, remote: request.remote });
    if (!safety.safe) return { status: "refused", reason: "preservation-unproven" };
    const landed = await isLandedInBase(exec, request.branch, baseRef);
    let baseProofOid: string;
    try {
      ({ stdout: baseProofOid } = await exec("git", ["rev-parse", baseRef]));
      baseProofOid = baseProofOid.trim();
    } catch {
      return { status: "refused", reason: "authority-unavailable" };
    }
    let remoteOid: string | null;
    try {
      remoteOid = await readRemoteOid(exec, request);
    } catch {
      return { status: "refused", reason: "authority-unavailable" };
    }
    if (remoteOid !== null && remoteOid !== request.head) return { status: "refused", reason: "projection-mismatch" };
    const evidence = {
      kind: "shipped" as const,
      expectedLifecycle: "completed" as const,
      resultDigest: (await readCompletedProjectionDigest(exec, baseRef, request.subject))
        ?? canonicalDigest({ subject: request.subject, preservedIn: baseProofOid }),
      baseProofOid,
    };
    const refs = {
      localOid: request.head,
      remote: remoteOid === null
        ? null
        : { remote: request.remote, oid: remoteOid, disposition: landed ? "delete" as const : "retain" as const },
    };
    return {
      status: "authorized",
      authorization: "merged-preserved",
      authorityVersion: canonicalDigest({ request, evidence, refs }),
      evidence,
      refs,
    };
  };
  return {
    authorize,
    revalidate: async (request, proof) => {
      const current = await authorize(request);
      return current.status === "authorized" && current.authorityVersion === proof.authorityVersion
        ? { status: "valid" }
        : { status: "refused", reason: "authority-conflict" };
    },
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
  const recordRef = evidence.transition === "decompose" ? baseRef : stamp.sha;
  try {
    const path = resolveRetirementRecordRelativePath(evidence.receiptId);
    const { stdout } = await exec("git", ["show", `${recordRef}:${path}`]);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const subject = parsed.subject as WorktreeSubject | undefined;
    const source = parsed.source as { branch?: unknown; head?: unknown } | undefined;
    const result = parsed.result as Record<string, unknown> | undefined;
    if (
      parsed.receiptId !== evidence.receiptId
      || parsed.transition !== evidence.transition
      || subject === undefined
      || !worktreeSubjectsEqual(subject, stamp.subject)
      || source?.branch !== stamp.branch
      || canonicalDigest(result) !== evidence.resultDigest
    ) return false;
    if (evidence.transition === "decompose") {
      if (source.head !== stamp.sha || result?.kind !== "decompose" || !Array.isArray(result.targets)) return false;
      for (const target of result.targets as Array<{ path?: unknown; artifactDigest?: unknown }>) {
        if (typeof target.path !== "string" || typeof target.artifactDigest !== "string") return false;
        if (await readArtifactGroupDigest(exec, baseRef, target.path, readBlob) !== target.artifactDigest) return false;
      }
      return true;
    }
    const { stdout: parent } = await exec("git", ["rev-parse", `${stamp.sha}^`]);
    if (source.head !== parent.trim()) return false;
    if (evidence.transition === "park-planning") {
      if (stamp.subject.kind !== "work-unit" || result?.kind !== "relocate") return false;
      return await readArtifactGroupDigest(exec, baseRef, `.arc/backlog/planned/${stamp.subject.name}`, readBlob)
        === result.plannedArtifactDigest;
    }
    return result?.kind === "discard";
  } catch {
    return false;
  }
}

async function authorizeReceiptRetirement(
  exec: GitExec,
  baseRef: string,
  request: TeardownAuthorizationRequest,
): Promise<TeardownAuthorizationDecision> {
  const receipt = await readCommittedRetirementReceipt(exec, request, baseRef);
  if (receipt === null) return { status: "refused", reason: "evidence-missing" };
  let remoteOid: string | null;
  try {
    remoteOid = await readRemoteOid(exec, request);
  } catch {
    return { status: "refused", reason: "authority-unavailable" };
  }
  if (remoteOid !== null && remoteOid !== request.head) return { status: "refused", reason: "projection-mismatch" };
  const expectedLifecycle = receipt.transition === "park-planning" ? "planned" as const : "nonexistent" as const;
  const evidence = {
    kind: "receipt" as const,
    receiptId: receipt.receiptId,
    transition: receipt.transition,
    expectedLifecycle,
    resultDigest: canonicalDigest(receipt.result),
  };
  const refs = {
    localOid: request.head,
    remote: remoteOid === null ? null : { remote: request.remote, oid: remoteOid, disposition: "delete" as const },
  };
  return {
    status: "authorized",
    authorization: receipt.authorization,
    authorityVersion: canonicalDigest({ request, evidence, refs }),
    evidence,
    refs,
  };
}

async function readRemoteOid(exec: GitExec, request: TeardownAuthorizationRequest): Promise<string | null> {
  try {
    await exec("git", ["remote", "get-url", request.remote]);
  } catch {
    return null;
  }
  const { stdout } = await exec("git", ["ls-remote", "--heads", request.remote, `refs/heads/${request.branch}`]);
  return stdout.trim().split(/\s+/u)[0] || null;
}

async function readCommittedRetirementReceipt(
  exec: GitExec,
  request: TeardownAuthorizationRequest,
  baseRef: string,
): Promise<RetirementReceipt | null> {
  const candidates: RetirementReceipt[] = [];
  for (const ref of [request.head, baseRef]) {
    try {
      const { stdout } = await exec("git", [
        "ls-tree", "--full-tree", "-r", "--name-only", ref, "--", RETIREMENT_RECORD_NAMESPACE,
      ]);
      for (const path of stdout.split("\n").map((item) => item.trim()).filter((item) => item.endsWith(".json"))) {
        try {
          const { stdout: content } = await exec("git", ["show", `${ref}:${path}`]);
          const receipt = JSON.parse(content) as RetirementReceipt;
          if (
            worktreeSubjectsEqual(receipt.subject, request.subject)
            && receipt.source.branch === request.branch
            && !candidates.some((candidate) => candidate.receiptId === receipt.receiptId)
          ) candidates.push(receipt);
        } catch {
          // A malformed record cannot authorize teardown.
        }
      }
    } catch {
      // An unavailable projection contributes no evidence.
    }
  }
  if (candidates.length !== 1) return null;
  const receipt = candidates[0];
  if (receipt === undefined) return null;
  if (receipt.transition === "decompose") return receipt.source.head === request.head ? receipt : null;
  try {
    const { stdout } = await exec("git", ["rev-parse", `${request.head}^`]);
    return receipt.source.head === stdout.trim() ? receipt : null;
  } catch {
    return null;
  }
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

async function readArtifactGroupDigest(
  exec: GitExec,
  ref: string,
  directory: string,
  readBlob?: TeardownBlobReader,
): Promise<ReturnType<typeof artifactGroupDigest> | null> {
  const { stdout } = await exec("git", ["ls-tree", "--full-tree", "-r", "--name-only", ref, "--", directory]);
  const paths = stdout.split("\n").map((path) => path.trim()).filter((path) => path !== "");
  if (paths.length === 0) return null;
  const entries = await Promise.all(paths.map(async (path): Promise<ArtifactSetEntry> => {
    const managedPath = validateManagedPath(path);
    const bytes = readBlob === undefined
      ? Buffer.from((await exec("git", ["show", `${ref}:${path}`])).stdout)
      : await readBlob(ref, managedPath);
    if (bytes === null) throw new Error(`Git tree blob disappeared: ${ref}:${path}`);
    return {
      path: managedPath,
      state: "present",
      contentDigest: contentDigest(bytes),
    };
  }));
  return artifactGroupDigest(entries);
}
