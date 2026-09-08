/** Pure byte-preserving source thinning plan for completed extraction maps. */

import { posix } from "node:path";

import { digestBytes, type CanonicalDigest } from "../canonical/canonical-json.js";
import {
  scanV3DecomposeContent,
  type V3DecomposeContentLocator,
} from "./decompose-content.js";
import {
  revalidateV3DecomposeCutMapBinding,
  type V3DecomposePreflight,
} from "./decompose-v3-preflight.js";
import {
  v3DecomposeByteEvidence,
  type V3DecomposeRefusalEvidence,
} from "./decompose-v3-refusal.js";
import type { V3RepositoryPlanTree } from "./decompose-v3-repository-plan.js";
import {
  decodeV3DecomposeCutMap,
  v3SourceArtifactDigest,
  v3SourceId,
} from "./decompose-v3-schema.js";

/** Exact inputs already proven by the extraction finish boundary. */
export interface V3ExtractionSourceThinningInput {
  completedMap: unknown;
  currentPreflight: V3DecomposePreflight;
  sourceTree: V3RepositoryPlanTree;
}

/** One source path's authenticated preimage and byte-preserving result. */
export interface V3ExtractionSourceThinningFilePlan {
  path: string;
  before: {
    mode: "100644" | "100755";
    contentDigest: CanonicalDigest;
    byteLength: number;
  };
  after:
    | { kind: "absent" }
    | { kind: "file"; mode: "100644" | "100755"; bytes: Uint8Array };
  removedLocators: V3DecomposeContentLocator[];
}

/** Closed pure planning result. */
export type V3ExtractionSourceThinningResult =
  | { status: "planned"; files: V3ExtractionSourceThinningFilePlan[] }
  | {
      status: "refused";
      reason: string;
      locus?: string;
      evidence?: V3DecomposeRefusalEvidence;
    };

function refuse(
  reason: string,
  locus?: string,
  evidence?: V3DecomposeRefusalEvidence,
): V3ExtractionSourceThinningResult {
  return {
    status: "refused",
    reason,
    ...(locus === undefined ? {} : { locus }),
    ...(evidence === undefined ? {} : { evidence }),
  };
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function concatenate(chunks: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Plan exact source thinning without filesystem or Git mutation.
 *
 * @param input - Completed map, current source binding, and immutable source tree
 * @returns Exact path plans, or one deterministic refusal
 */
export function planV3ExtractionSourceThinning(
  input: V3ExtractionSourceThinningInput,
): V3ExtractionSourceThinningResult {
  const decoded = decodeV3DecomposeCutMap(input.completedMap);
  if (decoded.status === "rejected") return refuse("map", decoded.issue.path);
  const map = decoded.value;
  if (map.authoring.shape !== "extraction") return refuse("map-shape", "authoring.shape");
  const binding = revalidateV3DecomposeCutMapBinding(map, input.currentPreflight);
  if (binding.status === "stale") {
    return refuse(`source-binding:${binding.reason}`, binding.locus, binding.evidence);
  }
  const inventoryDigest = v3SourceArtifactDigest(input.currentPreflight.sourceArtifactInventory);
  if (inventoryDigest === null || inventoryDigest !== input.currentPreflight.sourceArtifactDigest) {
    return refuse("source-inventory", "sourceArtifactInventory");
  }

  const sourceUnits = new Map(map.machine.sourceUnits.map((unit) => [unit.sourceId, unit]));
  const allocations = new Map(map.authoring.sourceAllocations.map((allocation) => [
    allocation.sourceId,
    allocation,
  ]));
  const inventory = new Map(input.currentPreflight.sourceArtifactInventory.map((artifact) => [
    artifact.path,
    artifact,
  ]));
  const paths = [...new Set(map.machine.sourceUnits.map(({ sourcePath }) => sourcePath))]
    .sort(compareUtf8);
  const consumed = new Set<string>();
  const files: V3ExtractionSourceThinningFilePlan[] = [];

  for (const path of paths) {
    const expected = inventory.get(path);
    if (expected === undefined) return refuse("source-inventory", path);
    const observed = input.sourceTree[path];
    if (observed === undefined || observed.kind === "absent") return refuse("source-missing", path);
    if (observed.objectKind !== "blob") {
      return refuse("source-object", path, {
        expected: expected.objectKind,
        actual: observed.objectKind,
      });
    }
    if ((observed.mode !== "100644" && observed.mode !== "100755")
      || observed.mode !== expected.mode) {
      return refuse("source-mode", path, {
        expected: expected.mode,
        actual: observed.mode,
      });
    }
    if (digestBytes(observed.bytes) !== expected.contentDigest) {
      return refuse("source-bytes", path, {
        expected: { contentDigest: expected.contentDigest },
        actual: v3DecomposeByteEvidence(observed.bytes),
      });
    }

    const scan = scanV3DecomposeContent(posix.basename(path), observed.bytes);
    if (scan.status === "rejected") return refuse("source-scan", path);
    const retained: Uint8Array[] = [];
    const removedLocators: V3DecomposeContentLocator[] = [];
    let retainedUnits = 0;
    let previousEnd = 0;
    for (const unit of scan.units) {
      if (unit.byteRange.start !== previousEnd
        || unit.byteRange.end < unit.byteRange.start
        || unit.byteRange.end > observed.bytes.length) return refuse("source-range", path);
      previousEnd = unit.byteRange.end;
      const sourceId = v3SourceId({ sourcePath: path, sourceLocator: unit.locator });
      const sourceUnit = sourceUnits.get(sourceId);
      const allocation = allocations.get(sourceId);
      if (sourceUnit === undefined || allocation === undefined || consumed.has(sourceId)) {
        return refuse("source-allocation", path);
      }
      if (sourceUnit.sourcePath !== path || digestBytes(unit.bytes) !== sourceUnit.contentDigest) {
        return refuse("source-unit", path, {
          expected: {
            sourcePath: sourceUnit.sourcePath,
            contentDigest: sourceUnit.contentDigest,
          },
          actual: {
            sourcePath: path,
            ...v3DecomposeByteEvidence(unit.bytes),
          },
        });
      }
      consumed.add(sourceId);
      if (allocation.disposition.kind === "retained-origin") {
        retained.push(observed.bytes.slice(unit.byteRange.start, unit.byteRange.end));
        retainedUnits += 1;
      } else {
        removedLocators.push(structuredClone(unit.locator));
      }
    }
    if (previousEnd !== observed.bytes.length) return refuse("source-range", path);
    files.push({
      path,
      before: {
        mode: observed.mode,
        contentDigest: expected.contentDigest,
        byteLength: observed.bytes.byteLength,
      },
      after: retainedUnits === 0
        ? { kind: "absent" }
        : { kind: "file", mode: observed.mode, bytes: concatenate(retained) },
      removedLocators,
    });
  }
  if (consumed.size !== map.machine.sourceUnits.length) {
    return refuse("source-allocation", "machine.sourceUnits");
  }
  return { status: "planned", files };
}
