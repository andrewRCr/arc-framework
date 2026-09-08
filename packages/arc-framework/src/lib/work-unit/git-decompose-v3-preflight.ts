import { posix } from "node:path";

import { parseMetaRecord } from "../active/meta-reader.js";
import type { GitExec } from "../git/exec.js";
import { artifactMatcher } from "./mutators/relocate-artifacts.js";
import {
  createV3DecomposePreflight,
  type V3DecomposePreflightResult,
  type V3DecomposeSourceMeta,
  type V3DecomposeStoredArtifact,
  type V3DecomposeTreeSnapshot,
  v3PlanningDesignNames,
} from "./decompose-v3-preflight.js";

export interface GitV3DecomposePreflightDependencies {
  cwd: string;
  exec: GitExec;
  readBlob(commit: string, path: string): Promise<Uint8Array | null>;
}

/** Stable Git-adapter refusals for rejected committed source conditions. */
export type GitV3DecomposePreflightMismatch =
  | "git-preflight:missing-base"
  | "git-preflight:malformed-ref-list"
  | "git-preflight:malformed-tree-entry"
  | "git-preflight:missing-blob"
  | "git-preflight:invalid-meta-encoding"
  | "git-preflight:invalid-origin-meta"
  | "git-preflight:unsupported-artifact";

export type GitV3DecomposePreflightResult =
  | V3DecomposePreflightResult
  | { status: "rejected"; reason: GitV3DecomposePreflightMismatch | "unexpected-error"; locus?: string };

class GitV3DecomposePreflightRejection extends Error {
  readonly reason: GitV3DecomposePreflightMismatch;
  readonly locus: string;

  constructor(reason: GitV3DecomposePreflightMismatch, locus: string) {
    super(reason);
    this.name = "GitV3DecomposePreflightRejection";
    this.reason = reason;
    this.locus = locus;
  }
}

interface TreeEntry {
  mode: string;
  kind: string;
  path: string;
}

function parseTreeEntries(stdout: string): TreeEntry[] {
  return stdout.split("\0").filter(Boolean).map((entry) => {
    const match = /^(\d{6}) ([^ ]+) (.+)$/u.exec(entry);
    if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
      throw new GitV3DecomposePreflightRejection(
        "git-preflight:malformed-tree-entry",
        entry,
      );
    }
    return { mode: match[1], kind: match[2], path: match[3] };
  });
}

function slugFromMetaPath(path: string): string | null {
  const match = /(?:^|\/)meta-(.+)\.md$/u.exec(path);
  return match?.[1] ?? null;
}

function locationOf(path: string): V3DecomposeSourceMeta["location"] | null {
  if (path.startsWith(".arc/active/")) return "active";
  if (path.startsWith(".arc/backlog/planned/") || path.startsWith(".arc/backlog/provisional/")) {
    return "backlog";
  }
  return null;
}

/** Policy for invalid artifact objects encountered while reading one source snapshot. */
export interface GitV3DecomposeTreeSnapshotOptions {
  unsupportedArtifacts?: "reject" | "omit";
}

/**
 * Test whether one tree path belongs to an origin's artifact group in its resolved directory.
 *
 * @param path - Repository-relative tree path
 * @param sourceDirectory - Resolved directory containing the origin meta
 * @param origin - Work-unit slug whose artifact group is selected
 * @returns Whether the path is a source artifact, excluding the same-name cohort document
 */
export function isGitV3DecomposeSourceArtifactPath(
  path: string,
  sourceDirectory: string,
  origin: string,
): boolean {
  const name = posix.basename(path);
  return posix.dirname(path) === sourceDirectory
    && name !== `cohort-${origin}.md`
    && (
      artifactMatcher(origin).test(name)
      || v3PlanningDesignNames(origin).pairedSpec.includes(name)
    );
}

/**
 * Read one exact decomposition source snapshot from a pinned commit.
 *
 * @param deps - Git and blob-reading boundaries
 * @param ref - Logical local ref bound to the snapshot
 * @param head - Exact commit object to read
 * @param origin - Retiring work-unit slug
 * @param options - Unsupported artifact handling; omission requires a separate raw-object proof before use
 * @returns Complete metadata, artifact, and dependency facts from the pinned tree
 */
export async function readGitV3DecomposeTreeSnapshot(
  deps: GitV3DecomposePreflightDependencies,
  ref: string,
  head: string,
  origin: string,
  options: GitV3DecomposeTreeSnapshotOptions = {},
): Promise<V3DecomposeTreeSnapshot> {
  const listing = await deps.exec("git", [
    "ls-tree",
    "--full-tree",
    "-r",
    "-z",
    "--format=%(objectmode) %(objecttype) %(path)",
    head,
    "--",
    ".arc/active",
    ".arc/backlog/planned",
    ".arc/backlog/provisional",
  ], { cwd: deps.cwd });
  const entries = parseTreeEntries(listing.stdout);
  const metaRecords: Array<{
    slug: string;
    path: string;
    record: ReturnType<typeof parseMetaRecord>;
  }> = [];
  for (const entry of entries) {
    const slug = slugFromMetaPath(entry.path);
    if (slug === null || entry.kind !== "blob") continue;
    const bytes = await deps.readBlob(head, entry.path);
    if (bytes === null) {
      throw new GitV3DecomposePreflightRejection("git-preflight:missing-blob", entry.path);
    }
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new GitV3DecomposePreflightRejection(
        "git-preflight:invalid-meta-encoding",
        entry.path,
      );
    }
    metaRecords.push({
      slug,
      path: entry.path,
      record: parseMetaRecord(content),
    });
  }

  const origins: V3DecomposeSourceMeta[] = [];
  for (const meta of metaRecords.filter(({ slug }) => slug === origin)) {
    const location = locationOf(meta.path);
    if (location === null) continue;
    if (meta.record.state === null) {
      throw new GitV3DecomposePreflightRejection(
        "git-preflight:invalid-origin-meta",
        meta.path,
      );
    }
    origins.push({
      path: meta.path,
      origin,
      location,
      state: meta.record.state,
      branch: meta.record.branch,
      design: meta.record.design,
      taskList: meta.record.taskList,
    });
  }

  const sourceMeta = origins.length === 1 ? origins[0] : undefined;
  const sourceDir = sourceMeta === undefined ? null : posix.dirname(sourceMeta.path);
  const sourceArtifacts: V3DecomposeStoredArtifact[] = [];
  if (sourceDir !== null) {
    for (const entry of entries) {
      if (!isGitV3DecomposeSourceArtifactPath(entry.path, sourceDir, origin)) continue;
      if (entry.kind !== "blob" || (entry.mode !== "100644" && entry.mode !== "100755")) {
        if (options.unsupportedArtifacts === "omit") continue;
        throw new GitV3DecomposePreflightRejection(
          "git-preflight:unsupported-artifact",
          entry.path,
        );
      }
      const bytes = await deps.readBlob(head, entry.path);
      if (bytes === null) {
        throw new GitV3DecomposePreflightRejection("git-preflight:missing-blob", entry.path);
      }
      sourceArtifacts.push({
        path: entry.path,
        objectKind: "blob",
        mode: entry.mode,
        bytes,
      });
    }
  }
  sourceArtifacts.sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));

  const originRecord = metaRecords.find(({ slug, path }) => (
    slug === origin && path === sourceMeta?.path
  ))?.record;
  const incomingEdges = metaRecords
    .filter(({ slug, record }) => slug !== origin && record.dependsOn.includes(origin))
    .map(({ slug, record }) => ({ dependent: slug, currentTargets: [...record.dependsOn].sort() }))
    .sort((left, right) => left.dependent.localeCompare(right.dependent));
  const outgoingEdges = (originRecord?.dependsOn ?? [])
    .map((prerequisite) => ({ prerequisite }))
    .sort((left, right) => left.prerequisite.localeCompare(right.prerequisite));

  return { ref, head, origins, sourceArtifacts, incomingEdges, outgoingEdges };
}

/** Read only local committed refs and emit one canonical v3 preflight result. */
export async function createGitV3DecomposePreflight(
  deps: GitV3DecomposePreflightDependencies,
  baseBranch: string,
  origin: string,
): Promise<GitV3DecomposePreflightResult> {
  try {
    const baseRef = `refs/heads/${baseBranch}`;
    const refs = await deps.exec("git", [
      "for-each-ref",
      "--format=%(refname)%00%(objectname)%00",
      "refs/heads",
    ], { cwd: deps.cwd });
    const tokens = refs.stdout.split("\0").map((token) => token.trim()).filter(Boolean);
    if (tokens.length % 2 !== 0) {
      throw new GitV3DecomposePreflightRejection(
        "git-preflight:malformed-ref-list",
        tokens.at(-1) ?? "refs/heads",
      );
    }
    const pairs: Array<{ ref: string; head: string }> = [];
    for (let index = 0; index < tokens.length; index += 2) {
      const ref = tokens[index];
      const head = tokens[index + 1];
      if (ref === undefined || head === undefined || !ref.startsWith("refs/heads/")) {
        throw new GitV3DecomposePreflightRejection(
          "git-preflight:malformed-ref-list",
          ref ?? head ?? `refs.${index}`,
        );
      }
      pairs.push({ ref, head });
    }
    const base = pairs.find(({ ref }) => ref === baseRef);
    if (base === undefined) return { status: "rejected", reason: "git-preflight:missing-base" };
    const sourceBase = await readGitV3DecomposeTreeSnapshot(deps, base.ref, base.head, origin);
    const localBranches: V3DecomposeTreeSnapshot[] = [];
    for (const pair of pairs.filter(({ ref }) => ref !== baseRef)) {
      localBranches.push(await readGitV3DecomposeTreeSnapshot(deps, pair.ref, pair.head, origin));
    }
    return createV3DecomposePreflight({
      origin,
      sourceBase,
      resultBase: base,
      localBranches,
    });
  } catch (error) {
    if (error instanceof GitV3DecomposePreflightRejection) {
      return {
        status: "rejected",
        reason: error.reason,
        locus: error.locus,
      };
    }
    return {
      status: "rejected",
      reason: "unexpected-error",
      locus: error instanceof Error ? error.message : String(error),
    };
  }
}
