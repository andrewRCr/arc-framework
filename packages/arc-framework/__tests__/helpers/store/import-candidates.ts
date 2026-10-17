/** Candidate source histories with a merge-introduced predecessor, broken links, and an unmerged owner. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { resolveArcPath } from "../../../src/lib/layout/index.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../../src/lib/store/identity.js";
import { canonicalize } from "../../../src/lib/kernel/canonical/canonical-json.js";
import { CandidateManagedRecordV1Schema, createCandidateAttestation, serializeCandidateManagedRecord, type CandidateManagedRecordV1 } from "../../../src/lib/work-unit/candidate-attestation.js";
import { inRepoContent } from "./in-repo-fixture.js";
import { makeMetaFixture } from "../meta-fixture.js";

/** Resolve the Candidate's source path through the same layout authority as its producer. */
export function importCandidatePath(name: string): string {
  return resolveArcPath({ kind: "candidate-record", slug: SlugSchema.parse(name) });
}

async function putCandidate(root: string, git: GitExec, name: string, number: number, supersedes?: string): Promise<CandidateManagedRecordV1> {
  const base = CandidateManagedRecordV1Schema.parse(JSON.parse(inRepoContent(RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name } }))));
  const record = CandidateManagedRecordV1Schema.parse({ ...base, attestation: createCandidateAttestation({
    workUnit: name, subject: base.subject, baseRevision: (await git("git", ["rev-parse", "HEAD"])).stdout.trim(),
    attestedBy: "andrew", attestedAt: `2026-10-0${number}T12:00:00.000Z`, verificationEvidenceRef: `verification://${name}/${number}`,
    ...(supersedes ? { supersedes } : {}),
  }) });
  const path = join(root, importCandidatePath(name));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serializeCandidateManagedRecord(record));
  return record;
}

async function commit(git: GitExec, message: string): Promise<void> {
  await git("git", ["add", "-A"]);
  await git("git", ["commit", "-m", message]);
}

/** Commit real plain-path histories; both merge parents retain the predecessor version. */
export async function seedImportCandidates(root: string, git: GitExec): Promise<void> {
  const first = await putCandidate(root, git, "archived", 1);
  await commit(git, "Seed archived Candidate");
  await git("git", ["checkout", "-b", "import-candidate-side"]);
  await writeFile(join(root, "candidate-side.txt"), "Side code change\n");
  await commit(git, "Side code change");
  await git("git", ["checkout", "main"]);
  await writeFile(join(root, "candidate-main.txt"), "Main code change\n");
  await commit(git, "Main code change");
  await git("git", ["merge", "--no-ff", "--no-commit", "import-candidate-side"]);
  const merged = await putCandidate(root, git, "archived", 2, first.attestation.candidateId);
  await commit(git, "Introduce Candidate in merge");
  await putCandidate(root, git, "archived", 3, merged.attestation.candidateId);
  await commit(git, "Advance archived Candidate");
  await putCandidate(root, git, "also-archived", 1, `sha256:${"f".repeat(64)}`);
  const rejected = await putCandidate(root, git, "last-archived", 1);
  await writeFile(join(root, importCandidatePath("last-archived")), canonicalize({ ...rejected, schemaVersion: 99 }));
  await commit(git, "Retain broken and legacy Candidate sources");
  await git("git", ["checkout", "-b", "feat/branch-only"]);
  const meta = resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: SlugSchema.parse("branch-only"), placement: { kind: "active", scope: { kind: "project" } } });
  await writeFile(join(root, meta), makeMetaFixture("branch-only", { owner: "andrew", branch: "feat/branch-only" }));
  const branch = await putCandidate(root, git, "branch-only", 1);
  await commit(git, "Seed unmerged work and Candidate");
  await putCandidate(root, git, "branch-only", 2, branch.attestation.candidateId);
  await commit(git, "Advance unmerged Candidate");
  await git("git", ["checkout", "main"]);
}
