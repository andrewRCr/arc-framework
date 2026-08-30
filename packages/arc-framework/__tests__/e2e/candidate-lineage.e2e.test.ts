/**
 * Real-CLI coverage for the Candidate lineage a review fix advances.
 *
 * `attest → local review → respond → attest` is driven through the public verbs, so the response
 * evidence under test is the one the commands actually wrote. The checkpoint's convergence guard then
 * runs over the production Candidate reader rather than a hand-built record: the host-dependent reads
 * ahead of it are stubbed, the Candidate reduction it branches on is not.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { writeWorktreeOwnershipMarker } from "../../src/lib/git/worktree-marker.js";
import {
  RepositoryDeliveryPlanStore,
  RepositoryDeliveryStateStore,
} from "../../src/lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import { DeliveryStateV1Schema } from "../../src/lib/delivery/schema.js";
import { renderDeliveryPlanSection } from "../../src/lib/delivery/task-list-render.js";
import { gitExec } from "../../src/lib/io-context.js";
import { runActiveStatus } from "../../src/commands/active.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import {
  readCandidateRecord,
  readCandidateRecordVersioned,
} from "../../src/lib/work-unit/candidate-record-store.js";
import {
  candidateReviewResponses,
  reduceCandidateDurableBaseline,
} from "../../src/lib/work-unit/candidate-attestation.js";
import {
  collectGitCandidateTarget,
  resolveGitCandidateBaseRevision,
} from "../../src/lib/work-unit/git-candidate-subject.js";
import {
  readSubmissionBoundaryVersioned,
  resolveSubmissionBoundaryPath,
  writeSubmissionBoundary,
} from "../../src/lib/work-unit/submission-boundary-store.js";
import { resolveRepositoryIdentity } from "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { bindReviewSourceReference } from "../../src/scripts/review-gate/core/review-source-reference.js";
import {
  LocalReviewOperationStateStore,
} from "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import {
  LocalApprovedDispositionRecordStore,
} from "../../src/scripts/review-gate/hosts/local/disposition-record-store.js";
import {
  deriveLocalReviewTarget,
} from "../../src/scripts/review-gate/hosts/local/repository-target.js";
import {
  recordLaneAttempt,
  settleHostedAttemptFinding,
} from "../../src/scripts/review-gate/lane-progress.js";
import {
  createStandardReviewReservation,
  projectPublicationBoundary,
} from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  createPrePublicationCompositionDependencies,
} from "../../src/scripts/review-gate/policy/pre-publication-composition.js";
import { readRoutedObligation } from "../../src/scripts/review-gate/status-composition.js";
import {
  checkpointIntegration,
  type IntegrationCheckpointDependencies,
} from "../../src/scripts/integration/checkpoint.js";
import {
  createIntegrationCheckpointDependencies,
} from "../../src/scripts/integration/checkpoint-composition.js";
import type {
  IntegrationCheckpointCompositionRecord,
} from "../../src/scripts/integration/checkpoint-store.js";
import {
  createLineageReviewComposer,
} from "../../src/scripts/integration/lineage-review-composition.js";
import {
  mergeIntegration,
  type IntegrationMergeDependencies,
  type IntegrationMergeTarget,
} from "../../src/scripts/integration/merge.js";
import {
  createIntegrationMergeDependencies,
} from "../../src/scripts/integration/merge-composition.js";
import { composeCanonicalSettlementPlan } from "../../src/scripts/integration/settlement-plan.js";
import type { MergeMethodResolveResult } from "../../src/scripts/review-gate/merge-method.js";
import { deliveryThreeMemberStackPlanForWorkUnitFixture } from "../fixtures/delivery-plan.js";
import {
  cleanupTempDir,
  createTempRepo,
  git,
  runArc,
  runArcWithStdin,
  type RunResult,
} from "./helpers.js";

interface Envelope {
  state: string;
  nextAction: string;
  payload: Record<string, unknown>;
}

interface PreparePayload {
  operationId: string;
  target: { targetId: string; headSha: string; headTree: string };
  request: { evaluatorIdentity: string };
  reviewerPayload: {
    sourceDigest: string;
    guidanceDigest: string;
    guidance: { rubricVersion: string; rubricDigest: string };
  };
}

interface ProposalPayload {
  proposal: {
    state: "proposed";
    dispositionSet: { targetId: string; dispositionSetId: string };
  };
}

const SUBPROCESS_HEAVY_TIMEOUT = 60_000;

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

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => cleanupTempDir(root)));
});

function envelope(result: RunResult): Envelope {
  expect(result.exitCode, result.stderr || result.stdout).toBe(0);
  return JSON.parse(result.stdout.trim()) as Envelope;
}

async function invoke(root: string, command: string[], request: unknown): Promise<Envelope> {
  return envelope(await runArcWithStdin(command, root, `${JSON.stringify(request)}\n`));
}

/** Install ARC on a work-unit branch carrying one reviewable file, verified and ready to propose. */
async function fixture(): Promise<string> {
  const root = await createTempRepo("arc-candidate-lineage-");
  roots.push(root);
  const initialized = await runArc(["init", "--yes", "--name", "example"], root);
  expect(initialized.exitCode, initialized.stderr || initialized.stdout).toBe(0);
  await git(root, ["add", ".arc", ".gitignore"]);
  await git(root, ["commit", "-m", "install ARC"]);
  await git(root, ["switch", "-c", "feat/example"]);
  await mkdir(join(root, ".arc", "active"), { recursive: true });
  await writeFile(join(root, ".arc", "active", "meta-example.md"), META, "utf8");
  await writeFile(
    join(root, ".arc", "active", "tasks-example.md"),
    "# Task List: Example\n\n- [x] Verification complete\n",
    "utf8",
  );
  await writeFile(join(root, "reviewed.txt"), "reviewed change\n", "utf8");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "implementation"]);
  return root;
}

async function installThreeMemberDelivery(root: string) {
  const targetHead = await git(root, ["rev-parse", "main^{commit}"]);
  const targetTree = await git(root, ["rev-parse", `${targetHead}^{tree}`]);
  const operationGateHead = await git(root, [
    "commit-tree", targetTree, "-p", targetHead, "-m", "operation-local gate input",
  ]);
  const firstHead = await git(root, ["rev-parse", "HEAD^{commit}"]);
  const firstTree = await git(root, ["rev-parse", "HEAD^{tree}"]);
  await writeFile(join(root, "member-two.txt"), "member two\n", "utf8");
  await git(root, ["add", "member-two.txt"]);
  await git(root, ["commit", "-m", "member two"]);
  const secondHead = await git(root, ["rev-parse", "HEAD^{commit}"]);
  const secondTree = await git(root, ["rev-parse", "HEAD^{tree}"]);

  const plan = deliveryThreeMemberStackPlanForWorkUnitFixture("example");
  const taskList = [
    "# Task List: Example",
    "",
    "- **Design:** `spec-example.md`",
    "",
    "---",
    "",
    renderDeliveryPlanSection(plan),
    "## **Phase 1:** Correct delivery member",
    "",
    "### `[ ]` **1.1 Apply the selected correction**",
    "",
    "## **Phase 2:** Verification",
    "",
    "### `[ ]` **2.1 Verify the work unit**",
    "",
  ].join("\n");
  await writeFile(join(root, ".arc", "active", "tasks-example.md"), taskList, "utf8");
  await writeFile(join(root, "member-three.txt"), "member three\n", "utf8");
  await git(root, ["add", ".arc/active/tasks-example.md", "member-three.txt"]);
  await git(root, ["commit", "-m", "member three and delivery plan"]);
  const thirdHead = await git(root, ["rev-parse", "HEAD^{commit}"]);
  const thirdTree = await git(root, ["rev-parse", "HEAD^{tree}"]);
  await git(root, ["update-ref", "refs/heads/delivery/member-one", firstHead]);
  await git(root, ["update-ref", "refs/heads/delivery/member-two", secondHead]);

  const state = DeliveryStateV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-state/v1",
    planId: plan.planId,
    workUnitId: plan.workUnitId,
    boundPlan: { planRevision: plan.planRevision, planDigest: plan.planDigest },
    target: { ref: "refs/heads/main", coordinates: { head: targetHead, tree: targetTree } },
    members: [
      {
        deliverableId: plan.members[0]!.deliverableId,
        ref: "refs/heads/delivery/member-one",
        changeRequest: { providerId: "github", changeRequestId: "401" },
        coordinates: { base: targetHead, head: firstHead, tree: firstTree },
      },
      {
        deliverableId: plan.members[1]!.deliverableId,
        ref: "refs/heads/delivery/member-two",
        changeRequest: { providerId: "github", changeRequestId: "402" },
        coordinates: { base: firstHead, head: secondHead, tree: secondTree },
      },
      {
        deliverableId: plan.members[2]!.deliverableId,
        ref: "refs/heads/feat/example",
        changeRequest: { providerId: "github", changeRequestId: "403" },
        coordinates: { base: secondHead, head: thirdHead, tree: thirdTree },
      },
    ],
    activeOperation: null,
    pendingReviewFixVerification: null,
  });
  const publisher = new RepositoryGitCommonStatePublisher(gitExec, root);
  const plans = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  const states = new RepositoryDeliveryStateStore(publisher);
  expect(await plans.publishCurrent(plan.planId, plan, null)).toMatchObject({ status: "ok" });
  expect(await states.publish(plan.planId, state, 0)).toMatchObject({ status: "ok" });
  return { plan, operationMemberHead: targetHead, operationGateHead };
}

async function expectStationaryWorkUnitLocus(
  origin: string,
  operationCheckouts: readonly string[],
): Promise<void> {
  const result = await runArc(["locus", "--json"], origin);
  expect(result.exitCode, result.stderr || result.stdout).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    entering: {
      kind: "selected",
      row: {
        kind: "work-unit",
        checkout: { path: origin, branch: "feat/example", detached: false },
        subject: { kind: "work-unit", key: "example" },
      },
    },
    active: {
      checkoutPath: origin,
      subject: { kind: "work-unit", key: "example" },
    },
    roster: expect.arrayContaining(operationCheckouts.map((path) => expect.objectContaining({
      kind: "unmanaged-checkout",
      checkout: expect.objectContaining({ path, branch: null, detached: true }),
    }))),
  });
}

function prepareRequest() {
  return {
    schemaVersion: 1,
    evaluatorIdentity: "reviewer-1",
    routingFacts: {
      contentKind: "code-bearing",
      reviewRisk: "routine",
      changeDeterminacy: "ordinary",
      ownership: "self",
      surfaceAuthority: "ordinary",
    },
  };
}

/** Run one local review to a findings receipt and return the response source it reduces to. */
async function reviewToFindings(root: string): Promise<{ kind: "attested-local"; receiptRef: string }> {
  const prepared = (await invoke(root, ["review", "local", "prepare", "-"], prepareRequest()))
    .payload as unknown as PreparePayload;
  await invoke(root, ["review", "local", "attest", "-"], {
    schemaVersion: 1,
    operationId: prepared.operationId,
    result: {
      status: "complete",
      result: "findings",
      targetId: prepared.target.targetId,
      headSha: prepared.target.headSha,
      headTree: prepared.target.headTree,
      rubricVersion: prepared.reviewerPayload.guidance.rubricVersion,
      rubricDigest: prepared.reviewerPayload.guidance.rubricDigest,
      sourceDigest: prepared.reviewerPayload.sourceDigest,
      guidanceDigest: prepared.reviewerPayload.guidanceDigest,
      evaluatorIdentity: prepared.request.evaluatorIdentity,
      reviewRunId: "run-findings",
      applicabilityId: null,
      findings: [{
        findingId: "finding-1",
        severity: "major",
        locus: "reviewed.txt:1",
        evidenceUrlOrId: "review:finding-1",
      }],
    },
  });
  const reduced = await invoke(root, ["review", "reduce", "-"], {
    schemaVersion: 1,
    operationId: prepared.operationId,
  });
  expect(reduced).toMatchObject({ state: "findings", nextAction: "respond" });
  return (reduced.payload as { responseSource: { kind: "attested-local"; receiptRef: string } })
    .responseSource;
}

/** Propose and approve one disposition over the reduced findings. */
async function approvedSet(
  root: string,
  source:
    | { kind: "attested-local"; receiptRef: string }
    | { kind: "hosted"; attemptRef: string },
  disposition: "fix" | "defer" = "fix",
) {
  const prepared = await invoke(root, ["review", "respond", "-"], {
    schemaVersion: 1,
    source,
    proposal: {
      findings: [{
        findingId: "finding-1",
        sourceVerification: "verified",
        verificationRefs: ["source:reviewed.txt:1"],
        disposition,
        rationale: disposition === "fix"
          ? "The reviewed source supports applying this fix."
          : "The reviewed source supports carrying this to a follow-up.",
        recommendation: disposition === "fix" ? "Apply the fix." : "Carry this to a follow-up.",
        openQuestions: [],
      }],
    },
  });
  expect(prepared).toMatchObject({ state: "awaiting-approval", nextAction: "obtain-approval" });
  const { proposal } = prepared.payload as unknown as ProposalPayload;
  return {
    ...proposal,
    state: "approved" as const,
    approval: {
      schemaVersion: 2 as const,
      semanticsVersion: "review-gate/v2" as const,
      targetId: proposal.dispositionSet.targetId,
      dispositionSetId: proposal.dispositionSet.dispositionSetId,
      approvedBy: "test-user",
      approvedAt: "2026-08-15T21:00:00Z",
    },
  };
}

/**
 * Run the real checkpoint over the production Candidate reader.
 *
 * Drift and lifecycle are the host- and artifact-dependent reads ahead of the guard; stubbing them
 * clean is what lets an offline fixture reach the branch the Candidate record actually decides.
 */
async function checkpointOver(root: string, cadence: "manual" | "with-integration" = "manual") {
  const production = createIntegrationCheckpointDependencies({ cwd: root, exec: gitExec });
  const shipped = cadence === "with-integration";
  const dependencies: IntegrationCheckpointDependencies = {
    ...production,
    readDrift: async (workUnit) => ({
      ...await production.readDrift(workUnit),
      verdict: "clean",
      baseOid: await resolveGitCandidateBaseRevision({ cwd: root, baseBranch: "main", exec: gitExec }),
    }),
    readLifecycle: async (workUnit) => ({
      workUnit,
      storageVersion: await git(root, ["rev-parse", "HEAD"]),
      archiveCadence: cadence,
      state: shipped ? "shipped" : "integrating",
      position: shipped
        ? { phase: "Shipped", location: "completed" }
        : { phase: "Integrating", location: "active" },
      artifactFacts: [],
      complete: true,
    }),
  };
  return checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, dependencies);
}

/** Relocate the work unit's artifacts the way the `with-integration` archive sweep does. */
async function archiveArtifacts(root: string, companions: readonly string[] = []): Promise<string> {
  const destination = join(".arc", "completed", "2026-q3", "01_example");
  await mkdir(join(root, destination), { recursive: true });
  for (const artifact of ["meta", "tasks", ...companions]) {
    await git(root, [
      "mv",
      join(".arc", "active", `${artifact}-example.md`),
      join(destination, `${artifact}-example.md`),
    ]);
  }
  await git(root, ["commit", "-m", "archive the shipped work unit"]);
  return destination;
}

describe("review-fix Candidate lineage", () => {
  it("keeps lifecycle-regenerated project state outside Candidate currentness", async () => {
    const root = await fixture();
    expect((await runArc(["attest", "example", "--json"], root)).exitCode).toBe(0);
    await git(root, ["commit", "-m", "verification"]);

    await mkdir(join(root, ".arc", "backlog"), { recursive: true });
    await writeFile(join(root, ".arc", "backlog", "ROADMAP.md"), "# Regenerated transition view\n", "utf8");
    await git(root, ["add", ".arc/backlog/ROADMAP.md"]);
    await git(root, ["commit", "-m", "submit transition"]);

    await expect(checkpointOver(root)).resolves.not.toMatchObject({
      reason: "candidate-unexplained-delta",
    });

    await writeFile(join(root, "reviewed.txt"), "genuine reviewable delta\n", "utf8");
    await git(root, ["add", "reviewed.txt"]);
    await git(root, ["commit", "-m", "unexplained implementation"]);

    await expect(checkpointOver(root)).resolves.toMatchObject({
      state: "candidate-applicability",
      payload: { state: "decision-required", paths: ["reviewed.txt"] },
    });
  });

  it("keeps a Candidate current across the archive relocation a with-integration ship performs", async () => {
    const root = await fixture();
    expect((await runArc(["attest", "example", "--json"], root)).exitCode).toBe(0);
    await git(root, ["commit", "-m", "verification"]);

    // The cadence that ships and archives in one pass relocates the work unit's own artifacts before
    // the checkpoint reads them, so a path-literal classification sees the move as reviewable content
    // nobody reviewed — the two preconditions are then mutually exclusive.
    await archiveArtifacts(root);

    await expect(checkpointOver(root, "with-integration")).resolves.not.toMatchObject({
      reason: "candidate-unexplained-delta",
    });
  });

  it("reads a content change to a relocated work-unit artifact as a reviewable delta", async () => {
    const root = await fixture();
    expect((await runArc(["attest", "example", "--json"], root)).exitCode).toBe(0);
    await git(root, ["commit", "-m", "verification"]);
    const destination = await archiveArtifacts(root);

    await writeFile(
      join(root, destination, "tasks-example.md"),
      "# Task List: Example\n\n- [x] Verification complete\n- [x] Unreviewed addition\n",
      "utf8",
    );
    await git(root, ["add", "-A"]);
    await git(root, ["commit", "-m", "edit the archived task list"]);

    await expect(checkpointOver(root, "with-integration")).resolves.toMatchObject({
      state: "candidate-applicability",
      payload: { state: "decision-required" },
    });
  });

  it("keeps an open-ended work-unit companion current across archive relocation", async () => {
    const root = await fixture();
    await writeFile(join(root, ".arc", "active", "evidence-example.md"), "# Review evidence\n", "utf8");
    await git(root, ["add", ".arc/active/evidence-example.md"]);
    await git(root, ["commit", "-m", "add work-unit companion"]);
    expect((await runArc(["attest", "example", "--json"], root)).exitCode).toBe(0);
    await git(root, ["commit", "-m", "verification"]);

    await archiveArtifacts(root, ["evidence"]);

    await expect(checkpointOver(root, "with-integration")).resolves.not.toMatchObject({
      reason: "candidate-unexplained-delta",
    });
  });

  it("refuses two live artifacts that collapse onto one canonical Candidate key", async () => {
    const root = await fixture();
    await mkdir(join(root, ".arc", "completed", "2026-q3", "01_example"), { recursive: true });
    await writeFile(join(root, ".arc", "active", "evidence-example.md"), "# Active evidence\n", "utf8");
    await writeFile(
      join(root, ".arc", "completed", "2026-q3", "01_example", "evidence-example.md"),
      "# Archived evidence\n",
      "utf8",
    );
    await git(root, ["add", "-A"]);

    await expect(collectGitCandidateTarget({
      cwd: root,
      name: "example",
      baseBranch: "main",
      exec: gitExec,
    })).rejects.toThrow(/collides with Candidate key/u);
  });

  it("projects a mechanically carried Candidate as the effective pre-publication target", async () => {
    const root = await createTempRepo("arc-candidate-effective-target-");
    roots.push(root);
    const initialized = await runArc(["init", "--yes", "--name", "example"], root);
    expect(initialized.exitCode, initialized.stderr || initialized.stdout).toBe(0);
    await writeFile(
      join(root, "reviewed.txt"),
      "base\ncommon-2\ncommon-3\ncommon-4\ncommon-5\ncommon-6\ncommon-7\ncommon-8\ncommon-9\ncommon-10\n",
      "utf8",
    );
    await git(root, ["add", "-A"]);
    await git(root, ["commit", "-m", "install ARC"]);
    const localBase = await git(root, ["rev-parse", "main^{commit}"]);

    await git(root, ["switch", "-c", "feat/example"]);
    await mkdir(join(root, ".arc", "active"), { recursive: true });
    await writeFile(join(root, ".arc", "active", "meta-example.md"), META, "utf8");
    await writeFile(
      join(root, ".arc", "active", "tasks-example.md"),
      "# Task List: Example\n\n- [x] Verification complete\n",
      "utf8",
    );
    await writeFile(
      join(root, "reviewed.txt"),
      "base\ncommon-2\ncommon-3\ncommon-4\ncommon-5\ncommon-6\ncommon-7\ncommon-8\ncommon-9\nfeature\n",
      "utf8",
    );
    await git(root, ["add", "-A"]);
    await git(root, ["commit", "-m", "feature implementation"]);
    expect((await runArc(["attest", "example", "--json"], root)).exitCode).toBe(0);
    await git(root, ["add", "-A"]);
    await git(root, ["commit", "-m", "record candidate"]);

    await git(root, ["switch", "main"]);
    await writeFile(
      join(root, "reviewed.txt"),
      "moved\ncommon-2\ncommon-3\ncommon-4\ncommon-5\ncommon-6\ncommon-7\ncommon-8\ncommon-9\ncommon-10\n",
      "utf8",
    );
    await git(root, ["add", "reviewed.txt"]);
    await git(root, ["commit", "-m", "move base"]);
    const currentBase = await git(root, ["rev-parse", "HEAD^{commit}"]);
    await git(root, ["switch", "feat/example"]);
    await git(root, ["update-ref", "refs/remotes/origin/main", currentBase]);
    await git(root, ["branch", "-f", "main", localBase]);
    await git(root, ["merge", "--no-ff", currentBase, "-m", "merge base"]);
    const mergedHead = await git(root, ["rev-parse", "HEAD^{commit}"]);
    expect(await git(root, ["rev-parse", "main^{commit}"])).toBe(localBase);
    expect(await git(root, ["rev-parse", "refs/remotes/origin/main^{commit}"])).toBe(currentBase);

    const composition = createPrePublicationCompositionDependencies({ cwd: root, exec: gitExec });
    const candidate = await composition.readCandidate("example");
    expect(candidate, JSON.stringify(candidate)).toMatchObject({
      status: "current",
      headSha: mergedHead,
    });
    await expect(createIntegrationCheckpointDependencies({ cwd: root, exec: gitExec })
      .readCandidate("example")).resolves.toMatchObject({
        status: "current",
        recognizedRevision: mergedHead,
      });
    await expect(checkpointOver(root)).resolves.not.toMatchObject({
      reason: "candidate-unexplained-delta",
    });
    await expect(runActiveStatus({ cwd: root, exec: gitExec })).resolves.toMatchObject({
      candidates: [{
        integrationBoundary: {
          candidateSubjectDigest: candidate.status === "current" ? candidate.subjectDigest : "unavailable",
        },
      }],
    });
    if (candidate.status !== "current") throw new Error("machine-carried Candidate was not current");
    await expect(readRoutedObligation(root, gitExec, {
      repository: "owner/repo",
      headRef: "feat/example",
      headSha: mergedHead,
    }, 42)).resolves.toMatchObject({
      state: "blocked",
      detail: "The publication boundary belongs to a different Candidate subject.",
    });

    const source = await reviewToFindings(root);
    const dispositions = await approvedSet(root, source);
    await expect(invoke(root, ["review", "respond", "-"], {
      schemaVersion: 1,
      source,
      dispositions,
    })).resolves.toMatchObject({ state: "ready-to-fix", nextAction: "apply-fix" });
    await writeFile(
      join(root, "reviewed.txt"),
      "moved\ncommon-2\ncommon-3\ncommon-4\ncommon-5\ncommon-6\ncommon-7\ncommon-8\ncommon-9\nfixed\n",
      "utf8",
    );
    await git(root, ["add", "reviewed.txt"]);
    await git(root, ["commit", "-m", "apply approved fix"]);

    await expect(invoke(root, ["review", "respond", "-"], {
      schemaVersion: 1,
      source,
      dispositions,
      verifiedFix: {
        applicability: "focused",
        verificationEvidenceRefs: ["verification://focused-fix"],
      },
    })).resolves.toMatchObject({ state: "candidate-advanced", nextAction: "continue-review" });
    const record = await readCandidateRecord(root, "example");
    expect(candidateReviewResponses(record ?? { transitions: [] }).at(-1)?.oldTarget.revision).toBe(mergedHead);
    await git(root, ["commit", "-m", "record verified response"]);
    await expect(createLineageReviewComposer({ cwd: root, exec: gitExec })(
      "example",
      await git(root, ["rev-parse", "HEAD^{commit}"]),
    )).resolves.toMatchObject({
      dispositionIds: [dispositions.dispositionSet.dispositionSetId],
    });
  }, SUBPROCESS_HEAVY_TIMEOUT);

  it("clears a Candidate no response can explain through a deliberately re-rooted lineage", async () => {
    const root = await fixture();
    const proposed = await runArc(["attest", "example", "--json"], root);
    expect(proposed.exitCode, proposed.stderr || proposed.stdout).toBe(0);
    const superseded = (JSON.parse(proposed.stdout) as { locus: { candidateId: string } }).locus.candidateId;
    await git(root, ["commit", "-m", "verification"]);

    await writeFile(join(root, "reviewed.txt"), "unexplained implementation\n", "utf8");
    await git(root, ["add", "reviewed.txt"]);
    await git(root, ["commit", "-m", "unexplained implementation"]);

    const prePublication = await runArc(["review", "pre-publication", "example", "--json"], root);
    expect(prePublication.exitCode).toBe(1);
    expect(JSON.parse(prePublication.stdout)).toMatchObject({
      error: { code: "candidate-unexplained-delta" },
      remedy: { argv: ["arc", "attest", "example", "--new-root"] },
    });

    // The default re-attestation refuses while checkpoint exposes the bounded applicability decision.
    // Re-rooting remains the explicit escape when the change is genuinely outside the Candidate.
    const refused = await runArc(["attest", "example", "--json"], root);
    expect(refused.exitCode).toBe(1);
    expect(JSON.parse(refused.stdout)).toMatchObject({ status: "blocked", candidateId: superseded });
    await expect(checkpointOver(root)).resolves.toMatchObject({
      state: "candidate-applicability",
      payload: { state: "decision-required", paths: ["reviewed.txt"] },
    });

    const rerooted = await runArc(["attest", "example", "--new-root", "--json"], root);
    expect(rerooted.exitCode, rerooted.stderr || rerooted.stdout).toBe(0);
    expect(JSON.parse(rerooted.stdout)).toMatchObject({
      status: "attested",
      operation: "re-root",
      locus: { locus: "candidate-review-pending" },
    });
    await git(root, ["commit", "-m", "re-attest over full verification"]);

    const record = await readCandidateRecord(root, "example");
    expect(record?.attestation.supersedes).toBe(superseded);
    expect(record?.attestation.candidateId).not.toBe(superseded);
    await expect(checkpointOver(root)).resolves.not.toMatchObject({
      reason: "candidate-unexplained-delta",
    });
  });

  it("advances the lineage, blocks the checkpoint, and clears through attest", async () => {
    const root = await fixture();

    const proposed = await runArc(["attest", "example", "--json"], root);
    expect(proposed.exitCode, proposed.stderr || proposed.stdout).toBe(0);
    expect(JSON.parse(proposed.stdout)).toMatchObject({ status: "attested", operation: "root" });
    await git(root, ["commit", "-m", "verification"]);
    const reviewedHead = await git(root, ["rev-parse", "HEAD"]);

    const source = await reviewToFindings(root);
    const dispositions = await approvedSet(root, source);
    await expect(invoke(root, ["review", "respond", "-"], { schemaVersion: 1, source, dispositions }))
      .resolves.toMatchObject({ state: "ready-to-fix", nextAction: "apply-fix" });

    await writeFile(join(root, "reviewed.txt"), "reviewed change, fixed\n", "utf8");
    await git(root, ["add", "reviewed.txt"]);
    await git(root, ["commit", "-m", "apply approved fix"]);

    const advanced = await invoke(root, ["review", "respond", "-"], {
      schemaVersion: 1,
      source,
      dispositions,
      verifiedFix: {
        applicability: "focused",
        verificationEvidenceRefs: ["verification://focused-fix"],
      },
    });
    expect(advanced).toMatchObject({
      state: "candidate-advanced",
      nextAction: "continue-review",
      payload: { implementationChanged: true },
    });
    const composition = createPrePublicationCompositionDependencies({ cwd: root, exec: gitExec });
    const candidate = await composition.readCandidate("example");
    expect(candidate.status).toBe("current");
    if (candidate.status !== "current") {
      throw new Error("expected a current Candidate lineage");
    }
    expect(candidate.lineageHeadShas).toContain(reviewedHead);
    await expect(composition.readLaneProgress(
      "standard",
      candidate.headSha,
      candidate.lineageHeadShas,
    )).resolves.toMatchObject({ status: "recorded", completedPasses: 1 });

    // The lineage now explains the fixed subject, so the Candidate is current — and unverified at its
    // converged head, which is the exact state the checkpoint refuses to approve.
    await expect(checkpointOver(root)).resolves.toMatchObject({
      state: "blocked",
      reason: "candidate-convergence-pending",
      payload: { candidate: { status: "current", implementationChanged: true } },
    });

    const converged = await runArc(["attest", "example", "--json"], root);
    expect(converged.exitCode, converged.stderr || converged.stdout).toBe(0);
    expect(JSON.parse(converged.stdout)).toMatchObject({
      status: "attested",
      operation: "convergence",
      locus: { locus: "candidate-review-pending" },
    });

    const cleared = await checkpointOver(root);
    expect(cleared).not.toMatchObject({ reason: "candidate-convergence-pending" });
  });

  it("converges when an operational-only commit precedes the re-attestation", async () => {
    const root = await fixture();
    expect((await runArc(["attest", "example", "--json"], root)).exitCode).toBe(0);
    await git(root, ["commit", "-m", "verification"]);
    const source = await reviewToFindings(root);
    const dispositions = await approvedSet(root, source);
    await invoke(root, ["review", "respond", "-"], { schemaVersion: 1, source, dispositions });
    await writeFile(join(root, "reviewed.txt"), "reviewed change, fixed\n", "utf8");
    await git(root, ["add", "reviewed.txt"]);
    await git(root, ["commit", "-m", "apply approved fix"]);
    await invoke(root, ["review", "respond", "-"], {
      schemaVersion: 1,
      source,
      dispositions,
      verifiedFix: { applicability: "focused", verificationEvidenceRefs: ["verification://focused-fix"] },
    });

    // Committing the response record advances the head without touching a reviewable byte, so the
    // re-attestation lands at a revision the response never named. Convergence is keyed to the
    // verified content, which is what keeps the attestation the primary just ran from being unusable.
    const responseHead = await git(root, ["rev-parse", "HEAD"]);
    await git(root, ["commit", "-m", "record verified response"]);
    expect(await git(root, ["rev-parse", "HEAD"])).not.toBe(responseHead);

    const converged = await runArc(["attest", "example", "--json"], root);
    expect(converged.exitCode, converged.stderr || converged.stdout).toBe(0);
    expect(JSON.parse(converged.stdout)).toMatchObject({ status: "attested", operation: "convergence" });

    await expect(checkpointOver(root)).resolves.not.toMatchObject({
      reason: "candidate-convergence-pending",
    });
  });

  it("resolves review responses and deliberate re-rooting from an archived Shipped record", async () => {
    const root = await fixture();
    expect((await runArc(["attest", "example", "--json"], root)).exitCode).toBe(0);
    await git(root, ["commit", "-m", "verification"]);
    const source = await reviewToFindings(root);
    const dispositions = await approvedSet(root, source);

    const metaPath = join(root, ".arc", "active", "meta-example.md");
    const meta = await readFile(metaPath, "utf8");
    await writeFile(metaPath, meta.replace("| `Active`  |", "| `Shipped` |"), "utf8");
    await git(root, ["add", ".arc/active/meta-example.md"]);
    await archiveArtifacts(root);
    expect(await git(root, ["status", "--porcelain"])).toBe("");

    await expect(invoke(root, ["review", "respond", "-"], {
      schemaVersion: 1,
      source,
      dispositions,
    })).resolves.toMatchObject({ state: "ready-to-fix", nextAction: "apply-fix" });

    await writeFile(join(root, "reviewed.txt"), "verified replacement root\n", "utf8");
    await git(root, ["add", "reviewed.txt"]);
    const rerooted = await runArc(["attest", "example", "--new-root", "--json"], root);

    expect(rerooted.exitCode, rerooted.stderr || rerooted.stdout).toBe(0);
    expect(JSON.parse(rerooted.stdout)).toMatchObject({
      status: "attested",
      operation: "re-root",
      locus: { workUnit: "example", locus: "candidate-review-pending" },
    });
    expect(await git(root, ["status", "--short"]))
      .toMatch(/completed\/2026-q3\/01_example\/meta-example\.md/u);
  });

  it("does not advance a completed Candidate while another work unit owns the checkout", async () => {
    const root = await fixture();
    expect((await runArc(["attest", "example", "--json"], root)).exitCode).toBe(0);
    await git(root, ["commit", "-m", "verification"]);
    const source = await reviewToFindings(root);
    const dispositions = await approvedSet(root, source);

    const metaPath = join(root, ".arc", "active", "meta-example.md");
    const meta = await readFile(metaPath, "utf8");
    await writeFile(metaPath, meta.replace("| `Active`  |", "| `Shipped` |"), "utf8");
    await git(root, ["add", ".arc/active/meta-example.md"]);
    await archiveArtifacts(root);
    await expect(invoke(root, ["review", "respond", "-"], {
      schemaVersion: 1,
      source,
      dispositions,
    })).resolves.toMatchObject({ state: "ready-to-fix", nextAction: "apply-fix" });

    await writeFile(join(root, "reviewed.txt"), "reviewed change, fixed\n", "utf8");
    await git(root, ["add", "reviewed.txt"]);
    await git(root, ["commit", "-m", "apply approved fix"]);

    await mkdir(join(root, ".arc", "active"), { recursive: true });
    await writeFile(
      join(root, ".arc", "active", "meta-active-owner.md"),
      META.replaceAll("example", "active-owner"),
      "utf8",
    );
    await writeFile(
      join(root, ".arc", "active", "tasks-active-owner.md"),
      "# Task List: Active owner\n\n- [ ] Continue active work\n",
      "utf8",
    );
    await git(root, ["add", ".arc/active"]);
    await git(root, ["commit", "-m", "activate another work unit"]);

    const candidatePath = join(root, ".arc", "system", ".internal", "candidates", "example.json");
    const candidateBefore = await readFile(candidatePath, "utf8");
    const response = await runArcWithStdin(["review", "respond", "-"], root, `${JSON.stringify({
      schemaVersion: 1,
      source,
      dispositions,
      verifiedFix: { applicability: "focused", verificationEvidenceRefs: ["verification://focused-fix"] },
    })}\n`);

    expect(response.exitCode).not.toBe(0);
    expect(await readFile(candidatePath, "utf8")).toBe(candidateBefore);
    expect(await git(root, [
      "diff",
      "--cached",
      "--name-only",
      "--",
      ".arc/system/.internal/candidates/example.json",
    ])).toBe("");

    const candidateDirty = `${candidateBefore}\n`;
    await writeFile(candidatePath, candidateDirty, "utf8");
    const responseWithForeignDirt = await runArcWithStdin(
      ["review", "respond", "-"],
      root,
      `${JSON.stringify({
        schemaVersion: 1,
        source,
        dispositions,
        verifiedFix: { applicability: "focused", verificationEvidenceRefs: ["verification://focused-fix"] },
      })}\n`,
    );
    expect(responseWithForeignDirt.exitCode).not.toBe(0);
    expect(await readFile(candidatePath, "utf8")).toBe(candidateDirty);
    expect(await git(root, [
      "diff",
      "--cached",
      "--name-only",
      "--",
      ".arc/system/.internal/candidates/example.json",
    ])).toBe("");
    expect(await git(root, ["status", "--short", "--", candidatePath]))
      .toBe("M .arc/system/.internal/candidates/example.json");
  }, SUBPROCESS_HEAVY_TIMEOUT);

  it("does not advance an owned Candidate from an unresolved work-unit carrier", async () => {
    const root = await fixture();
    expect((await runArc(["attest", "example", "--json"], root)).exitCode).toBe(0);
    await git(root, ["commit", "-m", "verification"]);
    const source = await reviewToFindings(root);
    const dispositions = await approvedSet(root, source);
    const responseInput = {
      schemaVersion: 1,
      source,
      dispositions,
      verifiedFix: { applicability: "focused", verificationEvidenceRefs: ["verification://focused-fix"] },
    };

    await expect(invoke(root, ["review", "respond", "-"], {
      schemaVersion: 1,
      source,
      dispositions,
    })).resolves.toMatchObject({ state: "ready-to-fix", nextAction: "apply-fix" });
    await writeFile(join(root, "reviewed.txt"), "reviewed change, fixed\n", "utf8");
    await git(root, ["add", "reviewed.txt"]);
    await git(root, ["commit", "-m", "apply approved fix"]);

    const carrierParent = await mkdtemp(join(tmpdir(), "arc-review-response-carrier-"));
    const original = join(carrierParent, "original");
    const carrier = join(carrierParent, "replacement");
    await git(root, ["switch", "main"]);
    await git(root, ["worktree", "add", original, "feat/example"]);
    await writeWorktreeOwnershipMarker(original, {
      createdByArc: true,
      createdFor: { kind: "work-unit", name: "example" },
      spawningIdentity: "test-user",
      now: Date.parse("2026-08-29T00:00:00.000Z"),
    });
    await git(original, ["switch", "--detach"]);
    await git(root, ["worktree", "add", carrier, "feat/example"]);
    try {
      const locus = await runArc(["locus", "--json"], carrier);
      expect(locus.exitCode, locus.stderr || locus.stdout).toBe(0);
      expect(JSON.parse(locus.stdout)).toMatchObject({
        entering: {
          kind: "selected",
          row: {
            kind: "unresolved-checkout",
            checkout: { path: carrier },
            diagnostics: expect.arrayContaining([
              expect.objectContaining({ code: "work-unit-locus-conflict" }),
            ]),
          },
        },
        active: null,
      });

      const candidatePath = join(carrier, ".arc", "system", ".internal", "candidates", "example.json");
      const candidateBefore = await readFile(candidatePath, "utf8");
      const refused = await runArcWithStdin(
        ["review", "respond", "-"],
        carrier,
        `${JSON.stringify(responseInput)}\n`,
      );
      expect(refused.exitCode).not.toBe(0);
      expect(await readFile(candidatePath, "utf8")).toBe(candidateBefore);
      expect(await git(carrier, ["diff", "--cached", "--name-only", "--", candidatePath])).toBe("");
    } finally {
      await git(root, ["worktree", "remove", "--force", carrier]).catch(() => undefined);
      await git(root, ["worktree", "remove", "--force", original]).catch(() => undefined);
      await cleanupTempDir(carrierParent);
      await git(root, ["switch", "feat/example"]);
    }

    await expect(invoke(root, ["review", "respond", "-"], responseInput)).resolves.toMatchObject({
      state: "candidate-advanced",
    });
  }, SUBPROCESS_HEAVY_TIMEOUT);

  it("keeps one marker-owned work-unit locus through correction, review, verification, and integration entry", async () => {
    const root = await fixture();
    const delivery = await installThreeMemberDelivery(root);
    const checkoutParent = await mkdtemp(join(tmpdir(), "arc-stationary-delivery-cycle-"));
    const origin = join(checkoutParent, "origin");
    const memberCheckout = join(checkoutParent, "member-input");
    const gateCheckout = join(checkoutParent, "gate-input");
    await git(root, ["switch", "main"]);
    await git(root, ["worktree", "add", origin, "feat/example"]);
    await writeWorktreeOwnershipMarker(origin, {
      createdByArc: true,
      createdFor: { kind: "work-unit", name: "example" },
      spawningIdentity: "test-user",
      now: Date.parse("2026-08-29T00:00:00.000Z"),
    });
    await git(root, ["worktree", "add", "--detach", memberCheckout, delivery.operationMemberHead]);
    await git(root, ["worktree", "add", "--detach", gateCheckout, delivery.operationGateHead]);
    const operationCheckouts = [memberCheckout, gateCheckout];
    try {
      await expectStationaryWorkUnitLocus(origin, operationCheckouts);
      const correction = await runArcWithStdin(
        ["delivery", "entry", "inspect", "--input", "-", "--json"],
        origin,
        `${JSON.stringify({ entryMode: "execution" })}\n`,
      );
      expect(correction.exitCode, correction.stderr || correction.stdout).toBe(0);
      expect(JSON.parse(correction.stdout)).toMatchObject({
        status: "correction-routing-required",
        nextAction: "plan-review-fix",
        planId: delivery.plan.planId,
        selectedDeliverableId: delivery.plan.members[0]!.deliverableId,
      });
      await expectStationaryWorkUnitLocus(origin, operationCheckouts);

      const taskPath = join(origin, ".arc", "active", "tasks-example.md");
      const tasks = await readFile(taskPath, "utf8");
      await writeFile(
        taskPath,
        tasks
          .replace("### `[ ]` **1.1 Apply the selected correction**", "### `[x]` **1.1 Apply the selected correction**")
          .replace("### `[ ]` **2.1 Verify the work unit**", "### `[x]` **2.1 Verify the work unit**"),
        "utf8",
      );
      await git(origin, ["add", ".arc/active/tasks-example.md"]);
      await git(origin, ["commit", "-m", "close correction and verification"]);
      const proposed = await runArc(["attest", "example", "--json"], origin);
      expect(proposed.exitCode, proposed.stderr || proposed.stdout).toBe(0);
      expect(JSON.parse(proposed.stdout)).toMatchObject({ status: "attested", operation: "root" });
      await git(origin, ["commit", "-m", "record verification"]);

      const source = await reviewToFindings(origin);
      const dispositions = await approvedSet(origin, source);
      await expect(invoke(origin, ["review", "respond", "-"], {
        schemaVersion: 1,
        source,
        dispositions,
      })).resolves.toMatchObject({ state: "ready-to-fix", nextAction: "apply-fix" });
      await writeFile(join(origin, "reviewed.txt"), "stationary reviewed fix\n", "utf8");
      await git(origin, ["add", "reviewed.txt"]);
      await git(origin, ["commit", "-m", "apply stationary reviewed fix"]);
      await expect(invoke(origin, ["review", "respond", "-"], {
        schemaVersion: 1,
        source,
        dispositions,
        verifiedFix: {
          applicability: "focused",
          verificationEvidenceRefs: ["verification://stationary-fix"],
        },
      })).resolves.toMatchObject({ state: "candidate-advanced" });
      await expectStationaryWorkUnitLocus(origin, operationCheckouts);

      const converged = await runArc(["attest", "example", "--json"], origin);
      expect(converged.exitCode, converged.stderr || converged.stdout).toBe(0);
      expect(JSON.parse(converged.stdout)).toMatchObject({ status: "attested", operation: "convergence" });
      await expectStationaryWorkUnitLocus(origin, operationCheckouts);
      await git(origin, ["commit", "-m", "record converged verification"]);

      const integrating = await runArcWithStdin(
        ["delivery", "entry", "inspect", "--input", "-", "--json"],
        origin,
        `${JSON.stringify({ entryMode: "integrating" })}\n`,
      );
      expect(integrating.exitCode, integrating.stderr || integrating.stdout).toBe(0);
      expect(JSON.parse(integrating.stdout)).toMatchObject({
        status: "resume-bound",
        nextAction: "read-position-and-reconcile",
        planId: delivery.plan.planId,
      });
      await expectStationaryWorkUnitLocus(origin, operationCheckouts);
    } finally {
      await git(root, ["worktree", "remove", "--force", gateCheckout]).catch(() => undefined);
      await git(root, ["worktree", "remove", "--force", memberCheckout]).catch(() => undefined);
      await git(root, ["worktree", "remove", "--force", origin]).catch(() => undefined);
      await cleanupTempDir(checkoutParent);
    }
  }, SUBPROCESS_HEAVY_TIMEOUT);

  it("composes the settlement plan its approved responses back", async () => {
    const { root, approvedHead } = await settledReviewLineage();
    const composed = await createLineageReviewComposer({ cwd: root, exec: gitExec })("example", approvedHead);

    expect(composed.dispositionIds).toHaveLength(1);
    expect(composed.actions).toHaveLength(1);
    expect(composed.actions[0]).toMatchObject({
      channel: "review-response",
      dispositionId: composed.dispositionIds[0],
      fixTarget: { headSha: approvedHead },
    });
  });

  it("advances and replays a settled hosted fix through Candidate convergence", async () => {
    const root = await fixture();
    expect((await runArc(["attest", "example", "--json"], root)).exitCode).toBe(0);
    await git(root, ["commit", "-m", "verification"]);

    const publisher = new RepositoryGitCommonStatePublisher(gitExec, root);
    const operationStore = new LocalReviewOperationStateStore(publisher);
    const repositoryId = await resolveRepositoryIdentity(publisher);
    const originTarget = await deriveLocalReviewTarget({
      cwd: root,
      exec: gitExec,
      baseRef: "main",
      repositoryId,
    });
    const requirement = createReviewRequirement({
      target: originTarget,
      projection: OBLIGATION,
      acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
      initialAdmission: "automatic",
    });
    if (requirement === null) throw new Error("missing hosted requirement fixture");
    const attemptId = "hosted/attempt-fix";
    const finding = {
      findingId: "finding-1",
      origin: "review-thread" as const,
      commentId: "comment-1",
      threadId: "thread-1",
      settlement: "reply-and-resolve" as const,
      severity: "major" as const,
      locus: "reviewed.txt:1",
      url: "https://example.test/thread-1",
    };
    const operation = await recordLaneAttempt(operationStore, {
      lane: "standard",
      repositoryId,
      changeRequestId: "pull/42",
      headSha: originTarget.headSha,
      attemptId,
      sourceId: "codex-pr",
      outcome: "findings",
      consumedPass: true,
      hosted: {
        target: { repository: "owner/repo", pullRequest: 42, headSha: originTarget.headSha },
        requestedCoverage: "complete",
        effectiveCoverage: "complete",
        reviewTarget: originTarget,
        requirement,
        actorIdentity: "test-user",
        findings: [finding],
        dispositionSetId: null,
        settledFindingIds: [],
      },
      now: "2026-08-19T12:00:00Z",
    });
    const source = {
      kind: "hosted" as const,
      attemptRef: bindReviewSourceReference({
        kind: "hosted",
        operationId: operation.operationId,
        durableRef: attemptId,
      }),
    };
    const dispositions = await approvedSet(root, source);
    await expect(invoke(root, ["review", "respond", "-"], { schemaVersion: 1, source, dispositions }))
      .resolves.toMatchObject({ state: "ready-to-fix", nextAction: "apply-fix" });

    await writeFile(join(root, "reviewed.txt"), "hosted finding fixed\n", "utf8");
    await git(root, ["add", "reviewed.txt"]);
    await git(root, ["commit", "-m", "apply hosted review fix"]);
    await settleHostedAttemptFinding(operationStore, {
      operationId: operation.operationId,
      attemptId,
      dispositionSetId: dispositions.dispositionSet.dispositionSetId,
      findingId: finding.findingId,
      now: "2026-08-19T12:01:00Z",
    });

    await expect(invoke(root, ["review", "respond", "-"], {
      schemaVersion: 1,
      source,
      dispositions,
      verifiedFix: {
        applicability: "focused",
        verificationEvidenceRefs: ["verification://hosted-focused-fix"],
      },
    })).resolves.toMatchObject({ state: "candidate-advanced", nextAction: "continue-review" });
    await git(root, ["commit", "-m", "record hosted verified response"]);
    expect((await runArc(["attest", "example", "--json"], root)).exitCode).toBe(0);
    await git(root, ["commit", "-m", "hosted convergence verification"]);
    const approvedHead = await git(root, ["rev-parse", "HEAD"]);

    const composed = await createLineageReviewComposer({ cwd: root, exec: gitExec })("example", approvedHead);
    expect(composed.actions).toHaveLength(1);
    expect(composed.actions[0]).toMatchObject({
      channel: "review-response",
      fixTarget: { headSha: approvedHead },
      request: { source },
    });

    const production = createIntegrationMergeDependencies({ cwd: root, exec: gitExec, workUnit: "example" });
    await expect(inRepository(root, async () => production.executeSettlement({
      settlementPlan: composeCanonicalSettlementPlan(composed.actions),
    } as IntegrationCheckpointCompositionRecord))).resolves.toEqual({
      state: "settled",
      completedActions: 1,
    });
  });

  it("refuses a Candidate-bound disposition whose local review source disappeared", async () => {
    const { root, approvedHead } = await settledReviewLineage();
    const publisher = new RepositoryGitCommonStatePublisher(gitExec, root);
    const [approved] = await new LocalApprovedDispositionRecordStore(publisher).listDispositionRecords();
    expect(approved).toBeDefined();
    const operationName = `operation-${canonicalDigest({ operationId: approved?.operationId })
      .slice("sha256:".length)}.json`;
    await publisher.update({ root: "review-gate", namespace: "operations" }, operationName, () => ({
      kind: "delete",
      result: undefined,
    }));

    await expect(createLineageReviewComposer({ cwd: root, exec: gitExec })("example", approvedHead))
      .rejects.toThrow(/review operation behind approved dispositions .* is unavailable/u);
  });

  it("refuses a Candidate-named disposition whose record is malformed", async () => {
    const { root, approvedHead } = await settledReviewLineage();
    const publisher = new RepositoryGitCommonStatePublisher(gitExec, root);
    const [approved] = await new LocalApprovedDispositionRecordStore(publisher).listDispositionRecords();
    expect(approved).toBeDefined();
    const recordName = `disposition-${canonicalDigest({ operationId: approved?.operationId })
      .slice("sha256:".length)}.json`;
    await publisher.update({ root: "review-gate", namespace: "evidence" }, recordName, (raw) => {
      if (raw === null) throw new Error("missing disposition record");
      const record = JSON.parse(raw) as {
        approvedDisposition: {
          dispositionSet: { targetId: string };
          approval: { targetId: string };
        };
      };
      const movedTargetId = `sha256:${"f".repeat(64)}`;
      record.approvedDisposition.dispositionSet.targetId = movedTargetId;
      record.approvedDisposition.approval.targetId = movedTargetId;
      return { kind: "write", content: `${JSON.stringify(record)}\n`, result: undefined };
    });

    await expect(createLineageReviewComposer({ cwd: root, exec: gitExec })("example", approvedHead))
      .rejects.toThrow(/approved disposition record .* is unavailable/u);
  });

  it("ignores unrelated disposition residue whose source is unavailable", async () => {
    const { root, approvedHead } = await settledReviewLineage();
    const publisher = new RepositoryGitCommonStatePublisher(gitExec, root);
    const index = new LocalApprovedDispositionRecordStore(publisher);
    const [approved] = await index.listDispositionRecords();
    expect(approved).toBeDefined();
    if (approved === undefined) throw new Error("missing approved dispositions");
    if (approved.candidate === null) throw new Error("missing Candidate binding");
    await index.appendDispositionRecord({
      ...approved,
      operationId: "unrelated-missing-operation",
      candidate: { workUnit: approved.candidate.workUnit, candidateId: `sha256:${"9".repeat(64)}` },
    });

    await expect(createLineageReviewComposer({ cwd: root, exec: gitExec })("example", approvedHead))
      .resolves.toMatchObject({ dispositionIds: [approved.approvedDisposition.dispositionSet.dispositionSetId] });
  });

  it("ignores malformed disposition residue outside Candidate applicability", async () => {
    const { root, approvedHead } = await settledReviewLineage();
    const publisher = new RepositoryGitCommonStatePublisher(gitExec, root);
    const index = new LocalApprovedDispositionRecordStore(publisher);
    const [approved] = await index.listDispositionRecords();
    expect(approved).toBeDefined();
    if (approved === undefined) throw new Error("missing approved dispositions");
    const residueName = `disposition-${canonicalDigest({ operationId: "unrelated-malformed-operation" })
      .slice("sha256:".length)}.json`;
    await publisher.update({ root: "review-gate", namespace: "evidence" }, residueName, () => ({
      kind: "write",
      content: "{\n",
      result: undefined,
    }));

    await expect(createLineageReviewComposer({ cwd: root, exec: gitExec })("example", approvedHead))
      .resolves.toMatchObject({ dispositionIds: [approved.approvedDisposition.dispositionSet.dispositionSetId] });
  });

  it("carries an approved no-fix set into the post-approval settlement plan", async () => {
    const { root } = await settledReviewLineage();
    const source = await reviewToFindings(root);
    const deferred = await approvedSet(root, source, "defer");
    await invoke(root, ["review", "respond", "-"], { schemaVersion: 1, source, dispositions: deferred });
    await git(root, ["commit", "--allow-empty", "-m", "submit transition"]);
    const approvedHead = await git(root, ["rev-parse", "HEAD"]);

    const composed = await createLineageReviewComposer({ cwd: root, exec: gitExec })("example", approvedHead);

    // The deferred set moves no implementation and therefore does not advance the Candidate lineage.
    // Its durable approval still authorizes one exact-target replay action at checkpoint settlement.
    const lineage = await readCandidateRecord(root, "example");
    expect(lineage === null ? [] : candidateReviewResponses(lineage).map(({ dispositionId }) => dispositionId))
      .not.toContain(deferred.dispositionSet.dispositionSetId);
    expect(composed.dispositionIds).toHaveLength(2);
    expect(composed.dispositionIds).toContain(deferred.dispositionSet.dispositionSetId);
    expect(composed.actions.map(({ dispositionId }) => dispositionId))
      .toContain(deferred.dispositionSet.dispositionSetId);

    const production = createIntegrationMergeDependencies({ cwd: root, exec: gitExec, workUnit: "example" });
    await expect(inRepository(root, async () => production.executeSettlement({
      settlementPlan: composeCanonicalSettlementPlan(composed.actions),
    } as IntegrationCheckpointCompositionRecord))).resolves.toEqual({
      state: "settled",
      completedActions: 2,
    });
  }, SUBPROCESS_HEAVY_TIMEOUT);

  it("replays a no-fix set reviewed at the approved head during checkpoint settlement", async () => {
    const { root } = await settledReviewLineage();
    const source = await reviewToFindings(root);
    const deferred = await approvedSet(root, source, "defer");
    await invoke(root, ["review", "respond", "-"], { schemaVersion: 1, source, dispositions: deferred });

    // No fix means no commit or re-attestation of its own. The approved record remains durable input
    // to the post-approval plan, whose replay settles the channel at this exact head.
    const approvedHead = await git(root, ["rev-parse", "HEAD"]);
    const composed = await createLineageReviewComposer({ cwd: root, exec: gitExec })("example", approvedHead);

    expect(composed.dispositionIds).toContain(deferred.dispositionSet.dispositionSetId);
    expect(composed.actions.map(({ dispositionId }) => dispositionId))
      .toContain(deferred.dispositionSet.dispositionSetId);

    const production = createIntegrationMergeDependencies({ cwd: root, exec: gitExec, workUnit: "example" });
    await expect(inRepository(root, async () => production.executeSettlement({
      settlementPlan: composeCanonicalSettlementPlan(composed.actions),
    } as IntegrationCheckpointCompositionRecord))).resolves.toEqual({
      state: "settled",
      completedActions: 2,
    });
  }, SUBPROCESS_HEAVY_TIMEOUT);

  it("scopes fix-bearing responses to the full Candidate span", async () => {
    const root = await fixture();
    expect((await runArc(["attest", "example", "--json"], root)).exitCode).toBe(0);
    await git(root, ["commit", "-m", "verification"]);

    // A defer-only approval first: it appends nothing to the Candidate lineage but remains checkpoint input.
    const deferSource = await reviewToFindings(root);
    const deferred = await approvedSet(root, deferSource, "defer");
    await invoke(root, ["review", "respond", "-"], {
      schemaVersion: 1,
      source: deferSource,
      dispositions: deferred,
    });
    const deferredHead = await git(root, ["rev-parse", "HEAD"]);
    // Move off the deferred review's target so the next pass reviews its own revision.
    await git(root, ["commit", "--allow-empty", "-m", "record deferred response"]);

    // Then a fix lands, moving the head the tail span would be measured from.
    const source = await reviewToFindings(root);
    const dispositions = await approvedSet(root, source);
    await invoke(root, ["review", "respond", "-"], { schemaVersion: 1, source, dispositions });
    await writeFile(join(root, "reviewed.txt"), "reviewed change, fixed\n", "utf8");
    await git(root, ["add", "reviewed.txt"]);
    await git(root, ["commit", "-m", "apply approved fix"]);
    await expect(invoke(root, ["review", "respond", "-"], {
      schemaVersion: 1,
      source,
      dispositions,
      verifiedFix: { applicability: "focused", verificationEvidenceRefs: ["verification://focused-fix"] },
    })).resolves.toMatchObject({ state: "candidate-advanced" });
    await git(root, ["commit", "-m", "record verified response"]);
    expect((await runArc(["attest", "example", "--json"], root)).exitCode).toBe(0);
    await git(root, ["commit", "-m", "convergence verification"]);
    const approvedHead = await git(root, ["rev-parse", "HEAD"]);
    expect(approvedHead).not.toBe(deferredHead);

    const composed = await createLineageReviewComposer({ cwd: root, exec: gitExec })("example", approvedHead);

    expect(composed.dispositionIds).toContain(deferred.dispositionSet.dispositionSetId);
    expect(composed.dispositionIds).toContain(dispositions.dispositionSet.dispositionSetId);
    expect(composed.dispositionIds).toEqual([
      deferred.dispositionSet.dispositionSetId,
      dispositions.dispositionSet.dispositionSetId,
    ]);
  }, SUBPROCESS_HEAVY_TIMEOUT);

  it("repeats the settlement pass without appending a second response", async () => {
    const root = await fixture();
    expect((await runArc(["attest", "example", "--json"], root)).exitCode).toBe(0);
    await git(root, ["commit", "-m", "verification"]);

    const source = await reviewToFindings(root);
    const dispositions = await approvedSet(root, source);
    await invoke(root, ["review", "respond", "-"], { schemaVersion: 1, source, dispositions });
    await writeFile(join(root, "reviewed.txt"), "reviewed change, fixed\n", "utf8");
    await git(root, ["add", "reviewed.txt"]);
    await git(root, ["commit", "-m", "apply approved fix"]);

    const request = {
      schemaVersion: 1,
      source,
      dispositions,
      verifiedFix: {
        applicability: "targeted",
        verificationEvidenceRefs: ["verification://targeted-fix"],
      },
    };
    await expect(invoke(root, ["review", "respond", "-"], request))
      .resolves.toMatchObject({ state: "candidate-advanced" });
    // The append stages the record the way `attest` stages its own; the review increment commits it
    // before the lane derives another target, since target derivation requires a clean worktree.
    await git(root, ["commit", "-m", "record verified response"]);

    await expect(invoke(root, ["review", "respond", "-"], request))
      .resolves.toMatchObject({ state: "candidate-current", nextAction: "continue-review" });
  });
});

const MERGE_METHOD: Extract<MergeMethodResolveResult, { state: "validated" }> = {
  schemaVersion: 1,
  mode: "review-merge-method-resolve",
  repository: "owner/repo",
  stackPosition: "non-delivery",
  state: "validated",
  nextAction: "use-method",
  method: "squash",
  allowedMethods: ["squash"],
  policyFingerprint: `sha256:${"7".repeat(64)}`,
};

/**
 * Drive one work unit to a settled, review-bearing Candidate lineage at a committed head.
 *
 * The convergence attestation is committed rather than left staged: composing the settlement plan
 * derives the current change set, and that derivation requires a clean worktree.
 */
async function settledReviewLineage(): Promise<{ root: string; approvedHead: string }> {
  const root = await fixture();
  expect((await runArc(["attest", "example", "--json"], root)).exitCode).toBe(0);
  await git(root, ["commit", "-m", "verification"]);

  const source = await reviewToFindings(root);
  const dispositions = await approvedSet(root, source);
  await invoke(root, ["review", "respond", "-"], { schemaVersion: 1, source, dispositions });
  await writeFile(join(root, "reviewed.txt"), "reviewed change, fixed\n", "utf8");
  await git(root, ["add", "reviewed.txt"]);
  await git(root, ["commit", "-m", "apply approved fix"]);

  await expect(invoke(root, ["review", "respond", "-"], {
    schemaVersion: 1,
    source,
    dispositions,
    verifiedFix: { applicability: "focused", verificationEvidenceRefs: ["verification://focused-fix"] },
  })).resolves.toMatchObject({ state: "candidate-advanced" });
  await git(root, ["commit", "-m", "record verified response"]);

  expect((await runArc(["attest", "example", "--json"], root)).exitCode).toBe(0);
  await git(root, ["commit", "-m", "convergence verification"]);
  return { root, approvedHead: await git(root, ["rev-parse", "HEAD"]) };
}

/**
 * Run one in-process production call from inside the fixture checkout.
 *
 * The identity the review lanes resolve is read from the process working directory rather than a
 * passed root, which the subprocess verbs satisfy by construction and an in-process call does not.
 */
async function inRepository<T>(root: string, run: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(root);
  try {
    return await run();
  } finally {
    process.chdir(previous);
  }
}

/** Persist the composition through the production checkpoint store and return its handle. */
async function persistComposition(root: string, approvedHead: string): Promise<string> {
  const composed = await createLineageReviewComposer({ cwd: root, exec: gitExec })("example", approvedHead);
  return inRepository(root, async () => createIntegrationCheckpointDependencies({
    cwd: root,
    exec: gitExec,
  }).createHandle({
    workUnit: "example",
    approvedHead,
    candidateTailDiff: {
      fromRevision: approvedHead,
      throughRevision: approvedHead,
      reference: `${approvedHead}..${approvedHead}`,
    },
    requirementSummary: {
      conclusion: "satisfied",
      requirements: [{ id: "candidate-convergence", state: "satisfied", detail: "Converged." }],
    },
    statusSummary: {
      lifecycle: {
        workUnit: "example",
        storageVersion: approvedHead,
        archiveCadence: "manual",
        state: "integrating",
        position: { phase: "Integrating", location: "active" },
        artifactFacts: [],
        complete: true,
      },
      changeRequest: {
        repository: "owner/repo",
        pullRequest: 42,
        baseRef: "main",
        headRef: "feat/example",
        headSha: approvedHead,
        state: "open",
      },
      requiredChecks: "green",
    },
    settlementPlan: composeCanonicalSettlementPlan(composed.actions),
    mergeMethod: MERGE_METHOD,
  }));
}

describe("review-bearing integration checkpoint and merge", () => {
  it("executes the persisted plan idempotently against the durable review records", async () => {
    const { root, approvedHead } = await settledReviewLineage();
    const handle = await persistComposition(root, approvedHead);
    const production = createIntegrationMergeDependencies({ cwd: root, exec: gitExec, workUnit: "example" });

    const record = await inRepository(root, async () => production.readCheckpoint("example", handle));
    if (record === null) throw new Error("expected a persisted checkpoint");
    expect(record.settlementPlan.actions).toHaveLength(1);

    await expect(inRepository(root, async () => production.executeSettlement(record)))
      .resolves.toEqual({ state: "settled", completedActions: 1 });
    await expect(inRepository(root, async () => production.executeSettlement(record)))
      .resolves.toEqual({ state: "settled", completedActions: 1 });
  });

  it("fails closed on final drift before any merge", async () => {
    const { root, approvedHead } = await settledReviewLineage();
    const handle = await persistComposition(root, approvedHead);
    const production = createIntegrationMergeDependencies({ cwd: root, exec: gitExec, workUnit: "example" });
    const target: IntegrationMergeTarget = {
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      headRef: "feat/example",
      headSha: approvedHead,
    };
    const dependencies: IntegrationMergeDependencies = {
      readCheckpoint: production.readCheckpoint.bind(production),
      executeSettlement: production.executeSettlement.bind(production),
      readStatus: async () => ({
        actualHead: approvedHead,
        lifecycleComplete: true,
        lifecycleVersion: approvedHead,
        target,
      }),
      refreshTarget: async () => target,
      readMerged: async () => false,
      readConfiguredBase: async () => "main",
      releaseLock: async () => ({ state: "released" }),
      holdLock: async () => ({ state: "held" }),
      createLockRequest: async (lockTarget) => ({
        schemaVersion: 1,
        treeRoot: root,
        target: {
          repository: (lockTarget ?? target).repository,
          pullRequest: (lockTarget ?? target).pullRequest,
          headSha: (lockTarget ?? target).headSha,
        },
        vehicle: { kind: "work-unit", slug: "example", archiveCadence: "with-integration" },
      }),
      awaitChecks: async () => ({
        schemaVersion: 1,
        mode: "review-checks-await",
        repository: target.repository,
        pullRequest: target.pullRequest,
        headSha: target.headSha,
        state: "green",
        nextAction: "complete",
        checks: [],
      }),
      resolveMergeMethod: async () => MERGE_METHOD,
      readFinalDrift: async () => ({ verdict: "reconcile" }),
      mergePinned: () => Promise.reject(new Error("unexpected merge")),
    };

    await expect(inRepository(root, async () => mergeIntegration(
      { schemaVersion: 1, workUnit: "example", checkpointHandle: handle },
      dependencies,
    ))).resolves.toMatchObject({ state: "invalidated", reason: "drift-reconcile" });
  });

  it("fails closed on a substituted checkpoint handle", async () => {
    const { root, approvedHead } = await settledReviewLineage();
    await persistComposition(root, approvedHead);
    const production = createIntegrationMergeDependencies({ cwd: root, exec: gitExec, workUnit: "example" });
    const substituted = `checkpoint-v1:${approvedHead}:sha256:${"4".repeat(64)}`;

    await expect(inRepository(root, async () => production.readCheckpoint("example", substituted)))
      .resolves.toBeNull();
    await expect(inRepository(root, async () => mergeIntegration(
      { schemaVersion: 1, workUnit: "example", checkpointHandle: substituted },
      {
        readCheckpoint: production.readCheckpoint.bind(production),
        executeSettlement: () => Promise.reject(new Error("unexpected settlement")),
        readStatus: () => Promise.reject(new Error("unexpected status read")),
        readMerged: () => Promise.reject(new Error("unexpected merged-state read")),
        readConfiguredBase: () => Promise.reject(new Error("unexpected configured-base read")),
        refreshTarget: () => Promise.reject(new Error("unexpected target refresh")),
        releaseLock: () => Promise.reject(new Error("unexpected release")),
        holdLock: async () => ({ state: "held" }),
        createLockRequest: async () => ({
          schemaVersion: 1,
          treeRoot: root,
          target: { repository: "owner/repo", pullRequest: 42, headSha: approvedHead },
          vehicle: { kind: "work-unit", slug: "example", archiveCadence: "with-integration" },
        }),
        awaitChecks: () => Promise.reject(new Error("unexpected checks await")),
        resolveMergeMethod: () => Promise.reject(new Error("unexpected method resolve")),
        readFinalDrift: () => Promise.reject(new Error("unexpected drift read")),
        mergePinned: () => Promise.reject(new Error("unexpected merge")),
      },
    ))).resolves.toMatchObject({ state: "invalidated", reason: "checkpoint-missing" });
  });
});

const OBLIGATION = {
  obligation: "required",
  reasons: ["sensitive-change-set"],
  rubricVersion: "standard-review/v1",
  rubricDigest: `sha256:${"d".repeat(64)}`,
  retrigger: "full-final",
  count: 1,
} as const;

/** Record the durable publication boundary a reserved hosted review is carried on. */
async function reserveHostedReview(root: string, approvedHead: string): Promise<void> {
  const record = await readCandidateRecord(root, "example");
  const candidateId = record?.attestation.candidateId;
  const candidateSubjectDigest = record === null
    ? undefined
    : reduceCandidateDurableBaseline(record).target.subject.subjectDigest;
  expect(candidateId).toBeDefined();
  expect(candidateSubjectDigest).toBeDefined();
  const { version } = await readSubmissionBoundaryVersioned(root, "example");
  await writeSubmissionBoundary(root, projectPublicationBoundary({
    workUnit: "example",
    branch: "feat/example",
    candidateId,
    candidateSubjectDigest,
    reservation: createStandardReviewReservation({
      candidateId: candidateId ?? "",
      sourceId: "codex-pr",
      repository: "owner/repo",
      headSha: approvedHead,
      obligation: OBLIGATION,
    }),
    changeRequest: { repository: "owner/repo", pullRequest: 42 },
  }), version);
}

describe("routed review obligation", () => {
  it("settles the reservation on the reserved source's recorded verdict", async () => {
    const { root, approvedHead } = await settledReviewLineage();
    await reserveHostedReview(root, approvedHead);
    const publisher = new RepositoryGitCommonStatePublisher(gitExec, root);
    const repositoryId = await resolveRepositoryIdentity(publisher);
    const reviewTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId,
      baseRef: "main",
      diffBaseSha: "0".repeat(40),
      diffBaseTree: "1".repeat(40),
      headSha: approvedHead,
      headTree: "2".repeat(40),
    });
    const requirement = createReviewRequirement({
      target: reviewTarget,
      projection: OBLIGATION,
      acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
      initialAdmission: "automatic",
    });
    if (requirement === null) throw new Error("missing hosted requirement fixture");
    const finding = {
      findingId: "finding-1",
      origin: "review-body" as const,
      reviewId: "review-1",
      fingerprint: "fingerprint-1",
      settlement: "not-applicable" as const,
      severity: "major" as const,
      locus: "src/example.ts:1",
      url: "https://example.test/review-1",
      body: "Review finding.",
    };
    await recordLaneAttempt(new LocalReviewOperationStateStore(publisher), {
      lane: "standard",
      repositoryId,
      changeRequestId: "pull/42",
      headSha: approvedHead,
      attemptId: "hosted-attempt-1",
      sourceId: "codex-pr",
      outcome: "settled-findings",
      consumedPass: true,
      hosted: {
        target: { repository: "owner/repo", pullRequest: 42, headSha: approvedHead },
        requestedCoverage: "complete",
        effectiveCoverage: "complete",
        reviewTarget,
        requirement,
        actorIdentity: "test-user",
        findings: [finding],
        dispositionSetId: canonicalDigest({ disposition: 1 }),
        settledFindingIds: [finding.findingId],
      },
      now: "2026-08-16T12:00:00Z",
    });

    await expect(readRoutedObligation(root, gitExec, {
      repository: "owner/repo",
      headRef: "feat/example",
      headSha: approvedHead,
    }, 42)).resolves.toMatchObject({
      state: "settled",
      detail: expect.stringContaining("codex-pr"),
    });
  });

  it("leaves review required while the reserved source has returned no verdict", async () => {
    const { root, approvedHead } = await settledReviewLineage();
    await reserveHostedReview(root, approvedHead);

    await expect(readRoutedObligation(root, gitExec, {
      repository: "owner/repo",
      headRef: "feat/example",
      headSha: approvedHead,
    }, 42)).resolves.toMatchObject({
      state: "review-required",
      detail: expect.stringContaining("not produced a settled review"),
    });
  });

  it("routes an ordinary moved-head residual to its canonical Candidate selection", async () => {
    const { root, approvedHead } = await settledReviewLineage();
    const publisher = new RepositoryGitCommonStatePublisher(gitExec, root);
    const operationStore = new LocalReviewOperationStateStore(publisher);
    const repositoryId = await resolveRepositoryIdentity(publisher);
    const reviewTarget = await deriveLocalReviewTarget({
      cwd: root,
      exec: gitExec,
      baseRef: "main",
      repositoryId,
    });
    const requirement = createReviewRequirement({
      target: reviewTarget,
      projection: OBLIGATION,
      acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }],
      initialAdmission: "automatic",
    });
    if (requirement === null) throw new Error("missing hosted requirement fixture");
    await recordLaneAttempt(operationStore, {
      lane: "standard",
      repositoryId,
      changeRequestId: "pull/42",
      headSha: approvedHead,
      attemptId: "hosted-attempt-before-base-move",
      sourceId: "codex-pr",
      outcome: "clean",
      consumedPass: true,
      hosted: {
        target: { repository: "owner/repo", pullRequest: 42, headSha: approvedHead },
        requestedCoverage: "complete",
        effectiveCoverage: "complete",
        reviewTarget,
        requirement,
        actorIdentity: "test-user",
        findings: [],
        dispositionSetId: null,
        settledFindingIds: [],
      },
      now: "2026-08-28T12:00:00Z",
    });

    await git(root, ["switch", "main"]);
    await writeFile(join(root, "base-move.txt"), "unrelated base movement\n", "utf8");
    await git(root, ["add", "base-move.txt"]);
    await git(root, ["commit", "-m", "move base"]);
    await git(root, ["switch", "feat/example"]);
    await git(root, ["merge", "--no-ff", "main", "-m", "merge base"]);
    await writeFile(join(root, "reviewed.txt"), "reviewed change, fixed, then changed again\n", "utf8");
    await git(root, ["add", "reviewed.txt"]);
    await git(root, ["commit", "-m", "add residual"]);
    const rerooted = await runArc(["attest", "example", "--new-root", "--json"], root);
    expect(rerooted.exitCode, rerooted.stderr || rerooted.stdout).toBe(0);
    await git(root, ["commit", "-m", "record moved candidate"]);
    const currentHead = await git(root, ["rev-parse", "HEAD"]);
    await reserveHostedReview(root, currentHead);
    const versionedCandidate = await readCandidateRecordVersioned(root, "example");
    if (versionedCandidate.record === null || versionedCandidate.version === null) {
      throw new Error("missing current Candidate fixture");
    }

    await expect(readRoutedObligation(root, gitExec, {
      repository: "owner/repo",
      headRef: "feat/example",
      headSha: currentHead,
    }, 42)).resolves.toMatchObject({
      state: "review-required",
      scope: "singleton",
      selectionAction: {
        kind: "review-applicability-selection",
        workUnitId: "example",
        expectedRecordVersion: versionedCandidate.version,
        candidateId: versionedCandidate.record.attestation.candidateId,
        choices: ["covered", "review-required"],
        projection: {
          state: "decision-required",
          paths: expect.arrayContaining([expect.any(String)]),
        },
      },
    });
  }, SUBPROCESS_HEAVY_TIMEOUT);

  it("reports a work unit with no recorded publication boundary as blocked", async () => {
    const { root, approvedHead } = await settledReviewLineage();
    await rm(join(root, resolveSubmissionBoundaryPath("example")));

    await expect(readRoutedObligation(root, gitExec, {
      repository: "owner/repo",
      headRef: "feat/example",
      headSha: approvedHead,
    }, 42)).resolves.toMatchObject({ state: "blocked" });
  });
});
