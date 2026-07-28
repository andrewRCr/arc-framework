/** Pure three-tree retirement-delta planning for v3 decomposition. */

import { isManagedPath } from "../canonical/managed-path.js";

export type V3RetirementTreeState =
  | { kind: "absent" }
  | {
    kind: "object";
    objectKind: string;
    mode: string;
    bytes: Uint8Array;
  };

export type V3RetirementTree = Record<string, Exclude<V3RetirementTreeState, { kind: "absent" }>>;

export interface V3RetirementDeltaInput {
  sourceKind: "started-planning" | "backlog-stub";
  mergeBases: string[];
  predecessorCandidates: string[];
  predecessorArtifactPaths?: string[];
  originArtifactPaths: string[];
  roadmapPath: string;
  baseTree: V3RetirementTree;
  sourceTree: V3RetirementTree;
  resultTree: V3RetirementTree;
}

export interface V3RetirementPathFacts {
  path: string;
  base: V3RetirementTreeState;
  source: V3RetirementTreeState;
  result: V3RetirementTreeState;
}

export interface V3RetirementAction {
  path: string;
  before: V3RetirementTreeState;
  after: { kind: "absent" };
}

export interface V3RetirementRider {
  path: string;
  reason: "source-private-added" | "source-private-modified" | "source-private-deleted";
}

export type V3RetirementDeltaRefusalCode =
  | "missing-merge-base"
  | "ambiguous-merge-base"
  | "invalid-tree-path"
  | "ambiguous-predecessor"
  | "predecessor-missing"
  | "predecessor-changed"
  | "predecessor-absent-from-source"
  | "backlog-predecessor-changed"
  | "origin-artifact-missing"
  | "unexpected-object-kind"
  | "unexpected-mode"
  | "git-read-failed";

export interface V3RetirementDeltaRefusal {
  code: V3RetirementDeltaRefusalCode;
  path?: string;
}

export type V3RetirementDeltaResult =
  | {
    status: "planned";
    mergeBase: string;
    paths: V3RetirementPathFacts[];
    predecessor: V3RetirementAction;
    predecessorRetirements: V3RetirementAction[];
    retirements: V3RetirementAction[];
    roadmap: V3RetirementPathFacts;
    riders: V3RetirementRider[];
  }
  | { status: "refused"; refusal: V3RetirementDeltaRefusal };

const ABSENT = { kind: "absent" } as const;

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function statesEqual(left: V3RetirementTreeState, right: V3RetirementTreeState): boolean {
  return left.kind === "absent"
    ? right.kind === "absent"
    : right.kind === "object"
      && left.objectKind === right.objectKind
      && left.mode === right.mode
      && bytesEqual(left.bytes, right.bytes);
}

function readState(tree: V3RetirementTree, path: string): V3RetirementTreeState {
  return tree[path] ?? ABSENT;
}

function regularFile(state: V3RetirementTreeState): boolean {
  return state.kind === "object"
    && state.objectKind === "blob"
    && (state.mode === "100644" || state.mode === "100755");
}

function transitionShapeRefusal(
  base: V3RetirementTreeState,
  source: V3RetirementTreeState,
  path: string,
): V3RetirementDeltaRefusal | null {
  if (source.kind === "object" && source.objectKind !== "blob") {
    return { code: "unexpected-object-kind", path };
  }
  if (source.kind === "object" && source.mode !== "100644" && source.mode !== "100755") {
    return { code: "unexpected-mode", path };
  }
  if (base.kind === "object" && source.kind === "object") {
    if (base.objectKind !== source.objectKind) return { code: "unexpected-object-kind", path };
    if (base.mode !== source.mode) return { code: "unexpected-mode", path };
  }
  return null;
}

function riderReason(
  base: V3RetirementTreeState,
  source: V3RetirementTreeState,
): V3RetirementRider["reason"] {
  if (base.kind === "absent") return "source-private-added";
  if (source.kind === "absent") return "source-private-deleted";
  return "source-private-modified";
}

/**
 * Bind the merge base, source head, and result base into one complete retirement delta.
 *
 * @param input - Complete stored-object inventories plus predecessor and managed-origin identities.
 * @returns A closed plan with every rider, or the first topology/predecessor/type refusal.
 */
export function planV3RetirementDelta(input: V3RetirementDeltaInput): V3RetirementDeltaResult {
  if (input.mergeBases.length === 0) {
    return { status: "refused", refusal: { code: "missing-merge-base" } };
  }
  if (input.mergeBases.length !== 1 || input.mergeBases[0]?.trim() === "") {
    return { status: "refused", refusal: { code: "ambiguous-merge-base" } };
  }
  const mergeBase = input.mergeBases[0];
  if (mergeBase === undefined) {
    return { status: "refused", refusal: { code: "missing-merge-base" } };
  }
  if (input.predecessorCandidates.length !== 1) {
    return { status: "refused", refusal: { code: "ambiguous-predecessor" } };
  }

  const universe = new Set([
    ...Object.keys(input.baseTree),
    ...Object.keys(input.sourceTree),
    ...Object.keys(input.resultTree),
    ...input.originArtifactPaths,
    ...(input.predecessorArtifactPaths ?? []),
    ...input.predecessorCandidates,
    input.roadmapPath,
  ]);
  const orderedPaths = [...universe].sort(compareUtf8);
  const invalidPath = orderedPaths.find((path) => !isManagedPath(path));
  if (invalidPath !== undefined) {
    return { status: "refused", refusal: { code: "invalid-tree-path", path: invalidPath } };
  }
  const paths = orderedPaths.map((path): V3RetirementPathFacts => ({
    path,
    base: readState(input.baseTree, path),
    source: readState(input.sourceTree, path),
    result: readState(input.resultTree, path),
  }));
  const predecessorPath = input.predecessorCandidates[0];
  if (predecessorPath === undefined) {
    return { status: "refused", refusal: { code: "ambiguous-predecessor" } };
  }
  const predecessorFacts = paths.find(({ path }) => path === predecessorPath);
  if (predecessorFacts === undefined || !regularFile(predecessorFacts.base)) {
    return { status: "refused", refusal: { code: "predecessor-missing", path: predecessorPath } };
  }
  if (predecessorFacts.result.kind === "absent") {
    return { status: "refused", refusal: { code: "predecessor-missing", path: predecessorPath } };
  }
  if (!statesEqual(predecessorFacts.base, predecessorFacts.result)) {
    return { status: "refused", refusal: { code: "predecessor-changed", path: predecessorPath } };
  }
  const predecessorArtifactPaths = input.predecessorArtifactPaths ?? [predecessorPath];
  if (!predecessorArtifactPaths.includes(predecessorPath)) {
    return { status: "refused", refusal: { code: "predecessor-missing", path: predecessorPath } };
  }
  const predecessorRetirements: V3RetirementAction[] = [];
  for (const path of predecessorArtifactPaths.slice().sort(compareUtf8)) {
    const facts = paths.find((entry) => entry.path === path);
    if (facts === undefined || !regularFile(facts.base) || !regularFile(facts.result)) {
      return { status: "refused", refusal: { code: "predecessor-missing", path } };
    }
    if (!statesEqual(facts.base, facts.result)) {
      return { status: "refused", refusal: { code: "predecessor-changed", path } };
    }
    if (input.sourceKind === "backlog-stub") {
      const refusal = transitionShapeRefusal(facts.base, facts.source, path);
      if (refusal !== null) return { status: "refused", refusal };
      if (!statesEqual(facts.base, facts.source)) {
        return { status: "refused", refusal: { code: "backlog-predecessor-changed", path } };
      }
    }
    predecessorRetirements.push({ path, before: facts.result, after: ABSENT });
  }
  if (input.sourceKind === "started-planning"
    && input.originArtifactPaths.includes(predecessorPath)) {
    const refusal = transitionShapeRefusal(
      predecessorFacts.base,
      predecessorFacts.source,
      predecessorPath,
    );
    if (refusal !== null) return { status: "refused", refusal };
    if (!regularFile(predecessorFacts.source)) {
      return {
        status: "refused",
        refusal: { code: "predecessor-absent-from-source", path: predecessorPath },
      };
    }
  }

  const originPaths = new Set(input.originArtifactPaths);
  const predecessorPaths = new Set(predecessorArtifactPaths);
  const retirements: V3RetirementAction[] = [];
  for (const path of input.originArtifactPaths.slice().sort(compareUtf8)) {
    const facts = paths.find((entry) => entry.path === path);
    if (facts === undefined || !regularFile(facts.source)) {
      return { status: "refused", refusal: { code: "origin-artifact-missing", path } };
    }
    const refusal = transitionShapeRefusal(facts.base, facts.source, path);
    if (refusal !== null) return { status: "refused", refusal };
    retirements.push({ path, before: facts.source, after: ABSENT });
  }

  const roadmap = paths.find(({ path }) => path === input.roadmapPath);
  if (roadmap === undefined) {
    return { status: "refused", refusal: { code: "invalid-tree-path", path: input.roadmapPath } };
  }
  const roadmapShapeRefusal = transitionShapeRefusal(
    roadmap.base,
    roadmap.source,
    input.roadmapPath,
  );
  if (roadmapShapeRefusal !== null) {
    return { status: "refused", refusal: roadmapShapeRefusal };
  }
  const riders: V3RetirementRider[] = [];
  for (const path of paths) {
    if (statesEqual(path.base, path.source)
      || statesEqual(path.source, path.result)
      || originPaths.has(path.path)
      || predecessorPaths.has(path.path)
      || path.path === input.roadmapPath) continue;
    const refusal = transitionShapeRefusal(path.base, path.source, path.path);
    if (refusal !== null) return { status: "refused", refusal };
    riders.push({
      path: path.path,
      reason: riderReason(path.base, path.source),
    });
  }

  return {
    status: "planned",
    mergeBase,
    paths,
    predecessor: { path: predecessorPath, before: predecessorFacts.result, after: ABSENT },
    predecessorRetirements,
    retirements,
    roadmap,
    riders,
  };
}
