/**
 * Configured-base Git adapter for the landed decomposition handoff.
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";
import {
  resolveConfiguredBaseDecompositionAnchor,
  type ConfiguredBaseDecompositionAnchorResult,
} from "./configured-base-decomposition-anchor.js";
import type { DecomposeReadinessDeps } from "./decompose-launch-readiness.js";
import {
  composeLandedDecompositionHandoff,
  type LandedDecompositionHandoffResult,
} from "./landed-decomposition-handoff.js";
import {
  resolveLandedDecompositionPublication,
  type LandedPublicationTreeFile,
} from "./landed-decomposition-publication.js";

/** Production dependencies for the read-only landed-handoff adapter. */
export interface GitLandedDecompositionHandoffDependencies {
  cwd: string;
  exec: GitExec;
  readBlob(oid: string): Promise<Uint8Array>;
  readiness: DecomposeReadinessDeps;
}

interface GitTreeEntry {
  mode: string;
  type: string;
  oid: string;
  path: string;
}

const TREE_ENTRY_PATTERN = /^([0-7]{6}) ([^ ]+) ([0-9a-f]+)\t(.+)$/u;
const LIFECYCLE_ROOTS = [
  ".arc/active",
  ".arc/backlog/planned",
  ".arc/backlog/provisional",
  ".arc/completed",
] as const;
const META_PATH = /(?:^|\/)meta-[^/]+\.md$/u;
const COHORT_PATH = /(?:^|\/)cohort-[^/]+\.md$/u;

function anchorFailure(
  result: Exclude<ConfiguredBaseDecompositionAnchorResult, { status: "resolved" }>,
): LandedDecompositionHandoffResult {
  switch (result.status) {
    case "absent":
      return { status: "absent" };
    case "ambiguous":
      return { status: "ambiguous" };
    case "not-landed":
      return { status: "not-landed" };
    case "stale":
      return { status: "stale-base" };
    case "refused":
      return { status: "namespace-corrupt", reason: result.reason };
  }
}

function parseTreeEntries(stdout: string): GitTreeEntry[] | null {
  const entries: GitTreeEntry[] = [];
  for (const raw of stdout.split("\0").filter(Boolean)) {
    const match = TREE_ENTRY_PATTERN.exec(raw);
    if (match?.[1] === undefined
      || match[2] === undefined
      || match[3] === undefined
      || match[4] === undefined) return null;
    entries.push({
      mode: match[1],
      type: match[2],
      oid: match[3],
      path: match[4],
    });
  }
  return entries;
}

function within(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

async function readPublicationFiles(
  head: string,
  receipt: Extract<
    ConfiguredBaseDecompositionAnchorResult,
    { status: "resolved" }
  >["anchor"]["receipt"],
  deps: GitLandedDecompositionHandoffDependencies,
): Promise<readonly LandedPublicationTreeFile[] | null> {
  const outputPaths = new Set(
    receipt.finalized.destinationDigests.flatMap(
      (destination) => destination.outputs.map(({ path }) => path),
    ),
  );
  const pathspecs = [...new Set([
    ...LIFECYCLE_ROOTS,
    ...[...outputPaths].filter(
      (path) => !LIFECYCLE_ROOTS.some((root) => within(root, path)),
    ),
  ])];
  let entries: GitTreeEntry[] | null;
  try {
    const { stdout } = await deps.exec(
      "git",
      ["ls-tree", "--full-tree", "-r", "-z", head, "--", ...pathspecs],
      { cwd: deps.cwd },
    );
    entries = parseTreeEntries(stdout);
  } catch {
    return null;
  }
  if (entries === null) return null;

  const selected = entries.filter(
    ({ path }) => META_PATH.test(path) || COHORT_PATH.test(path) || outputPaths.has(path),
  );
  try {
    return await Promise.all(selected.map(async (entry): Promise<LandedPublicationTreeFile> => ({
      path: entry.path,
      mode: entry.mode,
      type: entry.type,
      bytes: entry.type === "blob" ? await deps.readBlob(entry.oid) : new Uint8Array(),
    })));
  } catch {
    return null;
  }
}

async function resolveCommit(exec: GitExec, cwd: string, ref: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Resolve one retired original against the exact configured-base tree.
 *
 * @param configuredBaseRef - Configured base ref
 * @param origin - Retired original slug
 * @param deps - Git, object-read, and readiness dependencies
 * @returns One facts-only handoff or a closed refusal
 */
export async function resolveGitLandedDecompositionHandoff(
  configuredBaseRef: string,
  origin: string,
  deps: GitLandedDecompositionHandoffDependencies,
): Promise<LandedDecompositionHandoffResult> {
  const selected = await resolveConfiguredBaseDecompositionAnchor(
    configuredBaseRef,
    origin,
    deps,
  );
  if (selected.status !== "resolved") return anchorFailure(selected);

  const files = await readPublicationFiles(
    selected.anchor.currentBaseHead,
    selected.anchor.receipt,
    deps,
  );
  if (files === null) {
    return {
      status: "projection-mismatch",
      reason: "tree-read-failed",
    };
  }
  const projection = await resolveLandedDecompositionPublication({
    cwd: deps.cwd,
    receipt: selected.anchor.receipt,
    files,
    readiness: deps.readiness,
  });
  if (projection.status !== "resolved") return projection;
  if (await resolveCommit(deps.exec, deps.cwd, configuredBaseRef)
    !== selected.anchor.currentBaseHead) {
    return { status: "stale-base" };
  }
  return composeLandedDecompositionHandoff({
    originalSlug: origin,
    integrationAnchor: selected.anchor,
    publication: projection.publication,
  });
}
