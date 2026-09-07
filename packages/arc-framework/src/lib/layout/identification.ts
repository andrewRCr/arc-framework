/**
 * Recognition of managed paths as the semantic layout addresses that project them.
 *
 * The inverse of {@link resolveArcPath}, for callers that receive a repository path and need the
 * address behind it — most consequentially, whether two paths are the same work-unit artifact seen at
 * two lifecycle placements. Candidate addresses are read out of the path's own segments and then
 * confirmed by projecting them back, so this module never becomes a second authority on path shape:
 * a projection change it does not follow makes recognition fail rather than disagree.
 */

import { SlugSchema, type Slug } from "../kernel/index.js";
import { resolveArcPath } from "./projection.js";
import {
  ArchiveQuarterSchema,
  ArchiveSequenceSchema,
  ProjectDocumentKindSchema,
  WorkUnitArtifactKindSchema,
  type WorkUnitArtifactKind,
  type WorkUnitPlacement,
} from "./schema.js";

/** One work-unit artifact recognized from its managed path. */
export interface IdentifiedWorkUnitArtifact {
  readonly placement: WorkUnitPlacement;
  readonly slug: Slug;
  readonly artifact: WorkUnitArtifactKind;
}

const PROJECT_DOCUMENT_PATHS: ReadonlySet<string> = new Set(
  ProjectDocumentKindSchema.options.map((document) => resolveArcPath({ kind: "project-document", document })),
);

/** Whether a path is a code-owned project document regenerated from tracked lifecycle state. */
export function isProjectDocumentPath(path: string): boolean {
  return PROJECT_DOCUMENT_PATHS.has(path);
}

/** Read the artifact kind and slug out of a work-unit artifact filename. */
function parseArtifactFilename(file: string): { slug: Slug; artifact: WorkUnitArtifactKind } | null {
  const match = /^([a-z]+)-(.+)\.md$/u.exec(file);
  const artifact = WorkUnitArtifactKindSchema.safeParse(match?.[1]);
  const slug = SlugSchema.safeParse(match?.[2]);
  if (!artifact.success || !slug.success) return null;
  return { slug: slug.data, artifact: artifact.data };
}

/**
 * Enumerate the placements a directory could name.
 *
 * Every candidate is a guess the projection then accepts or rejects, so a shape that resembles two
 * placements costs one extra comparison rather than an ambiguity the caller has to resolve.
 */
function candidatePlacements(directory: readonly string[]): WorkUnitPlacement[] {
  const [root, ...rest] = directory;
  if (root !== ".arc") return [];
  const candidates: WorkUnitPlacement[] = [];
  if (rest.length === 1 && rest[0] === "active") {
    candidates.push({ kind: "active", scope: { kind: "project" } });
  }
  if (rest.length === 3 && rest[0] === "user" && rest[2] === "active") {
    const identity = SlugSchema.safeParse(rest[1]);
    if (identity.success) {
      candidates.push({ kind: "active", scope: { kind: "contributor", identity: identity.data } });
    }
  }
  if (rest[0] === "backlog" && rest.length >= 3) {
    const commitment = rest[1];
    const cohort = SlugSchema.array().safeParse(rest.slice(2, -1));
    if ((commitment === "planned" || commitment === "provisional") && cohort.success) {
      candidates.push({ kind: "backlog", commitment, cohort: cohort.data });
    }
  }
  const container = rest[2];
  if (rest[0] === "completed" && rest.length === 3 && container !== undefined) {
    const quarter = ArchiveQuarterSchema.safeParse(rest[1]);
    const sequence = ArchiveSequenceSchema.safeParse(container.slice(0, container.indexOf("_")));
    if (quarter.success && sequence.success) {
      candidates.push({ kind: "completed", quarter: quarter.data, sequence: sequence.data });
    }
  }
  return candidates;
}

/**
 * Recognize one managed path as a work-unit artifact.
 *
 * @param path - Repository-relative POSIX path to recognize.
 * @returns The artifact's placement, slug, and kind, or `null` when the path is not one.
 */
export function identifyWorkUnitArtifactPath(path: string): IdentifiedWorkUnitArtifact | null {
  const segments = path.split("/");
  const file = segments.pop();
  if (file === undefined) return null;
  const parsed = parseArtifactFilename(file);
  if (parsed === null) return null;
  for (const placement of candidatePlacements(segments)) {
    const address = { kind: "work-unit-artifact", placement, ...parsed } as const;
    let projected: string;
    try {
      projected = resolveArcPath(address);
    } catch {
      continue;
    }
    if (projected === path) return { placement, slug: parsed.slug, artifact: parsed.artifact };
  }
  return null;
}
