/** Live source-unit and dependency-edge inventories for decompose preparation. */

import { posix } from "node:path";

import { contentDigest } from "../canonical/content-digest.js";
import { canonicalDigest, type CanonicalDigest } from "../canonical/canonical-json.js";
import type { ManagedPath } from "../canonical/managed-path.js";
import { scanDecomposeContent } from "./decompose-content.js";
import type { DecomposeAllocationMap, DecomposeContentLocator } from "./decompose-cut-map.js";
import { resolveReverseDeps } from "./lifecycle-deps.js";
import type { LifecycleIndex } from "./lifecycle-index.js";

export interface DecomposeSourceInventoryEntry {
  sourceId: CanonicalDigest;
  sourcePath: ManagedPath;
  sourceLocator: DecomposeContentLocator;
  contentDigest: CanonicalDigest;
}

export interface DecomposeIncomingEdgeInventoryEntry {
  dependent: string;
  currentTargets: string[];
}

export interface DecomposeOutgoingEdgeInventoryEntry {
  prerequisite: string;
}

export interface DecomposeInventories {
  sourceInventory: DecomposeSourceInventoryEntry[];
  incomingEdgeInventory: DecomposeIncomingEdgeInventoryEntry[];
  outgoingEdgeInventory: DecomposeOutgoingEdgeInventoryEntry[];
}

export interface DecomposeSourceArtifact {
  path: ManagedPath;
  bytes: Uint8Array;
}

export type DecomposeInventoryResult =
  | { status: "derived"; inventories: DecomposeInventories }
  | { status: "rejected"; reason: string };

export type DecomposeCoverageResult =
  | { status: "covered" }
  | { status: "rejected"; reason: string };

function compareCanonicalStrings(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function isAllocatableArtifact(path: ManagedPath, originSlug: string): boolean {
  const artifact = posix.basename(path);
  return artifact !== `meta-${originSlug}.md` && artifact !== "ROADMAP.md";
}

/** Derive all decompose inventories from exact stored artifacts and the live lifecycle index. */
export function deriveDecomposeInventories(input: {
  originSlug: string;
  sourceArtifacts: readonly DecomposeSourceArtifact[];
  lifecycleIndex: LifecycleIndex;
}): DecomposeInventoryResult {
  const sourceInventory: DecomposeSourceInventoryEntry[] = [];
  for (const source of input.sourceArtifacts) {
    if (!isAllocatableArtifact(source.path, input.originSlug)) continue;
    const artifact = posix.basename(source.path);
    const scan = scanDecomposeContent(artifact, source.bytes);
    if (scan.status === "rejected") {
      return { status: "rejected", reason: `${source.path}: ${scan.reason}` };
    }
    for (const unit of scan.units) {
      sourceInventory.push({
        sourceId: canonicalDigest({
          schemaVersion: 2,
          sourcePath: source.path,
          sourceLocator: unit.locator,
        }),
        sourcePath: source.path,
        sourceLocator: unit.locator,
        contentDigest: contentDigest(unit.bytes),
      });
    }
  }
  sourceInventory.sort((left, right) => compareCanonicalStrings(left.sourceId, right.sourceId));
  for (let index = 1; index < sourceInventory.length; index++) {
    if (sourceInventory[index - 1]?.sourceId === sourceInventory[index]?.sourceId) {
      return { status: "rejected", reason: `live source inventory contains duplicate source \`${sourceInventory[index]?.sourceId}\`.` };
    }
  }

  const incomingEdgeInventory = resolveReverseDeps(input.lifecycleIndex, input.originSlug)
    .map((dependent): DecomposeIncomingEdgeInventoryEntry => ({
      dependent,
      currentTargets: [...(input.lifecycleIndex.get(dependent)?.dependsOn ?? [])],
    }))
    .sort((left, right) => compareCanonicalStrings(left.dependent, right.dependent));

  const outgoingEdgeInventory = [...new Set(input.lifecycleIndex.get(input.originSlug)?.dependsOn ?? [])]
    .map((prerequisite): DecomposeOutgoingEdgeInventoryEntry => ({ prerequisite }))
    .sort((left, right) => compareCanonicalStrings(left.prerequisite, right.prerequisite));

  return {
    status: "derived",
    inventories: { sourceInventory, incomingEdgeInventory, outgoingEdgeInventory },
  };
}

function exactCoverage(
  authored: readonly string[],
  live: readonly string[],
  label: string,
): string | null {
  const authoredSet = new Set(authored);
  if (authoredSet.size !== authored.length) return `duplicate ${label} inventory member in allocation map.`;
  const liveSet = new Set(live);
  const missing = live.find((member) => !authoredSet.has(member));
  if (missing !== undefined) return `missing ${label} inventory member \`${missing}\` from allocation map.`;
  const extra = authored.find((member) => !liveSet.has(member));
  if (extra !== undefined) return `extra ${label} inventory member \`${extra}\` in allocation map.`;
  return null;
}

/** Require the authored map to cover each live inventory member exactly once. */
export function verifyDecomposeInventoryCoverage(
  map: DecomposeAllocationMap,
  inventories: DecomposeInventories,
): DecomposeCoverageResult {
  const sourceError = exactCoverage(
    map.sourceAllocations.map((allocation) => allocation.sourceId),
    inventories.sourceInventory.map((source) => source.sourceId),
    "source",
  );
  if (sourceError !== null) return { status: "rejected", reason: sourceError };
  const incomingError = exactCoverage(
    map.incomingEdges.map((edge) => edge.dependent),
    inventories.incomingEdgeInventory.map((edge) => edge.dependent),
    "incoming edge",
  );
  if (incomingError !== null) return { status: "rejected", reason: incomingError };
  const outgoingError = exactCoverage(
    map.outgoingEdges.map((edge) => edge.prerequisite),
    inventories.outgoingEdgeInventory.map((edge) => edge.prerequisite),
    "outgoing edge",
  );
  if (outgoingError !== null) return { status: "rejected", reason: outgoingError };
  return { status: "covered" };
}

/** Compute the three durable inventory digests bound into preparation. */
export function decomposeInventoryDigests(inventories: DecomposeInventories): {
  sourceInventoryDigest: CanonicalDigest;
  incomingEdgeInventoryDigest: CanonicalDigest;
  outgoingEdgeInventoryDigest: CanonicalDigest;
} {
  return {
    sourceInventoryDigest: canonicalDigest(inventories.sourceInventory),
    incomingEdgeInventoryDigest: canonicalDigest(inventories.incomingEdgeInventory),
    outgoingEdgeInventoryDigest: canonicalDigest(inventories.outgoingEdgeInventory),
  };
}
