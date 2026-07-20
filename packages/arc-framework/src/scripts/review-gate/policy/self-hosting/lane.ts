/** Ref-backed ownership policy and legacy lane projection for self-hosting. */

import { posix } from "node:path";

import { parseMetaRecord } from "../../../../lib/active/meta-reader.js";
import type { CanonicalChange, ChangeStatus } from "../../../../lib/change-facts.js";
import type { GitExec } from "../../../../lib/git/exec.js";
import { readMetaAtRef } from "../../../../lib/git/remote-ref-reader.js";

/** Changed-path status supplied by the host adapter. */
export type ChangedPathStatus = ChangeStatus;

/** One changed path, with its prior location for renames and copies. */
export type ChangedPath = Pick<CanonicalChange, "status" | "path" | "previousPath">;

/** Inputs for normalized ownership over one canonical change set. */
export interface OwnershipResolutionInput {
  exec: GitExec;
  diffBaseSha: string;
  headSha: string;
  authorLogin: string;
  authorMap: Record<string, string>;
  changes: ChangedPath[];
}

/** Compatibility input name for the derived legacy lane presentation. */
export type AutoLaneInput = OwnershipResolutionInput;

/** Normalized ownership relation consumed by review routing. */
export type OwnershipRelation = "self" | "foreign" | "mixed" | "ownerless" | "not-applicable" | "unknown";

/** Exact-ref ownership result for the full affected change set. */
export interface OwnershipResolution {
  relation: OwnershipRelation;
}

/** Stable lane-decision reason. */
export type LaneReason =
  | "author-owned-artifacts"
  | "ownerless-cohort"
  | "unknown-author"
  | "unknown-change-set"
  | "non-lane-path"
  | "ambiguous-move"
  | "missing-or-invalid-meta"
  | "owner-transition"
  | "mixed-ownership"
  | "owner-mismatch";

/** Automatic or reviewed lane with stable reasons. */
export interface LaneDecision {
  lane: "auto" | "reviewed";
  reasons: LaneReason[];
}

interface ArtifactGroup {
  key: string;
  metaPath: string | null;
  ownerless: boolean;
}

type OwnershipFailureReason =
  | "unknown-author"
  | "unknown-change-set"
  | "non-lane-path"
  | "ambiguous-move"
  | "missing-or-invalid-meta"
  | "owner-transition";

type DetailedOwnershipResolution = OwnershipResolution & { failureReason?: OwnershipFailureReason };

function nestedBacklogDirectory(directory: string): boolean {
  return directory.startsWith(".arc/backlog/planned/")
    || directory.startsWith(".arc/backlog/provisional/");
}

function groupForPath(path: string): ArtifactGroup | null {
  if (path.startsWith("/") || path.split("/").includes("..")) return null;
  const directory = posix.dirname(path);
  const basename = posix.basename(path);
  if (/^cohort-.+\.md$/su.test(basename)) {
    if (directory !== ".arc/backlog/planned" && directory !== ".arc/backlog/provisional") return null;
    return { key: `${directory}/${basename}`, metaPath: null, ownerless: true };
  }
  if (directory !== ".arc/active" && !nestedBacklogDirectory(directory)) return null;
  const match = /^(?:draft|tasks|meta|notes)-(.+)\.md$/su.exec(basename);
  const slug = match?.[1];
  if (slug === undefined || slug.length === 0) return null;
  return {
    key: `${directory}/${slug}`,
    metaPath: `${directory}/meta-${slug}.md`,
    ownerless: false,
  };
}

function parseOwner(content: string | null): string | null {
  if (content === null) return null;
  try {
    const owner = parseMetaRecord(content).Owner;
    return owner === null || owner === "[none]" || owner === "" ? null : owner;
  } catch {
    return null;
  }
}

async function resolveOwnershipDetailed(input: OwnershipResolutionInput): Promise<DetailedOwnershipResolution> {
  const mappedOwner = input.authorMap[input.authorLogin];
  if (mappedOwner === undefined) return { relation: "unknown", failureReason: "unknown-author" };
  if (input.changes.length === 0) return { relation: "unknown", failureReason: "unknown-change-set" };

  const groups = new Map<string, { group: ArtifactGroup; changes: ChangedPath[] }>();
  for (const change of input.changes) {
    const group = groupForPath(change.path);
    if (change.path.startsWith("/") || change.path.split("/").includes("..")) {
      return { relation: "unknown", failureReason: "non-lane-path" };
    }
    if (change.status === "renamed" || change.status === "copied") {
      const previous = change.previousPath === undefined ? null : groupForPath(change.previousPath);
      if (change.previousPath === undefined
        || change.previousPath.startsWith("/")
        || change.previousPath.split("/").includes("..")) {
        return { relation: "unknown", failureReason: "ambiguous-move" };
      }
      if (group === null && previous === null) continue;
      if (group === null || previous === null || previous.key !== group.key) {
        return { relation: "unknown", failureReason: "ambiguous-move" };
      }
    }
    if (group === null) continue;
    const existing = groups.get(group.key);
    if (existing === undefined) groups.set(group.key, { group, changes: [change] });
    else existing.changes.push(change);
  }

  const owners = new Set<string>();
  let sawOwnerless = false;
  for (const { group, changes } of groups.values()) {
    if (group.ownerless) {
      sawOwnerless = true;
      continue;
    }
    if (group.metaPath === null) {
      return { relation: "unknown", failureReason: "missing-or-invalid-meta" };
    }
    const requiresBase = changes.some((change) => change.status !== "added");
    const requiresHead = changes.some((change) => change.status !== "deleted");
    const [baseContent, headContent] = await Promise.all([
      requiresBase
        ? readMetaAtRef({ exec: input.exec, ref: input.diffBaseSha, metaPath: group.metaPath })
        : Promise.resolve(null),
      requiresHead
        ? readMetaAtRef({ exec: input.exec, ref: input.headSha, metaPath: group.metaPath })
        : Promise.resolve(null),
    ]);
    const baseOwner = parseOwner(baseContent);
    const headOwner = parseOwner(headContent);
    if ((requiresBase && baseOwner === null) || (requiresHead && headOwner === null)) {
      return { relation: "unknown", failureReason: "missing-or-invalid-meta" };
    }
    if (baseOwner !== null && headOwner !== null && baseOwner !== headOwner) {
      return { relation: "unknown", failureReason: "owner-transition" };
    }
    const owner = baseOwner ?? headOwner;
    if (owner === null) return { relation: "unknown", failureReason: "missing-or-invalid-meta" };
    owners.add(owner);
  }

  if (owners.size > 1) return { relation: "mixed" };
  const owner = owners.values().next().value;
  if (owner !== undefined) return { relation: owner === mappedOwner ? "self" : "foreign" };
  return { relation: sawOwnerless ? "ownerless" : "not-applicable" };
}

/** Resolve normalized ownership over every affected endpoint at the ref where it exists. */
export async function resolveOwnership(input: OwnershipResolutionInput): Promise<OwnershipResolution> {
  const { relation } = await resolveOwnershipDetailed(input);
  return { relation };
}

/** Resolve automatic-lane eligibility from exact-ref companion ownership. */
export async function resolveAutoLane(input: AutoLaneInput): Promise<LaneDecision> {
  const ownership = await resolveOwnershipDetailed(input);
  switch (ownership.relation) {
    case "self":
      return { lane: "auto", reasons: ["author-owned-artifacts"] };
    case "ownerless":
      return { lane: "auto", reasons: ["ownerless-cohort"] };
    case "foreign":
      return { lane: "reviewed", reasons: ["owner-mismatch"] };
    case "mixed":
      return { lane: "reviewed", reasons: ["mixed-ownership"] };
    case "not-applicable":
      return { lane: "reviewed", reasons: ["non-lane-path"] };
    case "unknown":
      return { lane: "reviewed", reasons: [ownership.failureReason ?? "unknown-change-set"] };
  }
}
