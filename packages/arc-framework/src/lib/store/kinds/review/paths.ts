/** Pure path resolution for repository-backed review records. */
import { resolveArcPath } from "../../../layout/index.js";
import { SlugSchema } from "../../../kernel/schema/slug.js";

/** Resolve a Candidate record's repository-relative path. */
export function resolveCandidateRecordRelativePath(name: string): string {
  return resolveArcPath({ kind: "candidate-record", slug: SlugSchema.parse(name) });
}

/** Resolve a durable integration boundary's repository-relative path. */
export function resolveSubmissionBoundaryPath(name: string): string {
  return resolveArcPath({ kind: "integration-boundary-record", slug: SlugSchema.parse(name) });
}
