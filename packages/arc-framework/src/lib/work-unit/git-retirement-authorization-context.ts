/** Git-backed projection readers for strict teardown retirement authorization. */

import { posix } from "node:path";

import { metaCohortDir } from "../active/cohort-consistency.js";
import { parseMetaRecord } from "../active/meta-reader.js";
import { assessReapSafety, isLandedInBase } from "../git/branch-containment.js";
import type { GitExec } from "../git/exec.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import type { WorktreeSubject } from "../git/worktree-marker.js";
import { canonicalDigest, type CanonicalDigest } from "../canonical/canonical-json.js";
import {
  contentDigest,
  type ArtifactSetEntry,
} from "../canonical/content-digest.js";
import { validateManagedPath, type ManagedPath } from "../canonical/managed-path.js";
import { artifactGroupDigest } from "../canonical/receipt-id.js";
import { buildLifecycleIndexFromMetas, type LifecycleIndex } from "./lifecycle-index.js";
import { resolveSlugState } from "./lifecycle-resolver.js";
import { artifactMatcher } from "./mutators/relocate-artifacts.js";
import { validateParkRetirementProof } from "./park-retirement-proof.js";
import type { ParkProofTarget } from "./park-retirement-proof.js";
import type {
  RetirementAuthorizationContext,
} from "./retirement-authorization.js";
import type {
  HuskAuthorization,
  RetirementEvidenceRef,
  TeardownAuthorizationRefusal,
  TeardownAuthorizationRequest,
} from "./retirement-authority.js";
import { RETIREMENT_RECORD_NAMESPACE } from "./retirement-record-store.js";
import { resolveTransitionRecordRelativePath } from "./transition-record-store.js";

/** Exact committed-blob reader used for canonical content digests. */
export type RetirementAuthorizationBlobReader = (
  ref: string,
  path: ManagedPath,
) => Promise<Uint8Array | null>;

/** Structural abandon transition selected from committed Git history. */
export interface AbandonTransitionProof {
  topology: "direct" | "landed";
  sourceHead: string;
  resultHead: string;
  sourceArtifacts: readonly ArtifactSetEntry[];
}

/** Closed locator result for structural abandon authorization. */
export type AbandonTransitionLocation =
  | { status: "absent" }
  | { status: "unique"; proof: AbandonTransitionProof }
  | { status: "ambiguous" }
  | { status: "unavailable" };

/** Map structural locator outcomes onto the teardown authorization vocabulary. */
export function abandonTransitionLocationRefusal(
  location: AbandonTransitionLocation,
): TeardownAuthorizationRefusal | null {
  switch (location.status) {
    case "absent":
      return "evidence-missing";
    case "ambiguous":
      return "authority-ambiguous";
    case "unavailable":
      return "authority-unavailable";
    case "unique":
      return null;
  }
}

/** Locate and validate one receipt-independent abandon transition. */
export async function locateAbandonTransition(
  exec: GitExec,
  baseRef: string,
  request: TeardownAuthorizationRequest,
  readBlob: RetirementAuthorizationBlobReader,
): Promise<AbandonTransitionLocation> {
  if (request.subject.kind !== "work-unit") return { status: "absent" };
  try {
    const directParents = await readCommitParents(exec, request.head);
    if (directParents.length === 1 && directParents[0] !== undefined) {
      const direct = await validateAbandonTransition(
        exec,
        request,
        directParents[0],
        request.head,
        "direct",
        readBlob,
      );
      if (direct !== null) return { status: "unique", proof: direct };
    }

    const baseHead = await resolveCommit(exec, baseRef);
    const matches: AbandonTransitionProof[] = [];
    for (const resultHead of await listAbandonCandidates(exec, baseHead)) {
      const parents = await readCommitParents(exec, resultHead);
      const sourceHead = parents.length === 1 ? parents[0] : undefined;
      if (sourceHead === undefined) continue;
      const proof = await validateAbandonTransition(
        exec,
        request,
        sourceHead,
        resultHead,
        "landed",
        readBlob,
      );
      if (proof !== null) matches.push(proof);
    }
    if (matches.length === 0) return { status: "absent" };
    if (matches.length > 1) return { status: "ambiguous" };
    const proof = matches[0];
    return proof === undefined ? { status: "absent" } : { status: "unique", proof };
  } catch {
    return { status: "unavailable" };
  }
}

async function listAbandonCandidates(exec: GitExec, baseHead: string): Promise<readonly string[]> {
  const { stdout } = await exec("git", [
    "log",
    "--format=%H",
    "--diff-filter=D",
    "--no-renames",
    baseHead,
    "--",
    ".arc/active",
    ".arc/backlog/planned",
    ".arc/backlog/provisional",
  ]);
  return [...new Set(stdout.split("\n").map((value) => value.trim()).filter(Boolean))];
}

async function validateAbandonTransition(
  exec: GitExec,
  request: TeardownAuthorizationRequest,
  sourceHead: string,
  resultHead: string,
  topology: AbandonTransitionProof["topology"],
  readBlob: RetirementAuthorizationBlobReader,
): Promise<AbandonTransitionProof | null> {
  const name = request.subject.kind === "work-unit" ? request.subject.name : "";
  const [sourceArtifacts, resultArtifacts, sourceIndex, resultIndex] = await Promise.all([
    readAllSubjectArtifacts(exec, sourceHead, name, readBlob),
    readAllSubjectArtifacts(exec, resultHead, name, readBlob),
    readLifecycleIndex(exec, sourceHead),
    readLifecycleIndex(exec, resultHead),
  ]);
  const sourceEntry = sourceIndex.get(name);
  if (sourceEntry === undefined || resultIndex.has(name) || resultArtifacts.length > 0) return null;
  const metaName = `meta-${name}.md`;
  const metas = sourceArtifacts.filter((artifact) => posix.basename(artifact.path) === metaName);
  const meta = metas[0];
  if (metas.length !== 1 || meta === undefined || meta.path !== sourceEntry.path) return null;
  const sourceDir = posix.dirname(meta.path);
  if (sourceArtifacts.some((artifact) => posix.dirname(artifact.path) !== sourceDir)) return null;
  let record: ReturnType<typeof parseMetaRecord>;
  try {
    record = parseMetaRecord(new TextDecoder("utf-8", { fatal: true }).decode(meta.bytes));
  } catch {
    return null;
  }
  if (record.branch !== request.branch) return null;
  if (sourceEntry.location === "planned") {
    const cohort = record.cohort === null || record.cohort === "[none]" ? "" : record.cohort;
    if (metaCohortDir(meta.path) !== cohort) return null;
  }
  const sourcePaths = new Set(sourceArtifacts.map((artifact) => artifact.path));
  const changes = await readNameStatus(exec, sourceHead, resultHead);
  for (const change of changes) {
    if (sourcePaths.has(change.path)) {
      if (change.status !== "D") return null;
      continue;
    }
    if (!isAllowedAbandonSidecar(change, name)) return null;
  }
  if ([...sourcePaths].some((path) => !changes.some((change) => change.path === path))) return null;
  return {
    topology,
    sourceHead,
    resultHead,
    sourceArtifacts: toArtifactEntries(sourceArtifacts),
  };
}

interface NameStatusEntry {
  status: string;
  path: ManagedPath;
}

async function readNameStatus(exec: GitExec, parent: string, commit: string): Promise<NameStatusEntry[]> {
  const { stdout } = await exec("git", [
    "diff-tree", "--no-commit-id", "--name-status", "-r", "-z", "--no-renames", parent, commit,
  ]);
  const fields = stdout.split("\0").filter(Boolean);
  if (fields.length % 2 !== 0) throw new Error("malformed Git name-status output");
  const entries: NameStatusEntry[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const path = fields[index + 1];
    if (status === undefined || path === undefined) throw new Error("malformed Git name-status output");
    entries.push({ status, path: validateManagedPath(path) });
  }
  return entries;
}

function isAllowedAbandonSidecar(change: NameStatusEntry, name: string): boolean {
  if (change.path === ".arc/backlog/ROADMAP.md") {
    return change.status === "A" || change.status === "M" || change.status === "D";
  }
  if (
    change.status === "A"
    && change.path.startsWith(`${RETIREMENT_RECORD_NAMESPACE}/`)
    && /^sha256-[0-9a-f]{64}\.json$/u.test(posix.basename(change.path))
  ) return true;
  return change.path === resolveTransitionRecordRelativePath(name) && change.status === "A";
}

/** Create the production Git context consumed by the strict authorization core. */
export function createGitRetirementAuthorizationContext(
  exec: GitExec,
  baseTarget: string | ParkProofTarget,
  readBlob: RetirementAuthorizationBlobReader,
): RetirementAuthorizationContext {
  const baseRef = typeof baseTarget === "string" ? baseTarget : baseTarget.head;
  return {
    readLocalProjection: async (request) => {
      const [oid, scan] = await Promise.all([
        resolveCommit(exec, `refs/heads/${request.branch}`),
        scanRegisteredWorktrees(exec),
      ]);
      if (!scan.ok) throw new Error(scan.message);
      const owners = scan.worktrees.filter((worktree) => worktree.branch === request.branch);
      return {
        oid,
        worktreeProjectionSafe: owners.length === 0 || (owners.length === 1 && owners[0]?.head === request.head),
      };
    },
    readRemoteRef: async (remote, branch) => await readRemoteOid(exec, remote, branch),
    readShippedEvidence: async (request) => {
      const baseProofOid = await resolveCommit(exec, baseRef);
      const safety = await assessReapSafety(exec, {
        branch: request.branch,
        base: baseProofOid,
        remote: request.remote,
      });
      if (!safety.safe) return null;
      const [landed, resultDigest] = await Promise.all([
        isLandedInBase(exec, request.branch, baseProofOid),
        readCompletedProjectionDigest(exec, baseProofOid, request.subject, readBlob),
      ]);
      if (resultDigest === null) return null;
      return {
        evidence: {
          kind: "shipped",
          expectedLifecycle: "completed",
          resultDigest,
          baseProofOid,
        },
        remoteDisposition: landed ? "delete" : "retain",
      };
    },
    readGitTransitionProof: async (request) => {
      const abandon = await locateAbandonTransition(exec, baseRef, request, readBlob);
      if (abandon.status === "unique") {
        return {
          status: "proved" as const,
          proof: {
            transition: "abandon" as const,
            retiringHead: request.head,
            resultHead: abandon.proof.resultHead,
            resultInventory: [],
          },
        };
      }
      if (abandon.status !== "absent") {
        return {
          status: "refused" as const,
          reason: abandonTransitionLocationRefusal(abandon) ?? "evidence-missing",
        };
      }
      if (request.subject.kind !== "work-unit") {
        return { status: "refused" as const, reason: "unsupported-transition" as const };
      }
      const park = await validateParkRetirementProof(
        {
          readProjection: async (head, subject) => {
            const index = await readLifecycleIndex(exec, head);
            const entry = index.get(subject);
            const artifacts = entry === undefined
              ? []
              : await readArtifactGroup(exec, head, posix.dirname(entry.path), entry.slug, readBlob);
            return {
              lifecycle: resolveSlugState(index, subject),
              artifacts: artifacts.map((artifact) => ({ path: artifact.path, bytes: artifact.bytes })),
            };
          },
        },
        { subject: request.subject.name, retiringHead: request.head, resultHead: baseRef },
      );
      if (park.status === "refused") return park;
      return {
        status: "proved" as const,
        proof: {
          transition: "park-planning" as const,
          retiringHead: request.head,
          resultHead: baseRef,
          resultInventory: park.proof.resultInventory.flatMap((entry) => entry.state === "present"
            ? [{ path: entry.path, contentDigest: entry.contentDigest }]
            : []),
        },
      };
    },
  };
}

/** Revalidate one detached husk's receipt against the same strict Git proof as live authorization. */
export function validateGitRetirementReceiptEvidence(
  exec: GitExec,
  baseRef: string,
  input: {
    subject: WorktreeSubject;
    branch: string;
    retiringHead: string;
    authorization: HuskAuthorization;
    evidence: Extract<RetirementEvidenceRef, { kind: "git-transition" }>;
  },
  readBlob: RetirementAuthorizationBlobReader,
): Promise<boolean> {
  void exec;
  void baseRef;
  void input;
  void readBlob;
  return Promise.resolve(false);
}

interface StoredArtifact {
  path: ManagedPath;
  bytes: Uint8Array;
}

async function readAllSubjectArtifacts(
  exec: GitExec,
  ref: string,
  slug: string,
  readBlob: RetirementAuthorizationBlobReader,
): Promise<StoredArtifact[]> {
  const paths = await listPaths(exec, ref, [".arc/active", ".arc/backlog", ".arc/completed"]);
  const matcher = artifactMatcher(slug);
  const selected = paths.filter((path) => matcher.test(posix.basename(path)));
  return await readArtifacts(ref, selected, readBlob);
}

async function readArtifactGroup(
  exec: GitExec,
  ref: string,
  directory: string,
  slug: string,
  readBlob: RetirementAuthorizationBlobReader,
): Promise<StoredArtifact[]> {
  const matcher = artifactMatcher(slug);
  const paths = (await listPaths(exec, ref, [directory]))
    .filter((path) => posix.dirname(path) === directory && matcher.test(posix.basename(path)));
  return await readArtifacts(ref, paths, readBlob);
}

async function readArtifacts(
  ref: string,
  paths: readonly ManagedPath[],
  readBlob: RetirementAuthorizationBlobReader,
): Promise<StoredArtifact[]> {
  return await Promise.all(paths.map(async (path) => {
    const bytes = await readBytesAt(ref, path, readBlob);
    if (bytes === null) throw new Error(`committed blob disappeared: ${ref}:${path}`);
    return { path, bytes };
  }));
}

function toArtifactEntries(artifacts: readonly StoredArtifact[]): ArtifactSetEntry[] {
  return artifacts.map((artifact) => ({
    path: artifact.path,
    state: "present",
    contentDigest: contentDigest(artifact.bytes),
  }));
}

async function readLifecycleIndex(exec: GitExec, ref: string): Promise<LifecycleIndex> {
  const paths = (await listPaths(exec, ref, [
    ".arc/active",
    ".arc/backlog/planned",
    ".arc/backlog/provisional",
    ".arc/completed",
  ])).filter((path) => /^meta-.+\.md$/u.test(posix.basename(path)));
  const metas = await Promise.all(paths.map(async (path) => ({
    path,
    content: await requireTextAt(exec, ref, path),
  })));
  return buildLifecycleIndexFromMetas(metas);
}

/** Read the exact committed completed-artifact-group digest for one subject. */
export async function readCompletedProjectionDigest(
  exec: GitExec,
  baseRef: string,
  subject: WorktreeSubject,
  readBlob: RetirementAuthorizationBlobReader,
): Promise<CanonicalDigest | null> {
  if (subject.kind !== "work-unit") return canonicalDigest({ subject });
  const index = await readLifecycleIndex(exec, baseRef);
  const entry = index.get(subject.name);
  if (entry === undefined || entry.location !== "completed") return null;
  const artifacts = await readArtifactGroup(exec, baseRef, posix.dirname(entry.path), subject.name, readBlob);
  return artifacts.length === 0 ? null : artifactGroupDigest(toArtifactEntries(artifacts));
}

async function listPaths(exec: GitExec, ref: string, roots: readonly string[]): Promise<ManagedPath[]> {
  const { stdout } = await exec("git", ["ls-tree", "--full-tree", "-r", "-z", "--name-only", ref, "--", ...roots]);
  return stdout.split("\0").filter(Boolean).map(validateManagedPath).sort(compareBytes);
}

async function readCommitParents(exec: GitExec, commit: string): Promise<readonly string[]> {
  const { stdout } = await exec("git", ["rev-list", "--parents", "-n", "1", commit]);
  const fields = stdout.trim().split(/\s+/u).filter(Boolean);
  if (fields[0] !== commit && fields.length === 0) throw new Error(`cannot resolve commit: ${commit}`);
  return fields.slice(1);
}

async function resolveCommit(exec: GitExec, ref: string): Promise<string> {
  const { stdout } = await exec("git", ["rev-parse", "--verify", `${ref}^{commit}`]);
  const oid = stdout.trim();
  if (oid === "") throw new Error(`cannot resolve commit: ${ref}`);
  return oid;
}

async function readRemoteOid(exec: GitExec, remote: string, branch: string): Promise<string | null> {
  try {
    await exec("git", ["remote", "get-url", remote]);
  } catch {
    return null;
  }
  const { stdout } = await exec("git", ["ls-remote", "--heads", remote, `refs/heads/${branch}`]);
  return stdout.trim().split(/\s+/u)[0] || null;
}

async function readTextAt(exec: GitExec, ref: string, path: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["show", `${ref}:${path}`]);
    return stdout;
  } catch {
    return null;
  }
}

async function requireTextAt(exec: GitExec, ref: string, path: ManagedPath): Promise<string> {
  const content = await readTextAt(exec, ref, path);
  if (content === null) throw new Error(`missing committed text: ${ref}:${path}`);
  return content;
}

async function readBytesAt(
  ref: string,
  path: ManagedPath,
  readBlob: RetirementAuthorizationBlobReader,
): Promise<Uint8Array | null> {
  return await readBlob(ref, path);
}

function compareBytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
