/** Exact repository-tree state utilities shared by v3 repository-plan composition. */

import { posix } from "node:path";

import { digestBytes } from "../canonical/canonical-json.js";
import { parseMetaRecord, type ParsedMetaRecord } from "../active/meta-reader.js";
import type {
  V3PlannedByteState,
  V3PlannedContentContribution,
  V3PlannedDependencyContribution,
  V3PlannedExclusivePath,
} from "./decompose-v3-plan-composer.js";
import type {
  V3DecomposeEvidenceValue,
} from "./decompose-v3-refusal.js";
import type { V3TopologyAction } from "./decompose-v3-topology.js";
import { completedWorkUnitMetaSlug } from "./completed-index.js";
import { artifactMatcher } from "./mutators/relocate-artifacts.js";

/** Exact regular-file or absence state read from a pinned repository tree. */
export type V3RepositoryPlanState = V3PlannedByteState;

/** Complete repository-relative tree projection used by the plan builder. */
export type V3RepositoryPlanTree = Record<string, V3RepositoryPlanState>;

/** One parsed metadata record and its exact tree identity. */
export interface TreeMeta {
  slug: string;
  path: string;
  record: ParsedMetaRecord;
}

export const ABSENT = { kind: "absent" } as const;

const decoder = new TextDecoder("utf-8", { fatal: true });

export function sourceArtifactEvidence(
  path: string,
  state: V3RepositoryPlanState,
): V3DecomposeEvidenceValue {
  if (state.kind === "absent") return { kind: "absent" };
  return {
    path,
    objectKind: state.objectKind,
    mode: state.mode,
    contentDigest: digestBytes(state.bytes),
  };
}

export function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function stateAt(tree: V3RepositoryPlanTree, path: string): V3RepositoryPlanState {
  return tree[path] ?? ABSENT;
}

export function regularFile(
  state: V3RepositoryPlanState,
): state is Exclude<V3RepositoryPlanState, { kind: "absent" }> {
  return state.kind === "object"
    && state.objectKind === "blob"
    && (state.mode === "100644" || state.mode === "100755");
}

function cloneState(state: V3RepositoryPlanState): V3RepositoryPlanState {
  return state.kind === "absent"
    ? state
    : { ...state, bytes: new Uint8Array(state.bytes) };
}

export function cloneTree(tree: V3RepositoryPlanTree): V3RepositoryPlanTree {
  return Object.fromEntries(
    Object.entries(tree).map(([path, state]) => [path, cloneState(state)]),
  );
}

export function regularTree(tree: V3RepositoryPlanTree): Record<
  string,
  Exclude<V3RepositoryPlanState, { kind: "absent" }>
> {
  return Object.fromEntries(
    Object.entries(tree).filter(
      (entry): entry is [string, Exclude<V3RepositoryPlanState, { kind: "absent" }>] =>
        entry[1].kind === "object",
    ),
  );
}

export function applyState(
  tree: V3RepositoryPlanTree,
  path: string,
  state: V3RepositoryPlanState,
): void {
  tree[path] = cloneState(state);
}

export function decodeText(state: V3RepositoryPlanState): string | null {
  if (!regularFile(state)) return null;
  try {
    return decoder.decode(state.bytes);
  } catch {
    return null;
  }
}

function metaSlug(path: string): string | null {
  const match = /(?:^|\/)meta-(.+)\.md$/u.exec(path);
  return match?.[1] ?? null;
}

function supportedMetaPath(path: string): boolean {
  return path.startsWith(".arc/active/")
    || path.startsWith(".arc/backlog/planned/")
    || path.startsWith(".arc/backlog/provisional/");
}

export function readTreeMetas(tree: V3RepositoryPlanTree): TreeMeta[] | null {
  const records: TreeMeta[] = [];
  for (const path of Object.keys(tree).sort(compareUtf8)) {
    const slug = metaSlug(path);
    if (slug === null || !supportedMetaPath(path)) continue;
    const text = decodeText(stateAt(tree, path));
    if (text === null) return null;
    try {
      records.push({ slug, path, record: parseMetaRecord(text) });
    } catch {
      return null;
    }
  }
  return records;
}

export function uniqueMeta(records: readonly TreeMeta[], slug: string): TreeMeta | null {
  const matches = records.filter((record) => record.slug === slug);
  return matches.length === 1 ? matches[0] ?? null : null;
}

export function originArtifactPaths(
  tree: V3RepositoryPlanTree,
  metaPath: string,
  origin: string,
): string[] {
  const directory = posix.dirname(metaPath);
  const matcher = artifactMatcher(origin);
  const layered = new Set([`spec-${origin}-prd.md`, `spec-${origin}-rfc.md`]);
  const cohortName = `cohort-${origin}.md`;
  return Object.keys(tree)
    .filter((path) => posix.dirname(path) === directory)
    .filter((path) => {
      const name = posix.basename(path);
      return name !== cohortName && (matcher.test(name) || layered.has(name));
    })
    .sort(compareUtf8);
}

export function completedWorkUnitSlugs(tree: V3RepositoryPlanTree): string[] {
  return Object.entries(tree).flatMap(([path, state]) => {
    if (!regularFile(state)) return [];
    const slug = completedWorkUnitMetaSlug(path);
    return slug === null ? [] : [slug];
  });
}

export function applyPlannedProjection(
  tree: V3RepositoryPlanTree,
  topology: readonly V3TopologyAction[],
  content: readonly V3PlannedContentContribution[],
  dependencies: readonly V3PlannedDependencyContribution[],
  predecessor?: V3PlannedExclusivePath,
  sourceRetirements: readonly V3PlannedExclusivePath[] = [],
): V3RepositoryPlanTree {
  const projected = cloneTree(tree);
  for (const action of topology) {
    if (action.kind !== "none") applyState(projected, action.path, action.after);
  }
  for (const contribution of content) applyState(projected, contribution.path, contribution.after);
  for (const dependency of dependencies) applyState(projected, dependency.path, dependency.after);
  if (predecessor !== undefined) applyState(projected, predecessor.path, predecessor.after);
  for (const retirement of sourceRetirements) applyState(projected, retirement.path, retirement.after);
  return projected;
}
