/** Git-backed Candidate subject collection for one work-unit branch. */

import type { GitExec } from "../git/exec.js";
import { isGitObjectId } from "../git/object-id.js";
import { readGitBlobBytes } from "../io-context.js";
import {
  identifyWorkUnitArtifactPath,
  isProjectDocumentPath,
  resolveArcPath,
  type WorkUnitArtifactKind,
} from "../layout/index.js";
import { canonicalDigest, digestBytes } from "../canonical/canonical-json.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import {
  CandidateLineageTargetSchema,
  createCandidateSubjectSnapshot,
  type CandidateLineageTarget,
  type CandidateSubjectEntryInput,
} from "./candidate-attestation.js";
import { resolveCandidateRecordRelativePath } from "./candidate-record-store.js";
import { resolveSubmissionBoundaryPath } from "./submission-boundary-store.js";

export interface CollectGitCandidateTargetInput {
  cwd: string;
  name: string;
  baseBranch: string;
  exec: GitExec;
  readBlob?: (cwd: string, ref: string | null, path: string) => Promise<Uint8Array | null>;
}

/**
 * Resolve one path to the work unit's own artifact it holds, and to the path that keys it.
 *
 * A ship that archives in the same pass moves these before the checkpoint reads them, so the artifact
 * — not the location it currently occupies — is what a subject entry has to follow. The key is the
 * artifact's project-active path because `backlog`, `active`, and `completed` are stages one artifact
 * passes through. Contributor scope is not such a stage but a different owner, so a contributor-scoped
 * artifact keys to its own path: collapsing it onto the project path would merge two artifacts.
 */
function ownArtifactAt(
  name: string,
  path: string,
): { artifact: WorkUnitArtifactKind; key: string } | null {
  const identified = identifyWorkUnitArtifactPath(path);
  if (identified === null || identified.slug !== name) return null;
  const contributorScoped = identified.placement.kind === "active"
    && identified.placement.scope.kind === "contributor";
  return {
    artifact: identified.artifact,
    key: contributorScoped ? path : resolveArcPath({
      kind: "work-unit-artifact",
      placement: { kind: "active", scope: { kind: "project" } },
      slug: identified.slug,
      artifact: identified.artifact,
    }),
  };
}

/** Collect the staged work-unit subject relative to its configured base. */
export async function collectGitCandidateTarget(
  input: CollectGitCandidateTargetInput,
): Promise<CandidateLineageTarget> {
  const name = SlugSchema.parse(input.name);
  const baseBranch = input.baseBranch.trim();
  if (baseBranch === "") throw new Error("Candidate subject collection requires a configured base branch");
  const options = { cwd: input.cwd, objectAccess: "local-only" as const };
  const head = (await input.exec("git", ["rev-parse", "HEAD"], options)).stdout.trim();
  if (!isGitObjectId(head)) throw new Error("Cannot resolve the Candidate head revision");
  const base = (await input.exec("git", ["merge-base", "HEAD", baseBranch], options)).stdout.trim();
  if (!isGitObjectId(base)) throw new Error("Cannot resolve the Candidate base revision");
  const changed = (await input.exec(
    "git",
    ["diff", "--cached", "--name-only", "-z", base, "--"],
    options,
  )).stdout.split("\0").filter((path) => path !== "");
  const paths = [...new Set(changed)].sort(compareUtf8);
  const readBlob = input.readBlob ?? readGitBlobBytes;
  // The Candidate's own record and the publication boundary reduced from it are projections of this
  // subject, so digesting them would make the subject reference itself. The boundary is written
  // where pre-publication settles — before submission reads currentness — so classifying it is what
  // keeps a settled Candidate current rather than blocked by its own settle-point write.
  const projectionPaths = new Set([
    resolveCandidateRecordRelativePath(name),
    resolveSubmissionBoundaryPath(name),
  ]);
  const entries = new Map<string, CandidateSubjectEntryInput>();
  const relocated = new Map<string, { digest: string; artifact: WorkUnitArtifactKind }>();
  for (const path of paths) {
    const bytes = await readBlob(input.cwd, null, path);
    const digest = bytes === null ? canonicalDigest({ path, state: "absent" }) : digestBytes(bytes);
    const own = ownArtifactAt(name, path);
    if (own !== null && own.key !== path) {
      // Reaching the artifact's new location is a lifecycle write, so the location itself is
      // operational and the content it carries stays keyed to the artifact. The move alone leaves the
      // reviewable subject byte-identical; an edit made along the way still lands as a changed entry.
      relocated.set(own.key, { digest, artifact: own.artifact });
      entries.set(path, { path, digest, treatment: "operational" });
      continue;
    }
    entries.set(path, {
      path,
      digest,
      treatment: projectionPaths.has(path)
        ? "candidate-projection"
        : own?.artifact === "meta" || isProjectDocumentPath(path)
          ? "operational"
          : "reviewable",
    });
  }
  for (const [path, artifactEntry] of relocated) {
    entries.set(path, {
      path,
      digest: artifactEntry.digest,
      treatment: artifactEntry.artifact === "meta" ? "operational" : "reviewable",
    });
  }
  return CandidateLineageTargetSchema.parse({
    revision: head,
    subject: createCandidateSubjectSnapshot([...entries.values()]),
  });
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
