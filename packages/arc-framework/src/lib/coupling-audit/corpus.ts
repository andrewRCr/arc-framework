/**
 * Deterministic tracked-file discovery and decoding for the coupling audit.
 *
 * @module
 */

import { sortByCanonicalBytes } from "../canonical/canonical-json.js";
import type { GitExec } from "../git/exec.js";
import { CouplingAuditScanError } from "./contracts.js";
import { normalizeRepositoryPath } from "./canonical.js";
import { classifySurface } from "./surface-classifier.js";
import type { CorpusLocus, CouplingManifest, SurfaceKind } from "./types.js";

/** One decoded, mechanically classified member of the authoritative corpus. */
export interface CorpusFile {
  path: string;
  content: string;
  surfaceKind: SurfaceKind;
  locus: CorpusLocus;
}

/** Injected boundaries for tracked-file collection. */
export interface CorpusContext {
  git: GitExec;
  readFile(path: string): Promise<Uint8Array>;
}

function locusOf(
  path: string,
  packageRoot: string,
  installedDelta: ReadonlySet<string>,
  repoRootDelta: ReadonlySet<string>,
): CorpusLocus | null {
  if (installedDelta.has(path)) return "installed-delta";
  if (repoRootDelta.has(path)) return "repo-root-delta";
  if (path === packageRoot || path.startsWith(`${packageRoot}/`)) return "package";
  return null;
}

/**
 * Select corpus members from a repository path inventory using manifest membership rules.
 *
 * @param corpus - Validated manifest corpus declaration.
 * @param candidatePaths - Repository-relative paths to test for membership.
 * @param requireExactDelta - Whether every declared exact-delta path must be present.
 * @returns Canonically sorted, deduplicated corpus paths.
 */
export function selectCorpusPaths(
  corpus: CouplingManifest["corpus"],
  candidatePaths: readonly string[],
  requireExactDelta = true,
): string[] {
  const packageRoot = normalizeRepositoryPath(corpus.packageRoot);
  const installedDelta = new Set(corpus.installedDelta.map(normalizeRepositoryPath));
  const repoRootDelta = new Set(corpus.repoRootDelta.map(normalizeRepositoryPath));
  const exactDelta = [...installedDelta, ...repoRootDelta];
  const excluded = new Set(corpus.excluded.map((entry) => normalizeRepositoryPath(entry.path)));
  const candidates = new Set(candidatePaths.map(normalizeRepositoryPath));
  if (requireExactDelta) {
    for (const path of exactDelta) {
      if (!candidates.has(path)) throw new CouplingAuditScanError(`Missing tracked corpus path: ${path}`);
    }
  }
  return sortByCanonicalBytes(
    [...candidates].filter(
      (path) => locusOf(path, packageRoot, installedDelta, repoRootDelta) !== null && !excluded.has(path),
    ),
  );
}

/**
 * Decode and classify an already-selected corpus path inventory.
 *
 * @param corpus - Validated manifest corpus declaration.
 * @param paths - Selected repository-relative corpus paths.
 * @param readFile - Exact byte reader for the desired filesystem or Git tree.
 * @returns Decoded and classified corpus files in input order.
 */
export async function collectCorpusFromPaths(
  corpus: CouplingManifest["corpus"],
  paths: readonly string[],
  readFile: (path: string) => Promise<Uint8Array>,
): Promise<CorpusFile[]> {
  const packageRoot = normalizeRepositoryPath(corpus.packageRoot);
  const installedDelta = new Set(corpus.installedDelta.map(normalizeRepositoryPath));
  const repoRootDelta = new Set(corpus.repoRootDelta.map(normalizeRepositoryPath));
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return Promise.all(
    paths.map(async (path): Promise<CorpusFile> => {
      const locus = locusOf(path, packageRoot, installedDelta, repoRootDelta);
      if (locus === null) throw new CouplingAuditScanError(`Outside-corpus path: ${path}`);
      let bytes: Uint8Array;
      try {
        bytes = await readFile(path);
      } catch (error) {
        throw new CouplingAuditScanError(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
      let content: string;
      try {
        content = decoder.decode(bytes);
      } catch (error) {
        throw new CouplingAuditScanError(
          `${path}: invalid UTF-8 (${error instanceof Error ? error.message : String(error)})`,
        );
      }
      return { path, content, surfaceKind: classifySurface(path), locus };
    }),
  );
}

/**
 * Collect the package root and exact delta files through one NUL-safe Git query.
 *
 * @param corpus - Validated manifest corpus declaration.
 * @param context - Injected Git and byte-reading seams.
 * @returns Sorted, deduplicated, UTF-8-decoded corpus files.
 */
export async function collectCorpus(
  corpus: CouplingManifest["corpus"],
  context: CorpusContext,
): Promise<CorpusFile[]> {
  const packageRoot = normalizeRepositoryPath(corpus.packageRoot);
  const exactDelta = [...corpus.installedDelta, ...corpus.repoRootDelta].map(normalizeRepositoryPath);
  const result = await context.git("git", ["ls-files", "--cached", "-z", "--", packageRoot, ...exactDelta]);
  const tracked = result.stdout.split("\0").filter((path) => path !== "");
  return collectCorpusFromPaths(corpus, selectCorpusPaths(corpus, tracked), (path) => context.readFile(path));
}
