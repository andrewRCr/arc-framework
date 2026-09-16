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
import { advanceBase, movementPaths } from "../helpers/base-advance.js";
import { createStandardReviewReservation } from
  "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  CandidateManagedRecordV1Schema,
  createCandidateReviewResponseEvidence,
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

/**
 * Give one fixture copy a base it can actually move, without touching the coordinate its cases depend on.
 *
 * The rewrite maps the unreachable origin URL onto a local bare repository, so `origin` still reports the name
 * the change-request resolver parses while Git reaches a real target. It is installed per probe rather than in
 * the builder: every case above is written against an origin that resolves to no host, and a rewrite there would
 * change that state for all of them.
 */
async function attachLiveBase(repository: string): Promise<string> {
  const remote = join(repository, ".arc-fixture", "origin.git");
  await mkdir(join(repository, ".arc-fixture"), { recursive: true });
  await writeFile(join(repository, ".git", "info", "exclude"), ".arc-fixture/\n", { flag: "a" });
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await git(repository, ["config", `url.${remote}.insteadOf`, OFFLINE_ORIGIN]);
  await git(repository, ["push", "origin", "main"]);
  return remote;
}

/** Settle the Candidate at its pre-publication boundary, the point the submit window opens from. */
async function settleForPublication(repository: string): Promise<string> {
  expect((await runArc(["attest", "example", "--json"], repository)).exitCode).toBe(0);
  const reviewed = await runArc(
    ["review", "pre-publication", "example", "--self-review", "settled", "--json"],
    repository,
    { env: OFFLINE_ENV },
  );
  expect(reviewed.exitCode, JSON.stringify(reviewed)).toBe(0);
  const envelope = JSON.parse(reviewed.stdout) as { locus: string; candidateId: string };
  expect(envelope.locus).toBe("candidate-publish-ready");
  return envelope.candidateId;
}

function submit(repository: string) {
  return runArc(
    ["publish", "example", "--last-completed", "verification", "--action", "push and open the PR", "--json"],
    repository,
    { env: OFFLINE_ENV },
  );
}

describe("the settle-to-submit window over a live base", () => {
  let repository: string | null = null;

  afterEach(async () => {
    if (repository !== null) await cleanupTempDir(repository);
    repository = null;
  });

  it("submits the same settled Candidate after an advance sharing none of its paths", async () => {
    repository = await createAttestableRepo();
    await attachLiveBase(repository);
    const candidateId = await settleForPublication(repository);
    await advanceBase({ cwd: repository, paths: movementPaths("disjoint", "example").base });

    const submitted = await submit(repository);

    expect(submitted.exitCode, JSON.stringify(submitted)).toBe(0);
    expect(JSON.parse(submitted.stdout)).toMatchObject({
      status: "published",
      boundary: { locus: "publication-pending", candidateId },
    });
  });
});

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
    const projection = projectCandidateDeltaVerification({
      record,
      oldTarget: { revision: record.attestation.baseRevision, subject: record.subject },
      current,
    });
    const independentlyProducedResponse = recordCandidateVerifiedResponse({
      projection,
      dispositionId: canonicalDigest({ disposition: "approved" }),
      approvedBy: "test-user",
      appliedBy: "test-agent",
      applicability: "focused",
      verificationEvidenceRefs: ["test://focused"],
    });
    const response = createCandidateReviewResponseEvidence({
      candidateId: independentlyProducedResponse.candidateId,
      oldTarget: independentlyProducedResponse.oldTarget,
      newTarget: independentlyProducedResponse.newTarget,
      dispositionId: independentlyProducedResponse.dispositionId,
      approvedBy: independentlyProducedResponse.approvedBy,
      appliedBy: independentlyProducedResponse.appliedBy,
      applicability: independentlyProducedResponse.applicability,
      approvedVerification: "focused",
      verificationEvidenceRefs: independentlyProducedResponse.verificationEvidenceRefs,
      implementationChanged: independentlyProducedResponse.implementationChanged,
    });
    await writeFile(candidatePath, serializeCandidateManagedRecord(CandidateManagedRecordV1Schema.parse({
      ...record,
      transitions: [...record.transitions, response],
    })));
    await git(repository, ["add", candidatePath]);

    const resumed = await runArc(
      ["review", "pre-publication", "example", "--self-review", "settled", "--json"],
      repository,
      { env: OFFLINE_ENV },
    );
    expect(resumed.exitCode, JSON.stringify(resumed)).toBe(0);
    expect(JSON.parse(resumed.stdout)).toMatchObject({
      locus: "candidate-convergence-verification-pending",
      nextAction: {
        kind: "run-convergence-verification",
        requiredScope: "focused",
        verificationKind: "focused",
        verificationEvidenceRefRequired: true,
        attestArgv: [
          "arc", "attest", "example", "--scope", "focused",
          "--verification-evidence-ref", "{verificationEvidenceRef}", "--json",
        ],
      },
    });
    const pendingConvergenceBoundary = JSON.parse(await readFile(boundaryPath, "utf8"));
    expect(pendingConvergenceBoundary).toMatchObject({
      candidateId: reviewedEnvelope.candidateId,
      candidateSubjectDigest: current.subject.subjectDigest,
      locus: "candidate-convergence-verification-pending",
      reservation: { sources: ["coderabbit-pr", "codex-pr"] },
    });

    const converged = await runArc([
      "attest", "example", "--scope", "focused",
      "--verification-evidence-ref", "verification://focused-pre-publication-convergence", "--json",
    ], repository);
    expect(converged.exitCode, JSON.stringify(converged)).toBe(0);
    expect(JSON.parse(converged.stdout)).toMatchObject({
      status: "attested",
      operation: "convergence",
      scope: "focused",
      verificationEvidenceRef: "verification://focused-pre-publication-convergence",
      locus: {
        locus: "candidate-review-pending",
        candidateId: reviewedEnvelope.candidateId,
        candidateSubjectDigest: current.subject.subjectDigest,
        reservation: { sources: ["coderabbit-pr", "codex-pr"] },
        nextAction: {
          kind: "continue-pre-publication-review",
          command: "arc review pre-publication example --json",
        },
      },
    });

    const convergedBoundary = JSON.parse(await readFile(boundaryPath, "utf8"));
    expect(convergedBoundary).toMatchObject({
      locus: "candidate-review-pending",
      candidateId: reviewedEnvelope.candidateId,
      candidateSubjectDigest: current.subject.subjectDigest,
      reservation: { sources: ["coderabbit-pr", "codex-pr"] },
    });

    // Recreate the durable state left when the Candidate write succeeds but the later boundary
    // write is interrupted. A retry must install the already-computed convergence resume rather
    // than preserving this stale next action forever.
    await writeFile(boundaryPath, `${JSON.stringify(pendingConvergenceBoundary, null, 2)}\n`);
    await git(repository, ["add", boundaryPath]);
    const recovered = await runArc(["attest", "example", "--json"], repository);
    expect(recovered.exitCode, JSON.stringify(recovered)).toBe(0);
    expect(JSON.parse(recovered.stdout)).toMatchObject({
      status: "unchanged",
      locus: {
        locus: "candidate-review-pending",
        candidateId: reviewedEnvelope.candidateId,
        candidateSubjectDigest: current.subject.subjectDigest,
        reservation: { sources: ["coderabbit-pr", "codex-pr"] },
        nextAction: {
          kind: "continue-pre-publication-review",
          command: "arc review pre-publication example --json",
        },
      },
    });

    // Follow the advertised continuation exactly. Active self-review first returns its own opaque
    // replay command; following that command must still recover the carried reservation and reach
    // publish readiness without a test-only judgment override.
    const continued = await runArc(
      ["review", "pre-publication", "example", "--json"],
      repository,
      { env: OFFLINE_ENV },
    );
    expect(continued.exitCode, JSON.stringify(continued)).toBe(0);
    const continuedEnvelope = JSON.parse(continued.stdout) as {
      locus: string;
      nextAction: { kind: string; command: string };
    };
    expect(continuedEnvelope).toMatchObject({
      locus: "candidate-review-pending",
      nextAction: {
        kind: "run-self-review",
        command: expect.stringMatching(
          /^arc review pre-publication example --resume [A-Za-z0-9_-]+ --json$/u,
        ),
      },
    });
    const replayArgv = continuedEnvelope.nextAction.command.split(" ");
    expect(replayArgv.shift()).toBe("arc");
    const rereviewed = await runArc(replayArgv, repository, { env: OFFLINE_ENV });
    expect(rereviewed.exitCode, JSON.stringify(rereviewed)).toBe(0);
    expect(JSON.parse(rereviewed.stdout)).toMatchObject({
      locus: "candidate-publish-ready",
      candidateId: reviewedEnvelope.candidateId,
      candidateSubjectDigest: current.subject.subjectDigest,
      reservation: { sources: ["coderabbit-pr", "codex-pr"] },
      nextAction: { kind: "publish-candidate", command: "arc publish example --json" },
    });
  });

  it("routes named status through publication finalization while its recovery marker is present", async () => {
    repository = await createAttestableRepo();
    expect((await runArc(["attest", "example", "--json"], repository)).exitCode).toBe(0);
    await git(repository, ["commit", "-m", "verification"]);
    expect((await runArc(
      ["review", "pre-publication", "example", "--self-review", "settled", "--json"],
      repository,
      { env: OFFLINE_ENV },
    )).exitCode).toBe(0);
    expect((await runArc(
      ["publish", "example", "--last-completed", "verification", "--json"],
      repository,
      { env: OFFLINE_ENV },
    )).exitCode).toBe(0);

    const metaPath = join(repository, ".arc", "active", "meta-example.md");
    const publishedMeta = await readFile(metaPath, "utf8");
    await writeFile(metaPath, publishedMeta.replace(
      "- **Current Workflow:** `integrate-work-unit`",
      "- **Current Workflow:** `prepare-work-unit`",
    ));

    const status = await runArc(["status", "example", "--json"], repository);
    expect(status.exitCode, JSON.stringify(status)).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({
      state: "integrating",
      integrationBoundary: {
        locus: "publication-pending",
        nextAction: {
          kind: "continue-publication",
          command: "arc publish example --json",
        },
      },
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
