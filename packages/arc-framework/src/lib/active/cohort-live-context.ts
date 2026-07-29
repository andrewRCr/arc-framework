/** Pure live-tree cohort context shared by runtime and validation adapters. */

import {
  cohortDocLocation,
  type BacklogFile,
} from "./cohort-consistency.js";
import { buildLifecycleIndexFromMetas } from "../work-unit/lifecycle-index.js";
import { buildCohortMembership } from "../work-unit/lifecycle-membership.js";

/** Path classifications used by cohort validation and runtime composition. */
export type CohortPathClassification = "meta" | "cohort-doc" | "other";

/** Lifecycle-complete membership and cohort-document presence. */
export interface LiveCohortContext {
  liveMembersByDir: Map<string, Set<string>>;
  existingCohortDocDirs: Set<string>;
}

const META_PATH = /(?:^|\/)\.arc\/backlog\/planned\/(?:[^/]+\/)*meta-[^/]+\.md$/;
const COHORT_DOC_PATH = /(?:^|\/)\.arc\/backlog\/planned\/(?:[^/]+\/)*cohort-[^/]+\.md$/;

/**
 * Classify one path for backlog cohort validation.
 *
 * @param path - Repository-relative or absolute path
 * @returns Meta, cohort-document, or out-of-scope classification
 */
export function classifyCohortPath(path: string): CohortPathClassification {
  const posix = path.replace(/\\/g, "/");
  if (META_PATH.test(posix)) return "meta";
  if (COHORT_DOC_PATH.test(posix)) return "cohort-doc";
  return "other";
}

/**
 * Build lifecycle-complete cohort membership from already-read artifacts.
 *
 * @param metas - Work-unit metas from every lifecycle location
 * @param cohortDocPaths - Existing planned cohort-document paths
 * @returns Pure live cohort context
 */
export function buildLiveCohortContext(
  metas: BacklogFile[],
  cohortDocPaths: string[],
): LiveCohortContext {
  const liveMembersByDir = buildCohortMembership(buildLifecycleIndexFromMetas(metas));
  const existingCohortDocDirs = new Set<string>();
  for (const path of cohortDocPaths) {
    const location = cohortDocLocation(path);
    if (location !== null) existingCohortDocDirs.add(location.cohortDir);
  }
  return { liveMembersByDir, existingCohortDocDirs };
}
