/**
 * Cohort-consistency validator — pre-commit hook entry point.
 *
 * Given a list of staged file paths, selects the backlog-scoped cohort artifacts
 * — `.arc/backlog/planned/.../meta-*.md` work-unit metas and `.../cohort-*.md`
 * cohort docs — and runs the three-condition cohort-consistency invariant over
 * them: (a) each meta's `**Cohort:**` field path-matches its filed dir; (b) every
 * grouping dir carries a `cohort-<leaf>.md` with a `Purpose` floor; (c) a cohort
 * doc's per-member section slugs are a subset of its derived members. The check
 * doubles as the cohort doc's schema validator (Purpose floor + orphan sections).
 *
 * The supplied path set is the universe — doc presence and membership derive only
 * from the files passed in, so the validator reasons over a staged delta without
 * auditing the live backlog. Non-cohort paths are skipped silently.
 *
 * @module
 */

import { fileURLToPath } from "node:url";

import {
  checkCohortConsistency,
  type BacklogFile,
} from "../lib/active/cohort-consistency.js";
import { runPathListScript } from "./cli-runner.js";

/** Path classifications the validator dispatches on. */
export type PathClassification = "meta" | "cohort-doc" | "other";

/** Aggregate validation outcome. */
export interface ValidationResult {
  pass: boolean;
  diagnostics: string[];
}

const META_PATH = /(?:^|\/)\.arc\/backlog\/planned\/(?:[^/]+\/)*meta-[^/]+\.md$/;
const COHORT_DOC_PATH = /(?:^|\/)\.arc\/backlog\/planned\/(?:[^/]+\/)*cohort-[^/]+\.md$/;

/**
 * Classify a path — `meta` for a backlog work-unit meta, `cohort-doc` for a
 * backlog cohort doc, `other` for everything else (skipped).
 */
export function classifyPath(path: string): PathClassification {
  const posix = path.replace(/\\/g, "/");
  if (META_PATH.test(posix)) return "meta";
  if (COHORT_DOC_PATH.test(posix)) return "cohort-doc";
  return "other";
}

/**
 * Validate a set of staged paths. Backlog metas and cohort docs are read and
 * handed to {@link checkCohortConsistency}; `other` paths are skipped silently —
 * the hook may invoke this with a broader set than the cohort scope.
 */
export function validateFiles(
  paths: string[],
  readFile: (path: string) => string,
): ValidationResult {
  const metas: BacklogFile[] = [];
  const cohortDocs: BacklogFile[] = [];
  for (const path of paths) {
    const classification = classifyPath(path);
    if (classification === "other") continue;
    const content = readFile(path);
    if (classification === "meta") metas.push({ path, content });
    else cohortDocs.push({ path, content });
  }
  const diagnostics = checkCohortConsistency({ metas, cohortDocs });
  return { pass: diagnostics.length === 0, diagnostics };
}

// --- CLI entry ---

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  runPathListScript(validateFiles);
}
