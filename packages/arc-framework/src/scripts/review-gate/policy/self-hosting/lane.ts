/** Ref-backed ownership policy for self-hosting review routing. */

import { posix } from "node:path";

import { parseMetaRecord } from "../../../../lib/active/meta-reader.js";
import type { ChangePathFact, ChangeStatus } from "../../../../lib/change-facts.js";
import type { GitExec } from "../../../../lib/git/exec.js";
import { readMetaAtRef } from "../../../../lib/git/remote-ref-reader.js";

/** Changed-path status supplied by the host adapter. */
export type ChangedPathStatus = ChangeStatus;

/** One changed path, with its prior location for renames and copies. */
export type ChangedPath = ChangePathFact;

/** Inputs for normalized ownership over one canonical change set. */
export interface OwnershipResolutionInput {
  exec: GitExec;
  diffBaseSha: string;
  headSha: string;
  authorLogin: string;
  authorMap: Record<string, string>;
  changes: ChangedPath[];
}

/** Normalized ownership relation consumed by review routing. */
export type OwnershipRelation = "self" | "foreign" | "mixed" | "ownerless" | "not-applicable" | "unknown";

/** Exact-ref ownership result for the full affected change set. */
export interface OwnershipResolution {
  relation: OwnershipRelation;
}

interface ArtifactGroup {
  key: string;
  metaPath: string | null;
  ownerless: boolean;
}

function nestedBacklogDirectory(directory: string): boolean {
  return directory.startsWith(".arc/backlog/planned/")
    || directory.startsWith(".arc/backlog/provisional/");
}

/**
 * Directories that hold grooming-stage artifacts, matching the surface-authority predicate.
 *
 * Cohort documents sit beside the work units they coordinate, so they nest a level below the
 * lifecycle root rather than resting directly in it.
 */
function planningGroomingDirectory(directory: string): boolean {
  return directory === ".arc/active"
    || directory === ".arc/backlog/planned"
    || directory === ".arc/backlog/provisional"
    || directory.startsWith(".arc/active/")
    || nestedBacklogDirectory(directory);
}

function groupForPath(path: string): ArtifactGroup | null {
  if (path.startsWith("/") || path.split("/").includes("..")) return null;
  const directory = posix.dirname(path);
  const basename = posix.basename(path);
  if (/^cohort-.+\.md$/su.test(basename)) {
    if (!planningGroomingDirectory(directory)) return null;
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

async function resolveOwnershipDetailed(input: OwnershipResolutionInput): Promise<OwnershipResolution> {
  const mappedOwner = input.authorMap[input.authorLogin];
  if (mappedOwner === undefined) return { relation: "unknown" };
  if (input.changes.length === 0) return { relation: "unknown" };

  const groups = new Map<string, { group: ArtifactGroup; changes: ChangedPath[] }>();
  for (const change of input.changes) {
    const group = groupForPath(change.path);
    if (change.path.startsWith("/") || change.path.split("/").includes("..")) {
      return { relation: "unknown" };
    }
    if (change.status === "renamed" || change.status === "copied") {
      const previous = groupForPath(change.previousPath);
      if (change.previousPath.startsWith("/")
        || change.previousPath.split("/").includes("..")) {
        return { relation: "unknown" };
      }
      if (group === null && previous === null) continue;
      if (group === null || previous === null || previous.key !== group.key) {
        return { relation: "unknown" };
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
      return { relation: "unknown" };
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
      return { relation: "unknown" };
    }
    if (baseOwner !== null && headOwner !== null && baseOwner !== headOwner) {
      return { relation: "unknown" };
    }
    const owner = baseOwner ?? headOwner;
    if (owner === null) return { relation: "unknown" };
    owners.add(owner);
  }

  if (owners.size > 1) return { relation: "mixed" };
  const owner = owners.values().next().value;
  if (owner !== undefined) return { relation: owner === mappedOwner ? "self" : "foreign" };
  return { relation: sawOwnerless ? "ownerless" : "not-applicable" };
}

/** Resolve normalized ownership over every affected endpoint at the ref where it exists. */
export async function resolveOwnership(input: OwnershipResolutionInput): Promise<OwnershipResolution> {
  return resolveOwnershipDetailed(input);
}
