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
} from "./decompose-v3-preflight.js";

export interface GitV3DecomposePreflightDependencies {
  cwd: string;
  exec: GitExec;
  readBlob(ref: string, path: string): Promise<Uint8Array | null>;
}

export type GitV3DecomposePreflightResult =
  | V3DecomposePreflightResult
  | { status: "rejected"; reason: `git-preflight:${string}` };

interface TreeEntry {
  mode: string;
  kind: string;
  path: string;
}

function parseTreeEntries(stdout: string): TreeEntry[] {
  return stdout.split("\0").filter(Boolean).map((entry) => {
    const match = /^(\d{6}) ([^ ]+) (.+)$/u.exec(entry);
    if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
      throw new Error("malformed-tree-entry");
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

function planningProfile(
  origin: string,
  design: readonly string[],
): V3DecomposeSourceMeta["planningProfile"] | null {
  const names = design.map((value) => posix.basename(value));
  if (names.length === 1 && names[0] === `draft-${origin}.md`) {
    return { kind: "draft", sourceDesign: [names[0]] };
  }
  if (names.length === 1 && names[0]?.endsWith(`-${origin}.md`) === true) {
    return { kind: "single-spec", sourceDesign: [names[0]] };
  }
  if (names.length === 2 && names.every((name) => name.endsWith(`-${origin}.md`))) {
    return { kind: "paired-spec", sourceDesign: [names[0] ?? "", names[1] ?? ""] };
  }
  return null;
}

async function readSnapshot(
  deps: GitV3DecomposePreflightDependencies,
  ref: string,
  head: string,
  origin: string,
): Promise<V3DecomposeTreeSnapshot> {
  const listing = await deps.exec("git", [
    "ls-tree",
    "--full-tree",
    "-r",
    "-z",
    "--format=%(objectmode) %(objecttype) %(path)",
    ref,
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
    const bytes = await deps.readBlob(ref, entry.path);
    if (bytes === null) throw new Error(`missing-blob:${entry.path}`);
    metaRecords.push({
      slug,
      path: entry.path,
      record: parseMetaRecord(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    });
  }

  const origins: V3DecomposeSourceMeta[] = [];
  for (const meta of metaRecords.filter(({ slug }) => slug === origin)) {
    const location = locationOf(meta.path);
    const profile = planningProfile(origin, meta.record.design);
    if (location === null || profile === null || meta.record.state === null) continue;
    origins.push({
      path: meta.path,
      origin,
      location,
      state: meta.record.state,
      branch: meta.record.branch,
      planningProfile: profile,
    });
  }

  const sourceMeta = origins.length === 1 ? origins[0] : undefined;
  const sourceDir = sourceMeta === undefined ? null : posix.dirname(sourceMeta.path);
  const matcher = artifactMatcher(origin);
  const designNames = new Set(sourceMeta?.planningProfile.sourceDesign ?? []);
  const sourceArtifacts: V3DecomposeStoredArtifact[] = [];
  if (sourceDir !== null) {
    for (const entry of entries) {
      if (posix.dirname(entry.path) !== sourceDir || !matcher.test(posix.basename(entry.path))) continue;
      if (entry.kind !== "blob" || (entry.mode !== "100644" && entry.mode !== "100755")) {
        throw new Error(`unsupported-artifact:${entry.path}`);
      }
      const bytes = await deps.readBlob(ref, entry.path);
      if (bytes === null) throw new Error(`missing-blob:${entry.path}`);
      sourceArtifacts.push({
        path: entry.path,
        objectKind: "blob",
        mode: entry.mode,
        bytes,
        allocatable: designNames.has(posix.basename(entry.path)),
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
    if (tokens.length % 2 !== 0) throw new Error("malformed-ref-list");
    const pairs: Array<{ ref: string; head: string }> = [];
    for (let index = 0; index < tokens.length; index += 2) {
      const ref = tokens[index];
      const head = tokens[index + 1];
      if (ref === undefined || head === undefined || !ref.startsWith("refs/heads/")) {
        throw new Error("malformed-ref-list");
      }
      pairs.push({ ref, head });
    }
    const base = pairs.find(({ ref }) => ref === baseRef);
    if (base === undefined) return { status: "rejected", reason: "git-preflight:missing-base" };
    const sourceBase = await readSnapshot(deps, base.ref, base.head, origin);
    const localBranches: V3DecomposeTreeSnapshot[] = [];
    for (const pair of pairs.filter(({ ref }) => ref !== baseRef)) {
      localBranches.push(await readSnapshot(deps, pair.ref, pair.head, origin));
    }
    return createV3DecomposePreflight({
      origin,
      sourceBase,
      resultBase: base,
      localBranches,
    });
  } catch (error) {
    return {
      status: "rejected",
      reason: `git-preflight:${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
