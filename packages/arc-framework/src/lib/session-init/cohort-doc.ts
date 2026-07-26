/**
 * Active-WU cohort-doc resolution for session-init.
 *
 * When the active meta carries a `**Cohort:**` value, the coordinating
 * `cohort-<leaf>.md` is **not** co-located with the work unit — it lives in the
 * cohort's own grouping dir under `backlog/planned/`, whose path mirrors the
 * field value (`<cohort>[/<subcohort>]`). An active WU is an in-flight member,
 * so its cohort has not been archived and the doc reliably sits at that
 * deterministic path; this resolver derives it, confirms it exists, and hands
 * the path to the session-init workflow to read during context-load.
 *
 * Degrades to `null` on every miss — no cohort field, the `[none]` standalone
 * sentinel, an unreadable meta, or no backing doc on disk — so the surface is
 * purely additive and never an error.
 *
 * @module
 */

import { join } from "node:path";

import { parseMetaRecord } from "../active/meta-reader.js";
import { SlugSchema, type Slug } from "../kernel/index.js";
import { resolveArcPath } from "../layout/index.js";

/** Filesystem seam — injected so the resolver stays unit-testable. */
export interface CohortDocFs {
  /** Read a file as UTF-8; rejects when the path is absent. */
  readFile(path: string): Promise<string>;
  /** Resolve `true` when the path exists on disk, `false` otherwise. */
  pathExists(path: string): Promise<boolean>;
}

/** Inputs for {@link resolveActiveCohortDocPath}. */
export interface ResolveCohortDocArgs {
  /** Repository root the session-init probe runs in. */
  cwd: string;
  /** Active meta path, relative to `cwd` (forward-slash normalized). */
  activeMetaPath: string;
  /** Injected filesystem ops. */
  fs: CohortDocFs;
}

/**
 * Resolve the active WU's coordinating cohort-doc path, or `null`.
 *
 * Reads the active meta's `Cohort` field, derives the leaf segment, and checks
 * for `cohort-<leaf>.md` at the deterministic `backlog/planned/<field>/` path.
 *
 * @param args - cwd, active meta path, and the injected fs.
 * @returns The cohort-doc path relative to `cwd` (forward-slash normalized), or
 *   `null` when there is no cohort, no backing doc, or the meta can't be read.
 */
export async function resolveActiveCohortDocPath(
  args: ResolveCohortDocArgs,
): Promise<string | null> {
  const { cwd, activeMetaPath, fs } = args;

  let content: string;
  try {
    content = await fs.readFile(join(cwd, activeMetaPath));
  } catch {
    return null;
  }

  const cohort = parseMetaRecord(content).cohort;
  if (cohort === null) return null;
  const field = cohort.trim();
  if (field === "") return null;

  const segments = field.split("/").map((segment) => SlugSchema.safeParse(segment));
  if (segments.some((segment) => !segment.success)) return null;
  const slugs = field.split("/").map((segment) => SlugSchema.parse(segment));
  let coordinate: [Slug] | [Slug, Slug];
  if (slugs.length === 1 && slugs[0] !== undefined) coordinate = [slugs[0]];
  else if (slugs.length === 2 && slugs[0] !== undefined && slugs[1] !== undefined) {
    coordinate = [slugs[0], slugs[1]];
  } else return null;
  const docPath = resolveArcPath({ kind: "cohort-document", placement: { kind: "planned" }, cohort: coordinate });

  const exists = await fs.pathExists(join(cwd, docPath));
  return exists ? docPath : null;
}
