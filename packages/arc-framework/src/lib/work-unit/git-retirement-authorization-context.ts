/** Git-backed projection readers for strict teardown retirement authorization. */

import { posix } from "node:path";

import { assessReapSafety, isLandedInBase } from "../git/branch-containment.js";
import type { GitExec } from "../git/exec.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import type { WorktreeSubject } from "../git/worktree-marker.js";
import { canonicalDigest, canonicalize, type CanonicalDigest } from "../canonical/canonical-json.js";
import {
  contentDigest,
  deleteOperation,
  writeOperation,
  type ArtifactSetEntry,
  type PatchOperation,
} from "../canonical/content-digest.js";
import { validateManagedPath, type ManagedPath } from "../canonical/managed-path.js";
import { artifactGroupDigest, preparationId, receiptId, type RetirementTransition } from "../canonical/receipt-id.js";
import { scanDecomposeContent, resolveDecomposeContentLocator } from "./decompose-content.js";
import {
  retirementAllocationRefusal,
  type DecomposeAllocationEntry,
  type DecomposeAllocationMap,
} from "./decompose-cut-map.js";
import {
  decomposeInventoryDigests,
  deriveDecomposeInventories,
  verifyDecomposeInventoryCoverage,
  type DecomposeInventories,
  type DecomposeSourceArtifact,
} from "./decompose-inventory.js";
import { replaceDependencySlot } from "./decompose-sweep.js";
import { buildLifecycleIndexFromMetas, type LifecycleIndex } from "./lifecycle-index.js";
import { resolveSlugState } from "./lifecycle-resolver.js";
import { artifactMatcher } from "./mutators/relocate-artifacts.js";
import { validateParkRetirementProof } from "./park-retirement-proof.js";
import type {
  RetirementAuthorizationContext,
  RetirementReceiptCandidate,
} from "./retirement-authorization.js";
import type {
  HuskAuthorization,
  RetirementEvidenceRef,
  RetirementReceipt,
  TeardownAuthorizationRefusal,
  TeardownAuthorizationRequest,
} from "./retirement-authority.js";
import {
  validateReceiptMatrix,
  worktreeSubjectsEqual,
} from "./retirement-authority.js";
import { parseRetirementReceipt } from "./retirement-receipt-codec.js";
import { resolveRetirementRecordRelativePath } from "./retirement-record-store.js";
import { validateRetirementReceiptRelation } from "./retirement-relation.js";

/** Exact committed-blob reader used for canonical content digests. */
export type RetirementAuthorizationBlobReader = (
  ref: string,
  path: ManagedPath,
) => Promise<Uint8Array | null>;

/** Create the production Git context consumed by the strict authorization core. */
export function createGitRetirementAuthorizationContext(
  exec: GitExec,
  baseRef: string,
  readBlob?: RetirementAuthorizationBlobReader,
): RetirementAuthorizationContext {
  const relationContext = createRelationContext(exec, readBlob);

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
        ownedByRetiringWorktree: owners.length === 1 && owners[0]?.head === request.head,
      };
    },
    readRemoteRef: async (remote, branch) => await readRemoteOid(exec, remote, branch),
    readShippedEvidence: async (request) => {
      const safety = await assessReapSafety(exec, {
        branch: request.branch,
        base: baseRef,
        remote: request.remote,
      });
      if (!safety.safe) return null;
      const [baseProofOid, landed, resultDigest] = await Promise.all([
        resolveCommit(exec, baseRef),
        isLandedInBase(exec, request.branch, baseRef),
        readCompletedProjectionDigest(exec, baseRef, request.subject, readBlob),
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
    readReceiptCandidates: async (request) => await readReceiptCandidates(exec, baseRef, request),
    validateReceiptRelation: async (receipt, projection) => await validateRetirementReceiptRelation(
      relationContext,
      receipt,
      projection,
    ),
    validateReceiptResult: async (receipt, projection) => await validateReceiptResult(
      exec,
      receipt,
      projection,
      readBlob,
    ),
  };
}

/** Revalidate one detached husk's receipt against the same strict Git proof as live authorization. */
export async function validateGitRetirementReceiptEvidence(
  exec: GitExec,
  baseRef: string,
  input: {
    subject: WorktreeSubject;
    branch: string;
    retiringHead: string;
    authorization: HuskAuthorization;
    evidence: Extract<RetirementEvidenceRef, { kind: "receipt" }>;
  },
  readBlob?: RetirementAuthorizationBlobReader,
): Promise<boolean> {
  try {
    const recordRef = input.evidence.transition === "decompose" ? baseRef : input.retiringHead;
    const content = await readTextAt(
      exec,
      recordRef,
      resolveRetirementRecordRelativePath(input.evidence.receiptId),
    );
    if (content === null) return false;
    const receipt = parseRetirementReceipt(content);
    if (
      receipt === null
      || receipt.receiptId !== input.evidence.receiptId
      || receipt.transition !== input.evidence.transition
      || !worktreeSubjectsEqual(receipt.subject, input.subject)
      || receipt.source.branch !== input.branch
      || receipt.authorization !== input.authorization
      || canonicalDigest(receipt.result) !== input.evidence.resultDigest
      || validateReceiptMatrix(receipt, input.evidence.expectedLifecycle) !== null
    ) return false;
    const projection = {
      retiringHead: input.retiringHead,
      resultHead: input.evidence.transition === "abandon" ? input.retiringHead : baseRef,
    };
    const relation = await validateRetirementReceiptRelation(
      createRelationContext(exec, readBlob),
      receipt,
      projection,
    );
    if (relation !== null) return false;
    return await validateReceiptResult(exec, receipt, projection, readBlob) === null;
  } catch {
    return false;
  }
}

function createRelationContext(
  exec: GitExec,
  readBlob?: RetirementAuthorizationBlobReader,
): Parameters<typeof validateRetirementReceiptRelation>[0] {
  return {
    readCommitParents: (commit: string) => readCommitParents(exec, commit),
    readRecord: (commit: string, id: CanonicalDigest) => readTextAt(
      exec,
      commit,
      resolveRetirementRecordRelativePath(id),
    ),
    readPatchOperations: (
      parent: string,
      commit: string,
      excludedReceiptId: CanonicalDigest,
    ) => readPatchOperations(exec, parent, commit, excludedReceiptId, readBlob),
  };
}

async function readReceiptCandidates(
  exec: GitExec,
  baseRef: string,
  request: TeardownAuthorizationRequest,
): Promise<readonly RetirementReceiptCandidate[]> {
  let directParent: string | null = null;
  try {
    directParent = (await readCommitParents(exec, request.head))[0] ?? null;
  } catch {
    // A root commit cannot carry a valid direct-transition receipt.
  }
  const lookups: Array<{ transition: RetirementTransition; sourceHead: string; ref: string }> = [
    { transition: "decompose", sourceHead: request.head, ref: baseRef },
  ];
  if (directParent !== null) {
    lookups.push(
      { transition: "abandon", sourceHead: directParent, ref: request.head },
      { transition: "park-planning", sourceHead: directParent, ref: request.head },
    );
  }

  const candidates: RetirementReceiptCandidate[] = [];
  for (const lookup of lookups) {
    const id = receiptId({
      schemaVersion: 1,
      subject: request.subject,
      transition: lookup.transition,
      sourceBranch: request.branch,
      sourceHead: lookup.sourceHead,
    });
    const content = await readTextAt(exec, lookup.ref, resolveRetirementRecordRelativePath(id));
    if (content === null) continue;
    const receipt = parseRetirementReceipt(content);
    if (receipt === null || receipt.transition !== lookup.transition) continue;
    candidates.push({
      receipt,
      resultHead: lookup.transition === "abandon" ? request.head : baseRef,
    });
  }
  return candidates;
}

async function validateReceiptResult(
  exec: GitExec,
  receipt: RetirementReceipt,
  projection: { retiringHead: string; resultHead: string },
  readBlob?: RetirementAuthorizationBlobReader,
): Promise<TeardownAuthorizationRefusal | null> {
  if (receipt.subject.kind !== "work-unit") return "unsupported-transition";
  switch (receipt.transition) {
    case "abandon":
      return await validateAbandonResult(exec, receipt, projection.retiringHead, readBlob);
    case "park-planning":
      return await validateParkRetirementProof(
        {
          readProjection: async (head, candidate) => {
            const index = await readLifecycleIndex(exec, head);
            const entry = index.get(candidate.subject.kind === "work-unit" ? candidate.subject.name : "");
            const artifacts = entry === undefined
              ? []
              : await readArtifactGroup(exec, head, posix.dirname(entry.path), entry.slug, readBlob);
            const record = await readBytesAt(
              exec,
              head,
              validateManagedPath(resolveRetirementRecordRelativePath(candidate.receiptId)),
              readBlob,
            );
            return {
              lifecycle: candidate.subject.kind === "work-unit"
                ? resolveSlugState(index, candidate.subject.name)
                : "nonexistent",
              receiptBytes: record,
              artifacts: artifacts.map((artifact) => ({ path: artifact.path, bytes: artifact.bytes })),
            };
          },
        },
        receipt,
        projection,
      );
    case "decompose":
      return await validateDecomposeResult(exec, receipt, projection, readBlob);
  }
}

async function validateAbandonResult(
  exec: GitExec,
  receipt: RetirementReceipt,
  retiringHead: string,
  readBlob?: RetirementAuthorizationBlobReader,
): Promise<TeardownAuthorizationRefusal | null> {
  if (receipt.result.kind !== "discard" || receipt.retiringProjection.kind !== "direct-transition") {
    return "evidence-mismatch";
  }
  const name = receipt.subject.kind === "work-unit" ? receipt.subject.name : "";
  const [sourceArtifacts, resultArtifacts, resultIndex] = await Promise.all([
    readAllSubjectArtifacts(exec, receipt.source.head, name, readBlob),
    readAllSubjectArtifacts(exec, retiringHead, name, readBlob),
    readLifecycleIndex(exec, retiringHead),
  ]);
  if (sourceArtifacts.length === 0 || artifactGroupDigest(toArtifactEntries(sourceArtifacts)) !== receipt.source.artifactDigest) {
    return "evidence-mismatch";
  }
  return resultArtifacts.length === 0 && !resultIndex.has(name) ? null : "projection-mismatch";
}

async function validateDecomposeResult(
  exec: GitExec,
  receipt: RetirementReceipt,
  projection: { retiringHead: string; resultHead: string },
  readBlob?: RetirementAuthorizationBlobReader,
): Promise<TeardownAuthorizationRefusal | null> {
  if (receipt.result.kind !== "decompose" || receipt.retiringProjection.kind !== "unchanged") {
    return "evidence-mismatch";
  }
  const name = receipt.subject.kind === "work-unit" ? receipt.subject.name : "";
  const allocation = receipt.result.allocation;
  if (retirementAllocationRefusal(allocation, { ownerlessSourceIds: [] }) !== null) {
    return "conservation-unproven";
  }
  const parents = await readCommitParents(exec, projection.resultHead);
  const allocationParent = parents.length === 1 ? parents[0] : undefined;
  if (allocationParent === undefined) return "evidence-mismatch";

  const [sourceArtifacts, sourceIndex, resultIndex] = await Promise.all([
    readAllSubjectArtifacts(exec, receipt.source.head, name, readBlob),
    readLifecycleIndex(exec, receipt.source.head),
    readLifecycleIndex(exec, projection.resultHead),
  ]);
  if (sourceArtifacts.length === 0 || artifactGroupDigest(toArtifactEntries(sourceArtifacts)) !== receipt.source.artifactDigest) {
    return "evidence-mismatch";
  }
  const inventoryResult = deriveDecomposeInventories({
    originSlug: name,
    sourceArtifacts: sourceArtifacts.map((artifact): DecomposeSourceArtifact => ({
      path: artifact.path,
      bytes: artifact.bytes,
    })),
    lifecycleIndex: sourceIndex,
  });
  if (inventoryResult.status === "rejected") return "conservation-unproven";
  const digests = decomposeInventoryDigests(inventoryResult.inventories);
  if (
    canonicalDigest(allocation) !== receipt.result.cutMapDigest
    || digests.sourceInventoryDigest !== receipt.result.sourceInventoryDigest
    || digests.incomingEdgeInventoryDigest !== receipt.result.incomingEdgeInventoryDigest
    || digests.outgoingEdgeInventoryDigest !== receipt.result.outgoingEdgeInventoryDigest
    || verifyDecomposeInventoryCoverage(allocation, inventoryResult.inventories).status !== "covered"
    || preparationId({
      receiptId: receipt.receiptId,
      baseHead: allocationParent,
      sourceInventoryDigest: receipt.result.sourceInventoryDigest,
      incomingEdgeInventoryDigest: receipt.result.incomingEdgeInventoryDigest,
      outgoingEdgeInventoryDigest: receipt.result.outgoingEdgeInventoryDigest,
      cutMapDigest: receipt.result.cutMapDigest,
    }) !== receipt.result.preparationId
  ) return "conservation-unproven";
  if (resultIndex.has(name)) return "projection-mismatch";

  const targetFacts = await readDecomposeTargetFacts(exec, projection.resultHead, allocation, resultIndex, readBlob);
  if (targetFacts === null || canonicalize(targetFacts.targets) !== canonicalize(receipt.result.targets)) {
    return "conservation-unproven";
  }
  if (!await sourceAllocationsResolve(exec, projection.resultHead, allocation, targetFacts.paths, readBlob)) {
    return "conservation-unproven";
  }
  if (!dependencyAllocationMatches(allocation, inventoryResult.inventories, resultIndex)) {
    return "conservation-unproven";
  }
  return null;
}

interface TargetFacts {
  targets: Array<{ path: string; artifactDigest: CanonicalDigest }>;
  paths: Map<string, Map<string, ManagedPath>>;
}

async function readDecomposeTargetFacts(
  exec: GitExec,
  ref: string,
  allocation: DecomposeAllocationMap,
  index: LifecycleIndex,
  readBlob?: RetirementAuthorizationBlobReader,
): Promise<TargetFacts | null> {
  const targets: TargetFacts["targets"] = [];
  const paths = new Map<string, Map<string, ManagedPath>>();
  for (const entry of allocation.entries) {
    if (entry.kind === "surviving-origin") return null;
    const resolved = await readAllocationTarget(exec, ref, entry, index, readBlob);
    if (resolved === null) return null;
    targets.push({ path: resolved.root, artifactDigest: artifactGroupDigest(toArtifactEntries(resolved.artifacts)) });
    paths.set(entry.destinationId, new Map(resolved.artifacts.map((artifact) => [posix.basename(artifact.path), artifact.path])));
  }
  targets.sort((left, right) => compareBytes(left.path, right.path));
  return { targets, paths };
}

async function readAllocationTarget(
  exec: GitExec,
  ref: string,
  entry: DecomposeAllocationEntry,
  index: LifecycleIndex,
  readBlob?: RetirementAuthorizationBlobReader,
): Promise<{ root: string; artifacts: StoredArtifact[] } | null> {
  if (entry.kind === "surviving-origin") return null;
  if (entry.kind === "new-member") {
    const indexed = index.get(entry.slug);
    if (indexed === undefined) return null;
    const root = posix.dirname(indexed.path);
    return { root, artifacts: await readArtifactGroup(exec, ref, root, entry.slug, readBlob) };
  }
  if (entry.kind === "existing-home") {
    if (entry.target.kind === "document") {
      const path = validateManagedPath(entry.target.path);
      const bytes = await readBytesAt(exec, ref, path, readBlob);
      return bytes === null ? null : { root: path, artifacts: [{ path, bytes }] };
    }
    const indexed = index.get(entry.target.slug);
    if (indexed === undefined) return null;
    const root = posix.dirname(indexed.path);
    return { root, artifacts: await readArtifactGroup(exec, ref, root, entry.target.slug, readBlob) };
  }
  const path = validateManagedPath(
    `.arc/backlog/planned/${entry.cohort}/cohort-${posix.basename(entry.cohort)}.md`,
  );
  const bytes = await readBytesAt(exec, ref, path, readBlob);
  return bytes === null ? null : { root: posix.dirname(path), artifacts: [{ path, bytes }] };
}

async function sourceAllocationsResolve(
  exec: GitExec,
  ref: string,
  allocation: DecomposeAllocationMap,
  paths: ReadonlyMap<string, ReadonlyMap<string, ManagedPath>>,
  readBlob?: RetirementAuthorizationBlobReader,
): Promise<boolean> {
  for (const source of allocation.sourceAllocations) {
    if (source.disposition.kind === "drop") continue;
    const locator = source.disposition.targetLocator;
    const path = paths.get(source.disposition.destinationId)?.get(locator.artifact);
    if (path === undefined) return false;
    const bytes = await readBytesAt(exec, ref, path, readBlob);
    if (bytes === null) return false;
    const scan = scanDecomposeContent(locator.artifact, bytes);
    if (scan.status === "rejected"
      || resolveDecomposeContentLocator(scan.units, locator, locator.artifact).status !== "resolved") return false;
  }
  return true;
}

function dependencyAllocationMatches(
  allocation: DecomposeAllocationMap,
  inventories: DecomposeInventories,
  resultIndex: LifecycleIndex,
): boolean {
  const incoming = new Map(allocation.incomingEdges.map((edge) => [edge.dependent, edge.disposition]));
  for (const edge of inventories.incomingEdgeInventory) {
    const disposition = incoming.get(edge.dependent);
    if (disposition === undefined) return false;
    const replacements = disposition.kind === "replace" ? disposition.replacementTargets : [];
    const expected = replaceDependencySlot(edge.currentTargets, allocation.origin.slug, replacements);
    if (canonicalize(resultIndex.get(edge.dependent)?.dependsOn ?? null) !== canonicalize(expected)) return false;
  }

  const recipients = allocation.entries.flatMap((entry) => {
    if (entry.kind === "new-member") return [entry.slug];
    if (entry.kind === "existing-home" && entry.target.kind === "work-unit") return [entry.target.slug];
    return [];
  });
  for (const edge of allocation.outgoingEdges) {
    const expected = edge.disposition.kind === "targets" ? [...edge.disposition.targets].sort(compareBytes) : [];
    const actual = recipients.filter((slug) => resultIndex.get(slug)?.dependsOn.includes(edge.prerequisite) === true)
      .sort(compareBytes);
    if (canonicalize(actual) !== canonicalize(expected)) return false;
  }
  for (const entry of allocation.entries) {
    if (entry.kind !== "new-member") continue;
    const expected = allocation.outgoingEdges
      .filter((edge) => edge.disposition.kind === "targets" && edge.disposition.targets.includes(entry.slug))
      .map((edge) => edge.prerequisite);
    for (const edge of allocation.internalEdges) {
      if (edge.from === entry.slug && !expected.includes(edge.to)) expected.push(edge.to);
    }
    if (canonicalize(resultIndex.get(entry.slug)?.dependsOn ?? null) !== canonicalize(expected)) return false;
  }
  return true;
}

interface StoredArtifact {
  path: ManagedPath;
  bytes: Uint8Array;
}

async function readAllSubjectArtifacts(
  exec: GitExec,
  ref: string,
  slug: string,
  readBlob?: RetirementAuthorizationBlobReader,
): Promise<StoredArtifact[]> {
  const paths = await listPaths(exec, ref, [".arc/active", ".arc/backlog", ".arc/completed"]);
  const matcher = artifactMatcher(slug);
  const selected = paths.filter((path) => matcher.test(posix.basename(path)));
  return await readArtifacts(exec, ref, selected, readBlob);
}

async function readArtifactGroup(
  exec: GitExec,
  ref: string,
  directory: string,
  slug: string,
  readBlob?: RetirementAuthorizationBlobReader,
): Promise<StoredArtifact[]> {
  const matcher = artifactMatcher(slug);
  const paths = (await listPaths(exec, ref, [directory]))
    .filter((path) => posix.dirname(path) === directory && matcher.test(posix.basename(path)));
  return await readArtifacts(exec, ref, paths, readBlob);
}

async function readArtifacts(
  exec: GitExec,
  ref: string,
  paths: readonly ManagedPath[],
  readBlob?: RetirementAuthorizationBlobReader,
): Promise<StoredArtifact[]> {
  return await Promise.all(paths.map(async (path) => {
    const bytes = await readBytesAt(exec, ref, path, readBlob);
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
  readBlob?: RetirementAuthorizationBlobReader,
): Promise<CanonicalDigest | null> {
  if (subject.kind !== "work-unit") return canonicalDigest({ subject });
  const index = await readLifecycleIndex(exec, baseRef);
  const entry = index.get(subject.name);
  if (entry === undefined || entry.location !== "completed") return null;
  const artifacts = await readArtifactGroup(exec, baseRef, posix.dirname(entry.path), subject.name, readBlob);
  return artifacts.length === 0 ? null : artifactGroupDigest(toArtifactEntries(artifacts));
}

async function readPatchOperations(
  exec: GitExec,
  parent: string,
  commit: string,
  excludedReceiptId: CanonicalDigest,
  readBlob?: RetirementAuthorizationBlobReader,
): Promise<PatchOperation[]> {
  const { stdout } = await exec("git", [
    "diff-tree", "--no-commit-id", "--name-status", "-r", "-z", "--no-renames", parent, commit,
  ]);
  const fields = stdout.split("\0").filter(Boolean);
  if (fields.length % 2 !== 0) throw new Error("malformed Git name-status output");
  const excluded = resolveRetirementRecordRelativePath(excludedReceiptId);
  const operations: PatchOperation[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const rawPath = fields[index + 1];
    if (status === undefined || rawPath === undefined) throw new Error("malformed Git name-status output");
    if (rawPath === excluded) continue;
    const path = validateManagedPath(rawPath);
    if (status === "D") operations.push(deleteOperation(path));
    else if (status === "A" || status === "M") {
      const bytes = await readBytesAt(exec, commit, path, readBlob);
      if (bytes === null) throw new Error(`missing committed patch blob: ${commit}:${path}`);
      operations.push(writeOperation(path, bytes));
    } else {
      throw new Error(`unsupported transition operation: ${status}`);
    }
  }
  return operations;
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
  exec: GitExec,
  ref: string,
  path: ManagedPath,
  readBlob?: RetirementAuthorizationBlobReader,
): Promise<Uint8Array | null> {
  if (readBlob !== undefined) return await readBlob(ref, path);
  const content = await readTextAt(exec, ref, path);
  return content === null ? null : Buffer.from(content, "utf8");
}

function compareBytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
