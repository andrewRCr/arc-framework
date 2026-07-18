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
  const installedDelta = new Set(corpus.installedDelta.map(normalizeRepositoryPath));
  const repoRootDelta = new Set(corpus.repoRootDelta.map(normalizeRepositoryPath));
  const exactDelta = [...installedDelta, ...repoRootDelta];
  const result = await context.git("git", ["ls-files", "--cached", "-z", "--", packageRoot, ...exactDelta]);
  const tracked = new Set(
    result.stdout
      .split("\0")
      .filter((path) => path !== "")
      .map(normalizeRepositoryPath),
  );
  for (const path of exactDelta) {
    if (!tracked.has(path)) throw new CouplingAuditScanError(`Missing tracked corpus path: ${path}`);
  }
  const excluded = new Set(corpus.excluded.map((entry) => normalizeRepositoryPath(entry.path)));
  const paths = sortByCanonicalBytes([...tracked].filter((path) => !excluded.has(path)));
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return Promise.all(
    paths.map(async (path): Promise<CorpusFile> => {
      const locus = locusOf(path, packageRoot, installedDelta, repoRootDelta);
      if (locus === null) throw new CouplingAuditScanError(`Git returned an outside-corpus path: ${path}`);
      let bytes: Uint8Array;
      try {
        bytes = await context.readFile(path);
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
