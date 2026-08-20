/**
 * Real-CLI coverage for the publication spine's first-call path.
 *
 * `attest → pre-publication → publish` is proven by execution rather than by injected dependencies:
 * the durable boundary the middle verb writes is the one submission reads, and `arc publish`
 * succeeds on its first call over it.
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  git,
  runArc,
} from "./helpers.js";
import { createStandardReviewReservation } from
  "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  CandidateManagedRecordV1Schema,
  parseCandidateManagedRecord,
  serializeCandidateManagedRecord,
} from "../../src/lib/work-unit/candidate-attestation.js";
import { collectGitCandidateTarget } from "../../src/lib/work-unit/git-candidate-subject.js";
import { canonicalDigest } from "../../src/lib/canonical/canonical-json.js";
import {
  projectCandidateDeltaVerification,
  recordCandidateVerifiedResponse,
} from "../../src/scripts/review-gate/policy/pre-publication-procedure.js";

const execFileAsync = promisify(execFile);

/**
 * Origin coordinates that parse as `owner/repo` but reach no host.
 *
 * The change-request resolver needs the repository name; `.invalid` is reserved by RFC 2606, so the
 * ref probe fails at name resolution rather than over the network. The resolver classifies the
 * unreachable host as no open change request — the pre-publication state under test.
 */
const OFFLINE_ORIGIN = "https://arc-fixture.invalid/arc-framework/example.git";
const OFFLINE_ENV = { GIT_TERMINAL_PROMPT: "0" };

const META = [
  "# Metadata: example",
  "",
  "| **State** | **Owner**   | **Branch**     | **Class** | **Priority** |",
  "| --------- | ----------- | -------------- | --------- | ------------ |",
  "| `Active`  | `test-user` | `feat/example` | `Light`   | `P2`         |",
  "",
  "- **Cohort:** [none]",
  "- **Depends On:** [none]",
  "",
  "- **Origin:** [internal]",
  "- **Design:** [none]",
  "- **Task List:** `tasks-example.md`",
  "- **Review Rubric:** [none]",
  "- **Promotion Receipt:** [none]",
  "",
  "- **Current Workflow:** [none]",
  "- **Last Completed:** verification",
  "- **Next Task:** [none]",
  "- **Blockers:** [none]",
  "",
  "- **Next Action:** verification complete",
  "",
  "- **PR URL:** [none]",
  "- **Completed:** [none]",
  "",
  "---",
  "",
].join("\n");

/** Stage one verified Active work unit on its own branch, ready to propose. */
async function createAttestableRepo(): Promise<string> {
  const repository = await createTempRepo();
  await mkdir(join(repository, ".arc", "system"), { recursive: true });
  await writeFile(join(repository, ".arc", "system", "arc-config.yml"), "branch.base: main\n");
  await writeFile(join(repository, ".gitignore"), ".arc/user/\n");
  await writeFile(join(repository, "README.md"), "# Fixture\n");
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "-m", "base"]);
  await git(repository, ["remote", "add", "origin", OFFLINE_ORIGIN]);
  await git(repository, ["checkout", "-b", "feat/example"]);
  await mkdir(join(repository, ".arc", "active"), { recursive: true });
  await mkdir(join(repository, "src"), { recursive: true });
  await writeFile(join(repository, ".arc", "active", "meta-example.md"), META);
  await writeFile(join(repository, "src", "example.ts"), "export const example = true;\n");
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "-m", "implementation"]);
  await writeFile(
    join(repository, ".arc", "active", "tasks-example.md"),
    "# Task List: Example\n\n- [x] Verification complete\n",
  );
  await git(repository, ["add", ".arc/active/tasks-example.md"]);
  return repository;
}

describe("attest → pre-publication → publish", () => {
  let repository: string | null = null;

  afterEach(async () => {
    if (repository !== null) await cleanupTempDir(repository);
  });

  it("settles the boundary at pre-publication and submits on the first call", async () => {
    repository = await createAttestableRepo();

    const proposed = await runArc(["attest", "example", "--json"], repository);
    expect(proposed.exitCode, JSON.stringify(proposed)).toBe(0);
    expect(JSON.parse(proposed.stdout)).toMatchObject({
      status: "attested",
      locus: {
        locus: "candidate-review-pending",
        nextAction: { command: "arc review pre-publication example --json" },
      },
    });

    const status = await runArc(["status", "example", "--json"], repository);
    expect(status.exitCode, JSON.stringify(status)).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({
      slug: "example",
      state: "active",
      integrationBoundary: {
        candidateId: JSON.parse(proposed.stdout).locus.candidateId,
        locus: "candidate-review-pending",
        nextAction: { command: "arc review pre-publication example --json" },
      },
    });

    const reviewed = await runArc(
      ["review", "pre-publication", "example", "--self-review", "settled", "--json"],
      repository,
      { env: OFFLINE_ENV },
    );
    expect(reviewed.exitCode, JSON.stringify(reviewed)).toBe(0);
    const envelope = JSON.parse(reviewed.stdout) as Record<string, unknown>;
    expect(envelope).toMatchObject({
      mode: "pre-publication-review",
      workUnit: "example",
      locus: "candidate-publish-ready",
      nextAction: { kind: "publish-candidate", command: "arc publish example --json" },
    });

    const boundaryPath = join(
      ".arc", "system", ".internal", "candidates", "example.boundary.json",
    );
    const boundary = JSON.parse(await readFile(join(repository, boundaryPath), "utf8")) as {
      locus: string;
      candidateId: string;
    };
    expect(boundary.locus).toBe("candidate-publish-ready");
    expect(boundary.candidateId).toBe(envelope.candidateId);
    expect((await git(repository, ["diff", "--cached", "--name-only"])).split("\n"))
      .toContain(boundaryPath.split("\\").join("/"));

    const submitted = await runArc(
      [
        "publish", "example",
        "--last-completed", "verification",
        "--action", "push and open the PR",
        "--json",
      ],
      repository,
      { env: OFFLINE_ENV },
    );

    expect(submitted.exitCode, JSON.stringify(submitted)).toBe(0);
    expect(JSON.parse(submitted.stdout)).toMatchObject({
      status: "published",
      boundary: { locus: "publication-pending", candidateId: envelope.candidateId },
    });
    const publishedMeta = await readFile(join(repository, ".arc", "active", "meta-example.md"), "utf8");
    expect(publishedMeta).toContain("| `Integrating` | `test-user`");
    expect(publishedMeta).toContain("- **Current Workflow:** `integrate-work-unit`");

    // Submission advanced the boundary past its settle point; repeating reports the resume point
    // rather than re-firing the transition.
    const repeated = await runArc(
      [
        "publish", "example",
        "--last-completed", "verification",
        "--action", "push and open the PR",
        "--json",
      ],
      repository,
      { env: OFFLINE_ENV },
    );

    expect(repeated.exitCode, JSON.stringify(repeated)).toBe(0);
    expect(JSON.parse(repeated.stdout)).toMatchObject({
      status: "unchanged",
      boundary: { locus: "publication-pending" },
    });
  });

  it("submits over a boundary an operational-only commit advanced the head past", async () => {
    repository = await createAttestableRepo();
    expect((await runArc(["attest", "example", "--json"], repository)).exitCode).toBe(0);
    await git(repository, ["commit", "-m", "verification"]);

    const reviewed = await runArc(
      ["review", "pre-publication", "example", "--self-review", "settled", "--json"],
      repository,
      { env: OFFLINE_ENV },
    );
    expect(reviewed.exitCode, JSON.stringify(reviewed)).toBe(0);
    expect(JSON.parse(reviewed.stdout)).toMatchObject({ locus: "candidate-publish-ready" });

    // Committing the staged boundary is the ordinary next keystroke, and it moves the head without
    // touching a reviewable byte. Submission authorizes on the reviewable subject, so the settled
    // review evidence still covers this change set and the operator is not sent back through review.
    const reviewedHead = await git(repository, ["rev-parse", "HEAD"]);
    await git(repository, ["commit", "-m", "chore(arc): settle the pre-publication boundary"]);
    expect(await git(repository, ["rev-parse", "HEAD"])).not.toBe(reviewedHead);

    const submitted = await runArc(
      [
        "publish", "example",
        "--last-completed", "verification",
        "--action", "push and open the PR",
        "--json",
      ],
      repository,
      { env: OFFLINE_ENV },
    );

    expect(submitted.exitCode, JSON.stringify(submitted)).toBe(0);
    expect(JSON.parse(submitted.stdout)).toMatchObject({
      status: "published",
      boundary: { locus: "publication-pending" },
    });
  });

  it("preserves advanced review authority when an unchanged Candidate is re-attested", async () => {
    repository = await createAttestableRepo();
    expect((await runArc(["attest", "example", "--json"], repository)).exitCode).toBe(0);
    await git(repository, ["commit", "-m", "verification"]);

    const reviewed = await runArc(
      ["review", "pre-publication", "example", "--self-review", "settled", "--json"],
      repository,
      { env: OFFLINE_ENV },
    );
    expect(reviewed.exitCode, JSON.stringify(reviewed)).toBe(0);
    const reviewedEnvelope = JSON.parse(reviewed.stdout) as {
      candidateId: string;
      candidateSubjectDigest: string;
      target: { headSha: string };
    };
    const boundaryPath = join(
      repository,
      ".arc", "system", ".internal", "candidates", "example.boundary.json",
    );
    const readyBoundary = JSON.parse(await readFile(boundaryPath, "utf8")) as Record<string, unknown>;
    const reservation = createStandardReviewReservation({
      candidateId: reviewedEnvelope.candidateId,
      sourceId: "coderabbit-pr",
      sources: ["coderabbit-pr", "codex-pr"],
      repository: "arc-framework/example",
      headSha: reviewedEnvelope.target.headSha,
      obligation: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"e".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
    });
    await writeFile(boundaryPath, `${JSON.stringify({ ...readyBoundary, reservation }, null, 2)}\n`);
    await git(repository, ["add", boundaryPath]);

    const readyReplay = await runArc(["attest", "example", "--json"], repository);
    expect(readyReplay.exitCode, JSON.stringify(readyReplay)).toBe(0);
    expect(JSON.parse(readyReplay.stdout)).toMatchObject({
      status: "unchanged",
      locus: { locus: "candidate-publish-ready", reservation },
    });

    const submitted = await runArc(
      [
        "publish", "example",
        "--last-completed", "verification",
        "--action", "push and open the PR",
        "--json",
      ],
      repository,
      { env: OFFLINE_ENV },
    );
    expect(submitted.exitCode, JSON.stringify(submitted)).toBe(0);
    expect(JSON.parse(submitted.stdout)).toMatchObject({
      status: "published",
      boundary: { locus: "publication-pending", reservation },
    });

    const publishedReplay = await runArc(["attest", "example", "--json"], repository);
    expect(publishedReplay.exitCode, JSON.stringify(publishedReplay)).toBe(0);
    expect(JSON.parse(publishedReplay.stdout)).toMatchObject({
      status: "unchanged",
      locus: { locus: "publication-pending", reservation },
    });
    const meta = await readFile(join(repository, ".arc", "active", "meta-example.md"), "utf8");
    expect(meta).toContain("- **Current Workflow:** `integrate-work-unit`");
    expect(meta).toContain("- **Next Action:** push and open the PR");
  });

  it("rebinds a carried reservation after an approved Candidate response advances the subject", async () => {
    repository = await createAttestableRepo();
    expect((await runArc(["attest", "example", "--json"], repository)).exitCode).toBe(0);
    await git(repository, ["commit", "-m", "verification"]);

    const reviewed = await runArc(
      ["review", "pre-publication", "example", "--self-review", "settled", "--json"],
      repository,
      { env: OFFLINE_ENV },
    );
    expect(reviewed.exitCode, JSON.stringify(reviewed)).toBe(0);
    const reviewedEnvelope = JSON.parse(reviewed.stdout) as {
      candidateId: string;
      candidateSubjectDigest: string;
      target: { headSha: string };
    };
    const candidatePath = join(
      repository,
      ".arc", "system", ".internal", "candidates", "example.json",
    );
    const boundaryPath = join(
      repository,
      ".arc", "system", ".internal", "candidates", "example.boundary.json",
    );
    const priorBoundary = JSON.parse(await readFile(boundaryPath, "utf8")) as Record<string, unknown>;
    const reservation = createStandardReviewReservation({
      candidateId: reviewedEnvelope.candidateId,
      sourceId: "coderabbit-pr",
      sources: ["coderabbit-pr", "codex-pr"],
      repository: "arc-framework/example",
      headSha: reviewedEnvelope.target.headSha,
      obligation: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"e".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
    });
    await writeFile(boundaryPath, `${JSON.stringify({ ...priorBoundary, reservation }, null, 2)}\n`);
    await writeFile(join(repository, "src", "example.ts"), "export const example = 'fixed';\n");
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "-m", "fix review finding"]);

    const record = parseCandidateManagedRecord(await readFile(candidatePath, "utf8"));
    expect(record).not.toBeNull();
    if (record === null) return;
    const current = await collectGitCandidateTarget({
      cwd: repository,
      name: "example",
      baseBranch: "main",
      exec: async (cmd, args, options) => {
        const result = await execFileAsync(cmd, args, {
          cwd: options?.cwd ?? repository ?? undefined,
          encoding: "utf8",
        });
        return { stdout: result.stdout, stderr: result.stderr };
      },
    });
    const projection = projectCandidateDeltaVerification({ record, current });
    const response = recordCandidateVerifiedResponse({
      projection,
      dispositionId: canonicalDigest({ disposition: "approved" }),
      approvedBy: "test-user",
      appliedBy: "test-agent",
      applicability: "focused",
      verificationEvidenceRefs: ["test://focused"],
    });
    await writeFile(candidatePath, serializeCandidateManagedRecord(CandidateManagedRecordV1Schema.parse({
      ...record,
      responses: [...record.responses, response],
    })));
    await git(repository, ["add", candidatePath]);

    const resumed = await runArc(
      ["review", "pre-publication", "example", "--self-review", "settled", "--json"],
      repository,
      { env: OFFLINE_ENV },
    );
    expect(resumed.exitCode, JSON.stringify(resumed)).toBe(0);
    expect(JSON.parse(await readFile(boundaryPath, "utf8"))).toMatchObject({
      candidateId: reviewedEnvelope.candidateId,
      candidateSubjectDigest: current.subject.subjectDigest,
      reservation: { sources: ["coderabbit-pr", "codex-pr"] },
    });
  });

  it("composes a non-null exact target from a clean committed Candidate", async () => {
    repository = await createAttestableRepo();
    expect((await runArc(["attest", "example", "--json"], repository)).exitCode).toBe(0);
    await git(repository, ["commit", "-m", "verification"]);
    const headSha = await git(repository, ["rev-parse", "HEAD"]);

    const reviewed = await runArc(
      ["review", "pre-publication", "example", "--self-review", "settled", "--json"],
      repository,
      { env: OFFLINE_ENV },
    );

    expect(reviewed.exitCode, JSON.stringify(reviewed)).toBe(0);
    expect(JSON.parse(reviewed.stdout)).toMatchObject({
      locus: "candidate-publish-ready",
      candidateId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      target: {
        kind: "change-set",
        headSha,
        targetId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      },
    });
  });

  it("refuses submission while a pre-publication obligation is still open", async () => {
    repository = await createAttestableRepo();
    expect((await runArc(["attest", "example", "--json"], repository)).exitCode).toBe(0);

    // Self-review is active by package default, so the bare procedure leaves the durable
    // Candidate boundary open rather than authorizing publication.
    const reviewed = await runArc(
      ["review", "pre-publication", "example", "--json"],
      repository,
      { env: OFFLINE_ENV },
    );
    expect(reviewed.exitCode, JSON.stringify(reviewed)).toBe(0);
    expect(JSON.parse(reviewed.stdout)).toMatchObject({
      locus: "candidate-review-pending",
      nextAction: { kind: "run-self-review" },
    });

    const submitted = await runArc(
      [
        "publish", "example",
        "--last-completed", "verification",
        "--action", "push and open the PR",
      ],
      repository,
      { env: OFFLINE_ENV },
    );

    expect(submitted.exitCode).not.toBe(0);
    expect(`${submitted.stdout}${submitted.stderr}`).toContain("pre-publication obligations remain open");
  });
});
