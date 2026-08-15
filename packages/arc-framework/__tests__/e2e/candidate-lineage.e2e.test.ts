/**
 * Real-CLI coverage for the Candidate lineage a review fix advances.
 *
 * `propose → local review → respond → propose` is driven through the public verbs, so the response
 * evidence under test is the one the commands actually wrote. The checkpoint's convergence guard then
 * runs over the production Candidate reader rather than a hand-built record: the host-dependent reads
 * ahead of it are stubbed, the Candidate reduction it branches on is not.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { gitExec } from "../../src/lib/io-context.js";
import {
  checkpointIntegration,
  type IntegrationCheckpointDependencies,
} from "../../src/scripts/integration/checkpoint.js";
import {
  createIntegrationCheckpointDependencies,
} from "../../src/scripts/integration/checkpoint-composition.js";
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

/** Propose and approve one `fix` disposition over the reduced findings. */
async function approvedFix(root: string, source: { kind: "attested-local"; receiptRef: string }) {
  const prepared = await invoke(root, ["review", "respond", "-"], {
    schemaVersion: 1,
    source,
    proposal: {
      findings: [{
        findingId: "finding-1",
        sourceVerification: "verified",
        verificationRefs: ["source:reviewed.txt:1"],
        disposition: "fix",
        rationale: "The reviewed source supports applying this fix.",
        recommendation: "Apply the fix.",
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
async function checkpointOver(root: string) {
  const production = createIntegrationCheckpointDependencies({ cwd: root, exec: gitExec });
  const dependencies: IntegrationCheckpointDependencies = {
    ...production,
    readDrift: async (workUnit) => ({ ...await production.readDrift(workUnit), verdict: "clean" }),
    readLifecycle: async (workUnit) => ({
      workUnit,
      archiveCadence: "manual",
      state: "integrating",
      position: { phase: "Integrating", location: "active" },
      complete: true,
    }),
  };
  return checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, dependencies);
}

describe("review-fix Candidate lineage", () => {
  it("advances the lineage, blocks the checkpoint, and clears through propose", async () => {
    const root = await fixture();

    const proposed = await runArc(["propose", "example", "--json"], root);
    expect(proposed.exitCode, proposed.stderr || proposed.stdout).toBe(0);
    expect(JSON.parse(proposed.stdout)).toMatchObject({ status: "attested", operation: "root" });
    await git(root, ["commit", "-m", "verification"]);

    const source = await reviewToFindings(root);
    const dispositions = await approvedFix(root, source);
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

    // The lineage now explains the fixed subject, so the Candidate is current — and unverified at its
    // converged head, which is the exact state the checkpoint refuses to approve.
    await expect(checkpointOver(root)).resolves.toMatchObject({
      state: "blocked",
      reason: "candidate-convergence-pending",
      payload: { candidate: { status: "current", implementationChanged: true } },
    });

    const converged = await runArc(["propose", "example", "--json"], root);
    expect(converged.exitCode, converged.stderr || converged.stdout).toBe(0);
    expect(JSON.parse(converged.stdout)).toMatchObject({
      status: "attested",
      operation: "convergence",
      locus: { kind: "candidate-submit-ready" },
    });

    const cleared = await checkpointOver(root);
    expect(cleared).not.toMatchObject({ reason: "candidate-convergence-pending" });
  });

  it("composes the review record and settlement plan its approved responses back", async () => {
    const { root, approvedHead } = await settledReviewLineage();
    const composed = await createLineageReviewComposer({ cwd: root, exec: gitExec })("example", approvedHead);

    expect(composed.dispositionIds).toHaveLength(1);
    expect(composed.markdown).toContain("## Review");
    expect(composed.markdown).toContain("- **Local:** reviewer-1 — 1 pass");
    expect(composed.markdown).toContain("- **Hosted PR:** None");
    expect(composed.markdown).toContain("- **Triage:** @test-user — 1 addressed, 0 unresolved");
    expect(composed.actions).toHaveLength(1);
    expect(composed.actions[0]).toMatchObject({
      channel: "review-response",
      dispositionId: composed.dispositionIds[0],
      fixTarget: { headSha: approvedHead },
    });
  });

  it("repeats the settlement pass without appending a second response", async () => {
    const root = await fixture();
    expect((await runArc(["propose", "example", "--json"], root)).exitCode).toBe(0);
    await git(root, ["commit", "-m", "verification"]);

    const source = await reviewToFindings(root);
    const dispositions = await approvedFix(root, source);
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
    // The append stages the record the way `propose` stages its own; the review increment commits it
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
  expect((await runArc(["propose", "example", "--json"], root)).exitCode).toBe(0);
  await git(root, ["commit", "-m", "verification"]);

  const source = await reviewToFindings(root);
  const dispositions = await approvedFix(root, source);
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

  expect((await runArc(["propose", "example", "--json"], root)).exitCode).toBe(0);
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
        archiveCadence: "manual",
        state: "integrating",
        position: { phase: "Integrating", location: "active" },
        complete: true,
      },
      changeRequest: {
        repository: "owner/repo",
        pullRequest: 42,
        headRef: "feat/example",
        headSha: approvedHead,
        state: "open",
      },
      requiredChecks: "green",
    },
    reviewRecord: { markdown: composed.markdown, dispositionIds: composed.dispositionIds },
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
    expect(record?.reviewRecord.markdown).toContain("## Review");
    if (record === null) throw new Error("expected a persisted checkpoint");

    await expect(inRepository(root, async () => production.executeSettlement(record)))
      .resolves.toEqual({ state: "settled", completedActions: 1 });
    await expect(inRepository(root, async () => production.executeSettlement(record)))
      .resolves.toEqual({ state: "settled", completedActions: 1 });
  });

  it("posts the composed record and fails closed on final drift", async () => {
    const { root, approvedHead } = await settledReviewLineage();
    const handle = await persistComposition(root, approvedHead);
    const production = createIntegrationMergeDependencies({ cwd: root, exec: gitExec, workUnit: "example" });
    const target: IntegrationMergeTarget = {
      repository: "owner/repo",
      pullRequest: 42,
      headSha: approvedHead,
    };
    const posted: (string | null)[] = [];
    const dependencies: IntegrationMergeDependencies = {
      readCheckpoint: production.readCheckpoint.bind(production),
      executeSettlement: production.executeSettlement.bind(production),
      readStatus: async () => ({ actualHead: approvedHead, lifecycleComplete: true, target }),
      releaseLock: async () => ({ state: "released" }),
      holdLock: async () => ({ state: "held" }),
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
      postReviewRecord: async (_target, markdown) => {
        posted.push(markdown);
      },
      readFinalDrift: async () => ({ verdict: "reconcile" }),
      mergePinned: () => Promise.reject(new Error("unexpected merge")),
    };

    await expect(inRepository(root, async () => mergeIntegration(
      { schemaVersion: 1, workUnit: "example", checkpointHandle: handle },
      dependencies,
    ))).resolves.toMatchObject({ state: "invalidated", reason: "drift-reconcile" });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toContain("- **Triage:** @test-user — 1 addressed, 0 unresolved");
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
        releaseLock: () => Promise.reject(new Error("unexpected release")),
        holdLock: () => Promise.reject(new Error("unexpected hold")),
        awaitChecks: () => Promise.reject(new Error("unexpected checks await")),
        resolveMergeMethod: () => Promise.reject(new Error("unexpected method resolve")),
        postReviewRecord: () => Promise.reject(new Error("unexpected record post")),
        readFinalDrift: () => Promise.reject(new Error("unexpected drift read")),
        mergePinned: () => Promise.reject(new Error("unexpected merge")),
      },
    ))).resolves.toMatchObject({ state: "invalidated", reason: "checkpoint-missing" });
  });
});
