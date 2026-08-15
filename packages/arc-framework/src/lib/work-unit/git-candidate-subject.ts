/** Git-backed Candidate subject collection for one work-unit branch. */

import type { GitExec } from "../git/exec.js";
import { isGitObjectId } from "../git/object-id.js";
import { readGitBlobBytes } from "../io-context.js";
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
  const metaPath = `.arc/active/meta-${name}.md`;
  const entries: CandidateSubjectEntryInput[] = [];
  for (const path of paths) {
    const bytes = await readBlob(input.cwd, null, path);
    entries.push({
      path,
      digest: bytes === null ? canonicalDigest({ path, state: "absent" }) : digestBytes(bytes),
      treatment: projectionPaths.has(path)
        ? "candidate-projection"
        : path === metaPath
          ? "operational"
          : "reviewable",
    });
  }
  return CandidateLineageTargetSchema.parse({
    revision: head,
    subject: createCandidateSubjectSnapshot(entries),
  });
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
