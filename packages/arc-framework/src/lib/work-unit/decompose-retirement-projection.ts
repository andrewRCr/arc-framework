/** Git projection and path mechanics for the in-repository decompose driver. */

import { join, posix } from "node:path";

import { parseMetaRecord } from "../active/meta-reader.js";
import { canonicalDigest, digestBytes, type CanonicalDigest } from "../canonical/canonical-json.js";
import {
  contentDigest,
  deleteOperation,
  writeOperation,
  type ArtifactSetEntry,
  type PatchOperation,
} from "../canonical/content-digest.js";
import { validateManagedPath, type ManagedPath } from "../canonical/managed-path.js";
import { artifactGroupDigest } from "../canonical/receipt-id.js";
import { getCurrentBranch } from "../git/exec.js";
import { SlugSchema, type Slug } from "../kernel/index.js";
import { resolveArcPath, WorkUnitArtifactKindSchema } from "../layout/index.js";
import type { DecomposeAllocationEntry, DecomposeAllocationMap } from "./decompose-cut-map.js";
import {
  resolveDecomposeMemberPlacement,
  type DecomposeMemberPlacement,
} from "./decompose-placement.js";
import type { DecomposeFinalTarget } from "./decompose-finalization.js";
import {
  deriveDecomposeInventories,
  type DecomposeInventories,
  type DecomposeSourceArtifact,
} from "./decompose-inventory.js";
import type { InRepoDecomposeRetirementDeps } from "./decompose-retirement-driver.js";
import { buildLifecycleIndex, type LifecycleIndex } from "./lifecycle-index.js";
import { artifactMatcher } from "./mutators/relocate-artifacts.js";
import { resolveRetirementRecordPath } from "./retirement-record-store.js";
import type { RetirementAuthorityScope } from "./retirement-authority.js";
import type { InventoryRead } from "./retirement-authority.js";

const ROADMAP_PATH = resolveArcPath({ kind: "project-document", document: "roadmap" });

export interface PreparationBinding {
  scope: RetirementAuthorityScope;
  sourceArtifactDigest: CanonicalDigest;
  inventories: DecomposeInventories;
  allowedPaths: ManagedPath[];
  inventoryRead: Exclude<InventoryRead, "not-applicable">;
}

function compareBytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export async function readDecomposeRecord(
  deps: InRepoDecomposeRetirementDeps,
  receiptId: CanonicalDigest,
): Promise<string | null> {
  try {
    return await deps.readFile(resolveRetirementRecordPath(deps.cwd, receiptId));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  }
}

async function resolveRef(deps: InRepoDecomposeRetirementDeps, ref: string): Promise<string> {
  const { stdout } = await deps.exec("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd: deps.cwd });
  const oid = stdout.trim();
  if (oid === "") throw new Error(`could not resolve commit: ${ref}`);
  return oid;
}

export async function readDecomposeStagedPaths(deps: InRepoDecomposeRetirementDeps): Promise<string[]> {
  const { stdout } = await deps.exec(
    "git",
    ["diff", "--cached", "--name-only", "--no-renames", "-z"],
    { cwd: deps.cwd },
  );
  return stdout.split("\0").filter(Boolean).sort(compareBytes);
}

export async function stageDecomposePaths(
  deps: InRepoDecomposeRetirementDeps,
  paths: readonly string[],
): Promise<void> {
  const candidates: string[] = [];
  for (const path of paths) {
    const [tracked, untracked] = await Promise.all([
      deps.exec("git", ["diff", "--name-only", "--no-renames", "-z", "--", path], { cwd: deps.cwd }),
      deps.exec("git", ["ls-files", "--others", "--exclude-standard", "-z", "--", path], { cwd: deps.cwd }),
    ]);
    if (tracked.stdout !== "" || untracked.stdout !== "") candidates.push(path);
  }
  if (candidates.length > 0) await deps.exec("git", ["add", "-A", "--", ...candidates], { cwd: deps.cwd });
}

async function listArtifactPaths(
  deps: InRepoDecomposeRetirementDeps,
  ref: string,
  directory: string,
  slug: string,
): Promise<ManagedPath[]> {
  const { stdout } = await deps.exec(
    "git",
    ["ls-tree", "--full-tree", "-r", "-z", "--name-only", ref, "--", directory],
    { cwd: deps.cwd },
  );
  const matcher = artifactMatcher(slug);
  return stdout.split("\0")
    .filter((path) => path !== "" && posix.dirname(path) === directory && matcher.test(posix.basename(path)))
    .map(validateManagedPath)
    .sort(compareBytes);
}

async function readSourceArtifacts(
  deps: InRepoDecomposeRetirementDeps,
  sourceHead: string,
  directory: string,
  slug: string,
): Promise<DecomposeSourceArtifact[]> {
  const paths = await listArtifactPaths(deps, sourceHead, directory, slug);
  return await Promise.all(paths.map(async (path) => {
    const bytes = await deps.readBlob(sourceHead, path);
    if (bytes === null) throw new Error(`source artifact disappeared from ${sourceHead}: ${path}`);
    return { path, bytes };
  }));
}

function sourceDigest(artifacts: readonly DecomposeSourceArtifact[]): CanonicalDigest {
  return artifactGroupDigest(artifacts.map((artifact): ArtifactSetEntry => ({
    path: artifact.path,
    state: "present",
    contentDigest: contentDigest(artifact.bytes),
  })));
}

function cohortDocumentPath(cohort: string): ManagedPath {
  const segments = cohort.split("/").map((segment) => SlugSchema.parse(segment));
  let coordinate: [Slug] | [Slug, Slug];
  if (segments.length === 1 && segments[0] !== undefined) coordinate = [segments[0]];
  else if (segments.length === 2 && segments[0] !== undefined && segments[1] !== undefined) {
    coordinate = [segments[0], segments[1]];
  } else {
    throw new Error(`Invalid cohort coordinate: ${cohort}`);
  }
  return resolveArcPath({
    kind: "cohort-document",
    placement: { kind: "planned" },
    cohort: coordinate,
  });
}

function conventionalMemberArtifactPath(
  slugValue: string,
  placement: DecomposeMemberPlacement,
  artifact: string,
): ManagedPath | null {
  const slug = SlugSchema.parse(slugValue);
  const kind = WorkUnitArtifactKindSchema.options.find(
    (candidate) => artifact === `${candidate}-${slug}.md`,
  );
  if (kind === undefined) return null;
  return resolveArcPath({
    kind: "work-unit-artifact",
    placement,
    slug,
    artifact: kind,
  });
}

function entryDirectory(index: LifecycleIndex, slug: string): string | null {
  const entry = index.get(slug);
  return entry === undefined ? null : posix.dirname(entry.path);
}

export function destinationArtifactPath(
  index: LifecycleIndex,
  _allocation: DecomposeAllocationMap,
  entry: DecomposeAllocationEntry,
  artifact: string,
  memberPlacement?: DecomposeMemberPlacement,
): ManagedPath | null {
  if (entry.kind === "new-member") {
    const existingDirectory = entryDirectory(index, entry.slug);
    if (existingDirectory !== null) return validateManagedPath(posix.join(existingDirectory, artifact));
    return memberPlacement === undefined
      ? null
      : conventionalMemberArtifactPath(entry.slug, memberPlacement, artifact);
  }
  if (entry.kind === "existing-home") {
    if (entry.target.kind === "document") {
      return posix.basename(entry.target.path) === artifact ? validateManagedPath(entry.target.path) : null;
    }
    const directory = entryDirectory(index, entry.target.slug);
    return directory === null ? null : validateManagedPath(posix.join(directory, artifact));
  }
  if (entry.kind === "cohort-coordination") {
    const path = cohortDocumentPath(entry.cohort);
    return posix.basename(path) === artifact ? path : null;
  }
  return null;
}

function deriveAllowedPaths(
  index: LifecycleIndex,
  allocation: DecomposeAllocationMap,
  sourcePaths: readonly ManagedPath[],
  memberPlacement: DecomposeMemberPlacement,
  writablePathBySlug?: ReadonlyMap<string, string>,
): ManagedPath[] {
  const allowed = new Set<ManagedPath>([...sourcePaths, ROADMAP_PATH]);
  const entries = new Map(allocation.entries.map((entry) => [entry.destinationId, entry]));
  for (const entry of allocation.entries) {
    if (entry.kind === "new-member") {
      const metaPath = conventionalMemberArtifactPath(entry.slug, memberPlacement, `meta-${entry.slug}.md`);
      const draftPath = conventionalMemberArtifactPath(entry.slug, memberPlacement, `draft-${entry.slug}.md`);
      if (metaPath !== null) allowed.add(metaPath);
      if (draftPath !== null) allowed.add(draftPath);
    } else if (entry.kind === "existing-home" && entry.target.kind === "document") {
      allowed.add(validateManagedPath(entry.target.path));
    } else if (entry.kind === "cohort-coordination") {
      allowed.add(cohortDocumentPath(entry.cohort));
    }
  }
  for (const source of allocation.sourceAllocations) {
    if (source.disposition.kind !== "target") continue;
    const entry = entries.get(source.disposition.destinationId);
    if (entry === undefined) continue;
    const path = destinationArtifactPath(
      index,
      allocation,
      entry,
      source.disposition.targetLocator.artifact,
      memberPlacement,
    );
    if (path !== null) allowed.add(path);
  }
  for (const edge of allocation.incomingEdges) {
    const dependent = index.get(edge.dependent);
    const writable = writablePathBySlug === undefined
      ? dependent?.path
      : writablePathBySlug.get(edge.dependent);
    if (writable !== undefined) allowed.add(validateManagedPath(writable));
  }
  const existingRecipients = new Set(allocation.entries.flatMap((entry) => (
    entry.kind === "existing-home" && entry.target.kind === "work-unit" ? [entry.target.slug] : []
  )));
  for (const edge of allocation.outgoingEdges) {
    if (edge.disposition.kind !== "targets") continue;
    for (const recipient of edge.disposition.targets) {
      if (!existingRecipients.has(recipient)) continue;
      const existing = index.get(recipient);
      if (existing !== undefined) allowed.add(validateManagedPath(existing.path));
    }
  }
  return [...allowed].sort(compareBytes);
}

export async function bindDecomposePreparation(
  deps: InRepoDecomposeRetirementDeps,
  allocation: DecomposeAllocationMap,
): Promise<PreparationBinding> {
  const index = deps.composed?.index
    ?? await buildLifecycleIndex({ cwd: deps.cwd, fs: deps.lifecycleFs });
  const origin = index.get(allocation.origin.slug);
  if (origin === undefined) throw new Error(`decompose origin \`${allocation.origin.slug}\` is absent`);
  const originPath = deps.composed === undefined
    ? origin.path
    : deps.composed.recordsBySlug.get(allocation.origin.slug)?.writablePath;
  if (originPath === undefined) {
    throw new Error(`decompose origin \`${allocation.origin.slug}\` has no current-checkout write authority`);
  }
  const occupiedMember = allocation.entries.find((entry) => entry.kind === "new-member" && index.has(entry.slug));
  if (occupiedMember?.kind === "new-member") {
    throw new Error(`decompose member \`${occupiedMember.slug}\` already exists`);
  }
  const originRecord = parseMetaRecord(await deps.readFile(join(deps.cwd, originPath)));
  const resultBranch = await getCurrentBranch(deps.exec);
  if (resultBranch === null) throw new Error("decompose requires an attached result branch");
  const sourceBranch = originRecord.branch ?? resultBranch;
  const [sourceHead, resultHead] = await Promise.all([
    resolveRef(deps, sourceBranch),
    resolveRef(deps, resultBranch),
  ]);
  const artifacts = await readSourceArtifacts(deps, sourceHead, posix.dirname(originPath), allocation.origin.slug);
  const inventory = deriveDecomposeInventories({
    originSlug: allocation.origin.slug,
    sourceArtifacts: artifacts,
    lifecycleIndex: index,
  });
  if (inventory.status === "rejected") throw new Error(inventory.reason);
  const memberPlacement = resolveDecomposeMemberPlacement(allocation, allocation.origin.slug, origin.cohort);
  if (memberPlacement.status === "refused") throw new Error(memberPlacement.reason);
  return {
    scope: {
      subject: { kind: "work-unit", name: allocation.origin.slug },
      transition: "decompose",
      source: { branch: sourceBranch, head: sourceHead },
      resultProjection: { ref: resultBranch, head: resultHead },
    },
    sourceArtifactDigest: sourceDigest(artifacts),
    inventories: inventory.inventories,
    allowedPaths: deriveAllowedPaths(
      index,
      allocation,
      artifacts.map((artifact) => artifact.path),
      memberPlacement.placement,
      deps.composed === undefined
        ? undefined
        : new Map([...deps.composed.recordsBySlug].flatMap(([slug, record]) => (
            record.writablePath === undefined ? [] : [[slug, record.writablePath] as const]
          ))),
    ),
    inventoryRead: deps.composed?.readQuality ?? "tree-only",
  };
}

export async function readDecomposeAuthorityVersion(
  deps: InRepoDecomposeRetirementDeps,
  scope: RetirementAuthorityScope,
  recordContent: string | null,
  sourceArtifactDigest: CanonicalDigest,
  inventories: DecomposeInventories,
): Promise<{ authorityVersion: string; recordState: "absent" | "prepared-decompose" }> {
  const [sourceHead, resultHead] = await Promise.all([
    resolveRef(deps, scope.source.branch),
    resolveRef(deps, scope.resultProjection.ref),
  ]);
  if (sourceHead !== scope.source.head || resultHead !== scope.resultProjection.head) {
    throw new Error("decompose projection changed");
  }
  const recordState = recordContent === null ? "absent" : "prepared-decompose";
  return {
    recordState,
    authorityVersion: canonicalDigest({
      scope,
      sourceArtifactDigest,
      inventories,
      recordState,
      recordDigest: recordContent === null ? null : digestBytes(Buffer.from(recordContent, "utf8")),
    }),
  };
}

export async function readDecomposeStagedPatch(
  deps: InRepoDecomposeRetirementDeps,
  recordPath: string,
): Promise<{ paths: string[]; operations: PatchOperation[] }> {
  const { stdout } = await deps.exec(
    "git",
    ["diff", "--cached", "--name-status", "--no-renames", "-z"],
    { cwd: deps.cwd },
  );
  const fields = stdout.split("\0").filter(Boolean);
  const paths: string[] = [];
  const operations: PatchOperation[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index]?.[0];
    const rawPath = fields[index + 1];
    if (rawPath === undefined) continue;
    paths.push(rawPath);
    if (rawPath === recordPath) continue;
    const path = validateManagedPath(rawPath);
    if (status === "D") operations.push(deleteOperation(path));
    else {
      const bytes = await deps.readBlob(null, path);
      if (bytes === null) throw new Error(`staged path is unreadable: ${path}`);
      operations.push(writeOperation(path, bytes));
    }
  }
  return { paths: paths.sort(compareBytes), operations };
}

async function listIndexPaths(
  deps: InRepoDecomposeRetirementDeps,
  directory: string,
  slug: string,
): Promise<ManagedPath[]> {
  const { stdout } = await deps.exec("git", ["ls-files", "--cached", "-z", "--", directory], { cwd: deps.cwd });
  const matcher = artifactMatcher(slug);
  return stdout.split("\0")
    .filter((path) => path !== "" && posix.dirname(path) === directory && matcher.test(posix.basename(path)))
    .map(validateManagedPath)
    .sort(compareBytes);
}

export async function readDecomposeTargetGroup(
  deps: InRepoDecomposeRetirementDeps,
  index: LifecycleIndex,
  entry: DecomposeAllocationEntry,
): Promise<DecomposeFinalTarget | null> {
  let root: string;
  let paths: ManagedPath[];
  if (entry.kind === "new-member") {
    const directory = entryDirectory(index, entry.slug);
    if (directory === null) return null;
    root = directory;
    paths = await listIndexPaths(deps, directory, entry.slug);
  } else if (entry.kind === "existing-home") {
    if (entry.target.kind === "document") {
      root = entry.target.path;
      paths = [validateManagedPath(entry.target.path)];
    } else {
      const directory = entryDirectory(index, entry.target.slug);
      if (directory === null) return null;
      root = directory;
      paths = await listIndexPaths(deps, directory, entry.target.slug);
    }
  } else if (entry.kind === "cohort-coordination") {
    const path = cohortDocumentPath(entry.cohort);
    root = posix.dirname(path);
    paths = [path];
  } else {
    return null;
  }
  const entries = await Promise.all(paths.map(async (path): Promise<ArtifactSetEntry> => {
    const bytes = await deps.readBlob(null, path);
    return bytes === null
      ? { path, state: "absent" }
      : { path, state: "present", contentDigest: contentDigest(bytes) };
  }));
  return { path: root, entries };
}
