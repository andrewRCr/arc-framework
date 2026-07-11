/** Ref-backed ownership policy for the self-hosting automatic lane. */

import { posix } from "node:path";

import { parseMetaRecord } from "../../../../lib/active/meta-reader.js";
import type { GitExec } from "../../../../lib/git/exec.js";
import { readMetaAtRef } from "../../../../lib/git/remote-ref-reader.js";

/** Changed-path status supplied by the host adapter. */
export type ChangedPathStatus = "added" | "modified" | "deleted" | "renamed";

/** One changed path, with its prior location for renames. */
export interface ChangedPath {
  status: ChangedPathStatus;
  path: string;
  previousPath?: string;
}

/** Inputs for the ref-backed lane decision. */
export interface AutoLaneInput {
  exec: GitExec;
  diffBaseSha: string;
  headSha: string;
  authorLogin: string;
  authorMap: Record<string, string>;
  changes: ChangedPath[];
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

/** Resolve automatic-lane eligibility from exact-ref companion ownership. */
export async function resolveAutoLane(input: AutoLaneInput): Promise<LaneDecision> {
  const mappedOwner = input.authorMap[input.authorLogin];
  if (mappedOwner === undefined) return { lane: "reviewed", reasons: ["unknown-author"] };
  if (input.changes.length === 0) return { lane: "reviewed", reasons: ["unknown-change-set"] };

  const groups = new Map<string, { group: ArtifactGroup; changes: ChangedPath[] }>();
  for (const change of input.changes) {
    const group = groupForPath(change.path);
    if (group === null) return { lane: "reviewed", reasons: ["non-lane-path"] };
    if (change.status === "renamed") {
      const previous = change.previousPath === undefined ? null : groupForPath(change.previousPath);
      if (previous === null || previous.key !== group.key) {
        return { lane: "reviewed", reasons: ["ambiguous-move"] };
      }
    }
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
    if (group.metaPath === null) return { lane: "reviewed", reasons: ["missing-or-invalid-meta"] };
    const requiresBase = changes.some((change) => change.status !== "added");
    const requiresHead = changes.some((change) => change.status !== "deleted");
    const [baseContent, headContent] = await Promise.all([
      readMetaAtRef({ exec: input.exec, ref: input.diffBaseSha, metaPath: group.metaPath }),
      readMetaAtRef({ exec: input.exec, ref: input.headSha, metaPath: group.metaPath }),
    ]);
    const baseOwner = parseOwner(baseContent);
    const headOwner = parseOwner(headContent);
    if ((requiresBase && baseOwner === null) || (requiresHead && headOwner === null)) {
      return { lane: "reviewed", reasons: ["missing-or-invalid-meta"] };
    }
    if (baseOwner !== null && headOwner !== null && baseOwner !== headOwner) {
      return { lane: "reviewed", reasons: ["owner-transition"] };
    }
    const owner = baseOwner ?? headOwner;
    if (owner === null) return { lane: "reviewed", reasons: ["missing-or-invalid-meta"] };
    owners.add(owner);
  }

  if (owners.size > 1) return { lane: "reviewed", reasons: ["mixed-ownership"] };
  const owner = owners.values().next().value;
  if (owner !== undefined && owner !== mappedOwner) return { lane: "reviewed", reasons: ["owner-mismatch"] };
  return owner === undefined && sawOwnerless
    ? { lane: "auto", reasons: ["ownerless-cohort"] }
    : { lane: "auto", reasons: ["author-owned-artifacts"] };
}
