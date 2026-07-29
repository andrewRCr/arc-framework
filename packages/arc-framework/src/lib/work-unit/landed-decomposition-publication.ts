/**
 * Tree-local projection of one landed decomposition publication.
 *
 * The caller supplies exact files from one pinned configured-base tree. This
 * module resolves live display and readiness facts without repository I/O.
 *
 * @module
 */

import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";

import { canonicalize, digestBytes } from "../canonical/canonical-json.js";
import { metaCohortDir } from "../active/cohort-consistency.js";
import {
  resolveProjectReadinessComposition,
  type ProjectReadinessAcceptedCandidate,
  type ProjectReadinessCompositionResult,
  type ProjectViewDirEntry,
  type ProjectViewFs,
} from "../status/project-view.js";
import {
  resolveLaunchReadiness,
  type DecomposeReadinessDeps,
} from "./decompose-launch-readiness.js";
import {
  resolveV3DecomposeContentLocator,
  scanV3DecomposeContent,
} from "./decompose-content.js";
import type { V3DecomposeReceipt } from "./decompose-v3-receipt.js";
import type {
  LandedPublicationProjectionRefusal,
  LandedPublicationResolution,
} from "./landed-decomposition-handoff.js";

/** One exact file entry read from the pinned landed tree. */
export interface LandedPublicationTreeFile {
  path: string;
  mode: string;
  type: string;
  bytes: Uint8Array;
}

/** Closed live-publication projection result. */
export type LandedPublicationProjectionResult =
  | { status: "resolved"; publication: LandedPublicationResolution }
  | {
    status: "projection-mismatch";
    reason: LandedPublicationProjectionRefusal;
    locus?: string;
  };

/** Inputs for one pure landed-publication projection. */
export interface ResolveLandedDecompositionPublicationInput {
  cwd: string;
  receipt: V3DecomposeReceipt;
  files: readonly LandedPublicationTreeFile[];
  readiness: DecomposeReadinessDeps;
}

type Refusal = Extract<LandedPublicationProjectionResult, { status: "projection-mismatch" }>;

class TreeDirEntry implements ProjectViewDirEntry {
  constructor(
    readonly name: string,
    private readonly directory: boolean,
  ) {}

  isDirectory(): boolean {
    return this.directory;
  }
}

function refuse(
  reason: LandedPublicationProjectionRefusal,
  locus?: string,
): Refusal {
  return {
    status: "projection-mismatch",
    reason,
    ...(locus === undefined ? {} : { locus }),
  };
}

function regular(file: LandedPublicationTreeFile): boolean {
  return file.type === "blob" && (file.mode === "100644" || file.mode === "100755");
}

function repoPath(cwd: string, path: string): string {
  const normalized = relative(cwd, path).split(sep).join("/");
  if (normalized === "") return ".";
  if (normalized === ".." || normalized.startsWith("../") || isAbsolute(normalized)) {
    throw new Error(`Path is outside repository root: ${path}`);
  }
  return normalized;
}

function normalizedRepoPath(cwd: string, path: string): string {
  return isAbsolute(path) ? repoPath(cwd, path) : path.split(sep).join("/");
}

function relativePath(dir: string, path: string): string | null {
  if (dir === ".") return path;
  if (path === dir) return "";
  const prefix = `${dir}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : null;
}

function snapshotFs(
  cwd: string,
  files: ReadonlyMap<string, LandedPublicationTreeFile>,
): ProjectViewFs {
  return {
    readdir: (path) => Promise.resolve().then(() => {
      const dir = repoPath(cwd, path);
      const entries = new Map<string, boolean>();
      for (const file of files.values()) {
        const rest = relativePath(dir, file.path);
        if (rest === null || rest === "") continue;
        const [name, ...tail] = rest.split("/");
        if (name === undefined || name === "") continue;
        entries.set(name, (entries.get(name) ?? false) || tail.length > 0);
      }
      return [...entries.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, directory]) => new TreeDirEntry(name, directory));
    }),
    readFile: (path) => Promise.resolve().then(() => {
      const normalized = repoPath(cwd, path);
      const file = files.get(normalized);
      if (file === undefined || !regular(file)) {
        throw new Error(`Path is not a regular file in the landed tree: ${normalized}`);
      }
      return new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
    }),
  };
}

function exactFiles(
  files: readonly LandedPublicationTreeFile[],
): ReadonlyMap<string, LandedPublicationTreeFile> | Refusal {
  const byPath = new Map<string, LandedPublicationTreeFile>();
  for (const file of files) {
    if (byPath.has(file.path)) return refuse("tree-entry-duplicate", file.path);
    byPath.set(file.path, file);
  }
  return byPath;
}

function recordIdentityMatches(
  candidate: ProjectReadinessAcceptedCandidate,
  file: LandedPublicationTreeFile,
): boolean {
  if (!regular(file) || basename(candidate.path) !== `meta-${candidate.slug}.md`) return false;
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
  } catch {
    return false;
  }
  if (content.split(/\r?\n/u, 1)[0] !== `# Metadata: ${candidate.slug}`) return false;
  if (candidate.lifecycleLocation !== "planned") return true;
  return metaCohortDir(candidate.path) === (candidate.record.cohort ?? "");
}

function resolveRecord(
  cwd: string,
  composition: ProjectReadinessCompositionResult,
  files: ReadonlyMap<string, LandedPublicationTreeFile>,
  slug: string,
): ProjectReadinessAcceptedCandidate | Refusal {
  if (composition.indeterminate) return refuse("project-record-indeterminate", slug);
  const rejected = composition.rejectedRecords.filter(
    (record) => record.slugHint === null || record.slugHint === slug,
  );
  if (rejected.length > 0) return refuse("project-record-rejected", rejected[0]?.path ?? slug);
  const matches = composition.acceptedCandidates.filter((candidate) => candidate.slug === slug);
  if (matches.length === 0) return refuse("project-record-missing", slug);
  if (matches.length !== 1) return refuse("project-record-duplicate", slug);
  const match = matches[0];
  if (match === undefined) return refuse("project-record-missing", slug);
  const path = normalizedRepoPath(cwd, match.path);
  const normalized = { ...match, path };
  const file = files.get(path);
  if (file === undefined || !recordIdentityMatches(normalized, file)) {
    return refuse("project-record-identity", path);
  }
  return normalized;
}

function stateMatches(
  files: ReadonlyMap<string, LandedPublicationTreeFile>,
  path: string,
  expected: V3DecomposeReceipt["finalized"]["managedPathResults"][number]["after"],
): boolean {
  const file = files.get(path);
  if (expected.kind === "absent") return file === undefined;
  return file !== undefined
    && regular(file)
    && file.mode === expected.mode
    && digestBytes(file.bytes) === expected.contentDigest;
}

function destinationOutputs(
  receipt: V3DecomposeReceipt,
  files: ReadonlyMap<string, LandedPublicationTreeFile>,
  destinationId: string,
): readonly string[] | Refusal {
  const matches = receipt.finalized.destinationDigests.filter(
    (destination) => destination.destinationId === destinationId,
  );
  if (matches.length !== 1 || matches[0] === undefined) {
    return refuse("destination-missing", destinationId);
  }
  for (const output of matches[0].outputs) {
    if (!stateMatches(files, output.path, output.after)) {
      return refuse("destination-path-mismatch", output.path);
    }
  }
  return matches[0].outputs.map(({ path }) => path);
}

function cohortIdentity(bytes: Uint8Array): string | null {
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  const lines = content.split(/\r?\n/u);
  const heading = /^# Cohort: `([^`]+)`$/u.exec(lines[0] ?? "");
  if (heading?.[1] === undefined) return null;
  const parents = lines.flatMap((line) => {
    const match = /^\*\*Parent:\*\* (.+)$/u.exec(line);
    return match?.[1] === undefined ? [] : [match[1]];
  });
  if (parents.length > 1) return null;
  return parents[0] === undefined ? heading[1] : `${parents[0]}/${heading[1]}`;
}

function validCohortLocation(path: string, cohort: string): boolean {
  const leaf = cohort.split("/").at(-1);
  if (leaf === undefined || basename(path) !== `cohort-${leaf}.md`) return false;
  const planned = /^\.arc\/backlog\/planned\/(.+)\/cohort-[^/]+\.md$/u.exec(path);
  if (planned?.[1] !== undefined) return planned[1] === cohort;
  return /^\.arc\/completed\/[^/]+\/[^/]+\/cohort-[^/]+\.md$/u.test(path);
}

function resolveCohortAnchor(
  files: ReadonlyMap<string, LandedPublicationTreeFile>,
  cohort: string,
): LandedPublicationTreeFile | Refusal {
  const leaf = cohort.split("/").at(-1);
  const candidates = [...files.values()].filter(
    (file) => leaf !== undefined && basename(file.path) === `cohort-${leaf}.md`,
  );
  const matches = candidates.filter(
    (file) => regular(file)
      && cohortIdentity(file.bytes) === cohort
      && validCohortLocation(file.path, cohort),
  );
  if (matches.length === 0) {
    return refuse(
      candidates.length === 0 ? "logical-anchor-missing" : "logical-anchor-identity",
      cohort,
    );
  }
  if (matches.length !== 1) return refuse("logical-anchor-duplicate", cohort);
  return matches[0] ?? refuse("logical-anchor-missing", cohort);
}

function hasFanout(file: LandedPublicationTreeFile, origin: string): boolean {
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
  } catch {
    return false;
  }
  const start = `<!-- arc:decompose-fanout:${origin}:start -->`;
  const end = `<!-- arc:decompose-fanout:${origin}:end -->`;
  return content.split(start).length === 2
    && content.split(end).length === 2
    && content.indexOf(start) < content.indexOf(end);
}

function newLeafDestinationId(receipt: V3DecomposeReceipt, slug: string): string | null {
  const matches = receipt.prepared.completedMap.authoring.destinations.filter(
    (destination) => destination.kind === "new-member" && destination.slug === slug,
  );
  return matches.length === 1 ? matches[0]?.destinationId ?? null : null;
}

/**
 * Resolve live publication display and readiness facts from one pinned tree.
 *
 * @param input - Canonical receipt, exact tree files, and shared readiness provider
 * @returns One exact publication projection or a typed refusal
 */
export async function resolveLandedDecompositionPublication(
  input: ResolveLandedDecompositionPublicationInput,
): Promise<LandedPublicationProjectionResult> {
  const files = exactFiles(input.files);
  if ("status" in files) return files;
  const composition = await resolveProjectReadinessComposition({
    cwd: input.cwd,
    fs: snapshotFs(input.cwd, files),
  });
  const publication = input.receipt.finalized.publication;

  let anchor: LandedPublicationResolution["anchor"];
  switch (publication.logicalAnchor.kind) {
    case "direct-member": {
      const record = resolveRecord(input.cwd, composition, files, publication.logicalAnchor.slug);
      if ("status" in record) return record;
      anchor = {
        ...publication.logicalAnchor,
        displayPath: dirname(record.path),
      };
      break;
    }
    case "cohort":
    case "subcohort": {
      const cohort = resolveCohortAnchor(files, publication.logicalAnchor.cohort);
      if ("status" in cohort) return cohort;
      anchor = {
        ...publication.logicalAnchor,
        displayPath: dirname(cohort.path),
      };
      break;
    }
    case "at-cap-fanout": {
      const cohort = resolveCohortAnchor(files, publication.logicalAnchor.parent);
      if ("status" in cohort) return cohort;
      if (!hasFanout(cohort, publication.logicalAnchor.origin)) {
        return refuse("logical-anchor-fanout", cohort.path);
      }
      anchor = {
        ...publication.logicalAnchor,
        displayPath: `${dirname(cohort.path)}#arc:decompose-fanout:${publication.logicalAnchor.origin}`,
      };
      break;
    }
  }

  const entries: LandedPublicationResolution["entries"][number][] = [];
  for (const entry of publication.entries) {
    if (entry.kind === "new-leaf") {
      const destinationId = newLeafDestinationId(input.receipt, entry.slug);
      if (destinationId === null) return refuse("destination-missing", entry.slug);
      const outputs = destinationOutputs(input.receipt, files, destinationId);
      if ("status" in outputs) return outputs;
      const record = resolveRecord(input.cwd, composition, files, entry.slug);
      if ("status" in record) return record;
      if (!outputs.includes(record.path)) {
        return refuse("destination-path-mismatch", record.path);
      }
      entries.push({
        kind: entry.kind,
        slug: entry.slug,
        displayPath: dirname(record.path),
        readiness: resolveLaunchReadiness({
          slug: entry.slug,
          composition,
          deps: input.readiness,
        }),
      });
      continue;
    }

    const outputs = destinationOutputs(input.receipt, files, entry.destinationId);
    if ("status" in outputs) return outputs;
    switch (entry.target.kind) {
      case "work-unit": {
        const record = resolveRecord(input.cwd, composition, files, entry.target.slug);
        if ("status" in record) return record;
        entries.push({ ...entry, displayPath: dirname(record.path) });
        break;
      }
      case "draft-block": {
        const record = resolveRecord(input.cwd, composition, files, entry.target.slug);
        if ("status" in record) return record;
        const path = join(dirname(record.path), entry.target.locator.artifact).split(sep).join("/");
        const artifact = files.get(path);
        if (!outputs.includes(path) || artifact === undefined || !regular(artifact)) {
          return refuse("destination-path-mismatch", path);
        }
        const scan = scanV3DecomposeContent(entry.target.locator.artifact, artifact.bytes);
        if (scan.status !== "scanned"
          || resolveV3DecomposeContentLocator(
            scan.units,
            entry.target.locator,
            entry.target.locator.artifact,
          ).status !== "resolved") {
          return refuse("draft-locator", `${path}#${canonicalize(entry.target.locator)}`);
        }
        entries.push({ ...entry, displayPath: path });
        break;
      }
      case "document": {
        if (!outputs.includes(entry.target.path) || files.get(entry.target.path) === undefined) {
          return refuse("destination-path-mismatch", entry.target.path);
        }
        entries.push({ ...entry, displayPath: entry.target.path });
        break;
      }
    }
  }
  return { status: "resolved", publication: { anchor, entries } };
}
