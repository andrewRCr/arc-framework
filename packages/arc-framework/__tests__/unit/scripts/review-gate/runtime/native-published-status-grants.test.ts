/** Native singleton status keeps automatic grants out of coverage selected by discharge. */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { candidateFixture } from "../../../../helpers/store/tracked-write-fixture.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import { createReviewDecisionPort } from "../../../../../src/lib/store/kinds/review/decision/access.js";
import { resolveNativeExtraPassJudgment } from "../../../../../src/scripts/review-gate/runtime/native-extra-pass.js";
import { composeNativePublishedStatusGrants } from "../../../../../src/scripts/review-gate/runtime/native-published-status-grants.js";

it("uses discharge coverage for automatic singleton grants and preserves explicit references for policy validation", async () => {
  const h = createReviewHarness(), record = candidateFixture();
  const repositoryId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(repositoryId);
  const primary = await h.seedMeta("example");
  await h.seedCandidate(primary.reference.owner, record);
  const cwd = await mkdtemp(join(tmpdir(), "arc-native-singleton-grants-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\n");
  const headSha = "a".repeat(40), baseRevision = "b".repeat(40);
  const exec = scriptGitExec([
    { match: ["rev-parse", "--git-common-dir"], responses: [{ stdout: join(cwd, ".git") }] },
    { match: ["check-ref-format", "refs/heads/main"], responses: [{ stdout: "" }] },
    ...[headSha, baseRevision].flatMap(oid => [
      { match: ["rev-parse", "--verify", oid], responses: [{ stdout: oid }] },
      { match: ["cat-file", "-t", oid], responses: [{ stdout: "commit" }] },
      { match: ["rev-parse", `${oid}^{tree}`], responses: [{ stdout: "c".repeat(40) }] },
    ]),
  ]).exec;
  const target = { repository: "owner/repo", pullRequest: 42, headSha };
  const decisions = createReviewDecisionPort(h.store, primary.reference.owner);
  const stored = await resolveNativeExtraPassJudgment({ facts: { decisions, readProjectId: h.projectId },
    repositoryId, subject: { lineage: { kind: "candidate", candidateId: record.attestation.candidateId },
      headSha, subjectDigest: record.subject.subjectDigest }, lane: "standard", policyTarget: target,
    completedPasses: 0, actor: "recorded-owner", now: "2026-10-20T18:00:00Z",
    ceilingOverride: { target, lane: "standard", exhaustedPassCount: 0, nextPass: 1 } });
  const input = { cwd, exec, store: h.store, projectId: h.projectId, workItem: primary.reference.owner,
    record, candidateSubjectDigest: record.subject.subjectDigest, baseRevision, target };
  const before = await h.store.version();
  expect(await composeNativePublishedStatusGrants({ ...input, requestedCoverage: "incremental" })).toBeUndefined();
  const complete = await composeNativePublishedStatusGrants({ ...input, requestedCoverage: "complete" });
  expect(complete?.ceilingOverride?.decisionKey).toBe(stored.judgment?.ceilingOverride?.decisionKey);
  expect(await composeNativePublishedStatusGrants({ ...input, requestedCoverage: "incremental", judgment: complete })).toEqual(complete);
  expect(await h.store.version()).toEqual(before);
});
