import { describe, expect, it } from "vitest";

import { computeChangeSetId, computePolicyVersion } from "../../src/scripts/review-gate/core/identity.js";
import { hashContent } from "../../src/lib/manifest/hash.js";
import { buildCodexReviewCommand } from "../../src/scripts/review-gate/providers/codex/adapter.js";
import { runAttestMain, type AttestMainDependencies } from "../../src/scripts/review-gate/runtime/attest-main.js";
import { createReadOnlyNextActionReader } from "../../src/scripts/review-gate/runtime/action-composition.js";
import { createAttestRuntime, createReconcileRuntime } from "../../src/scripts/review-gate/runtime/composition.js";
import { createReadOnlyHeadMutabilityReader } from "../../src/scripts/review-gate/runtime/head-mutability-composition.js";
import {
  runReconcileMain,
  type ReconcileMainDependencies,
  type ReconcileMainEnv,
} from "../../src/scripts/review-gate/runtime/reconcile-main.js";
import { SELF_HOSTING_POLICY, type SelfHostingPolicy } from "../../src/scripts/review-gate/policy/self-hosting/schema.js";
import {
  NOW,
  advanceLifecycleTail,
  coderabbitReview,
  codexComment,
  commandComment,
  corruptReceiptComment,
  createReviewGateWorld,
  routingExec,
  routingFetch,
  receiptComments,
  shadowChecks,
  type ReviewGateWorld,
} from "./review-gate-github-world.js";

/** Policy variant that enables and qualifies the `coderabbit-pr` provider source. */
function coderabbitPolicy(): SelfHostingPolicy {
  const [coderabbit, ...rest] = SELF_HOSTING_POLICY.qualifications;
  if (coderabbit === undefined) throw new Error("missing CodeRabbit policy fixture");
  return {
    ...SELF_HOSTING_POLICY,
    qualifications: [
      { ...coderabbit, mode: "enabled", exactCoverage: true, durableResults: true, distinctOutcomes: true, closureCapability: true },
      ...rest,
    ],
  };
}

function codexPolicy(world: ReviewGateWorld): SelfHostingPolicy {
  const qualifications = SELF_HOSTING_POLICY.qualifications.map((declaration) => declaration.sourceIdentity === "codex-pr"
    ? {
        ...declaration,
        mode: "enabled" as const,
        exactCoverage: true,
        durableResults: true,
        distinctOutcomes: true,
        durableFindings: true,
        closureCapability: true,
        guidanceDigest: hashContent(JSON.stringify([{ path: "AGENTS.md", content: world.guidanceContent }])),
      }
    : declaration);
  return { ...SELF_HOSTING_POLICY, qualifications };
}

function env(world: ReviewGateWorld, overrides: Partial<ReconcileMainEnv> = {}): ReconcileMainEnv {
  return {
    GITHUB_REPOSITORY: `${world.owner}/${world.repo}`,
    ARC_REPOSITORY_ID: String(world.repositoryId),
    ARC_PULL_REQUEST_NUMBER: String(world.pull),
    ARC_REVIEW_GATE_APP_ID: "4268856",
    ARC_APP_TOKEN: "ghs_apptoken",
    ARC_APP_SLUG: world.appSlug,
    GITHUB_TOKEN: "ghs_readtoken",
    REVIEW_GATE_CONTEXT_MODE: "shadow",
    ...overrides,
  };
}

function deps(world: ReviewGateWorld, policy: SelfHostingPolicy = SELF_HOSTING_POLICY): ReconcileMainDependencies {
  return {
    createRuntime: createReconcileRuntime,
    fetch: routingFetch(world),
    createGitExec: () => routingExec(world),
    policy,
    now: NOW,
  };
}

function attestDeps(world: ReviewGateWorld): AttestMainDependencies {
  return {
    createRuntime: createAttestRuntime,
    fetch: routingFetch(world),
    createGitExec: () => routingExec(world),
    policy: SELF_HOSTING_POLICY,
    now: NOW,
  };
}

function attestationManifest(world: ReviewGateWorld): string {
  const policyVersion = computePolicyVersion({ policy: SELF_HOSTING_POLICY });
  return JSON.stringify({
    schemaVersion: 1,
    sourceKind: "agent",
    sourceIdentity: "codex-cli",
    reviewerClaim: "codex-cli",
    reviewRunId: "run-e2e-1",
    reviewerRuntime: { kind: "codex", version: "1.0.0" },
    requirementId: "independent-analysis",
    result: "clean",
    baseRef: world.baseRef,
    diffBaseSha: world.diffBaseSha,
    headSha: world.headSha,
    changeSetId: computeChangeSetId({
      baseRef: world.baseRef,
      diffBaseSha: world.diffBaseSha,
      headSha: world.headSha,
    }),
    policyVersion,
    rubricVersion: "independent-analysis/v1",
    coverage: "full",
    coverageFromSha: world.diffBaseSha,
    coverageThroughSha: world.headSha,
    evidenceUrlOrId: "https://example.test/evidence/run-e2e-1",
    startedAt: "2026-07-11T19:50:00.000Z",
    completedAt: "2026-07-11T19:55:00.000Z",
    findings: [],
    closures: [],
  });
}

async function dispatchAttestation(world: ReviewGateWorld): Promise<void> {
  world.collaborators.set("reviewer", { id: 55, role: "maintain" });
  const result = await runAttestMain({
    GITHUB_REPOSITORY: `${world.owner}/${world.repo}`,
    ARC_REVIEW_GATE_APP_ID: "4268856",
    ARC_APP_TOKEN: "ghs_apptoken",
    ARC_APP_SLUG: world.appSlug,
    ARC_DISPATCH_ACTOR_ID: "55",
    GITHUB_TOKEN: "ghs_readtoken",
  }, {
    repository: { id: world.repositoryId },
    sender: { login: "reviewer" },
    inputs: { pull_request: world.pull, payload: attestationManifest(world) },
  }, attestDeps(world));
  expect(result.status).toBe("appended");
}

describe("review-gate runtime composition", () => {
  it("keeps repeated next-action reads free of ledger writes", async () => {
    const world = createReviewGateWorld();
    const reader = await createReadOnlyNextActionReader({
      owner: world.owner,
      repo: world.repo,
      repositoryId: world.repositoryId,
      pullRequestNumber: world.pull,
      token: "ghp_developer",
      appSlug: world.appSlug,
      expectedAppId: "4268856",
      policy: SELF_HOSTING_POLICY,
      mode: "shadow",
      fetch: routingFetch(world),
      exec: routingExec(world),
      now: () => NOW,
    });
    const scope = {
      repositoryId: String(world.repositoryId),
      changeRequestId: "PR_node",
      headSha: world.headSha,
    };

    await expect(reader.read(scope)).resolves.toMatchObject({ headSha: world.headSha });
    await expect(reader.read(scope)).resolves.toMatchObject({ headSha: world.headSha });
    expect(world.comments).toEqual([]);
  });

  it("keeps repeated head-mutability reads free of ledger writes", async () => {
    const world = createReviewGateWorld();
    const reader = await createReadOnlyHeadMutabilityReader({
      owner: world.owner,
      repo: world.repo,
      repositoryId: world.repositoryId,
      pullRequestNumber: world.pull,
      token: "ghp_developer",
      appSlug: world.appSlug,
      expectedAppId: "4268856",
      policy: SELF_HOSTING_POLICY,
      mode: "shadow",
      fetch: routingFetch(world),
      exec: routingExec(world),
    });
    const scope = {
      repositoryId: String(world.repositoryId),
      changeRequestId: "PR_node",
      currentHeadSha: world.headSha,
      proposedHeadSha: "f".repeat(40),
      authorizationReceiptHash: null,
    };

    await expect(reader.read(scope)).resolves.toMatchObject({ receipts: [] });
    await expect(reader.read(scope)).resolves.toMatchObject({ receipts: [] });
    expect(world.comments).toEqual([]);
  });

  it("persists an attestation that a separate reconcile reduces to a satisfied shadow verdict", async () => {
    const world = createReviewGateWorld();

    await dispatchAttestation(world);
    expect(receiptComments(world)).toHaveLength(1);
    expect(receiptComments(world)[0]?.body).toContain('"reviewRunId":"run-e2e-1"');

    const result = await runReconcileMain(env(world), deps(world));

    expect(result).toEqual({ status: "published", effectInvoked: false });
    expect(shadowChecks(world)[0]).toMatchObject({ status: "completed", conclusion: "success" });
    expect(world.comments).toHaveLength(2);
  });

  it("carries attested evidence over bookkeeping only and rejects a substantive tail without provider effects", async () => {
    const bookkeeping = createReviewGateWorld();
    await dispatchAttestation(bookkeeping);
    advanceLifecycleTail(bookkeeping);
    await runReconcileMain(env(bookkeeping), deps(bookkeeping));
    expect(shadowChecks(bookkeeping)[0]).toMatchObject({ status: "completed", conclusion: "success" });
    expect(bookkeeping.comments).toHaveLength(2);

    const substantive = createReviewGateWorld();
    await dispatchAttestation(substantive);
    advanceLifecycleTail(substantive, true);
    await runReconcileMain(env(substantive), deps(substantive));
    expect(shadowChecks(substantive)[0]).toMatchObject({ status: "in_progress", conclusion: null });
    expect(substantive.comments).toHaveLength(2);
  });

  it("does not carry an empty CodeRabbit approval over a bookkeeping tail", async () => {
    const world = createReviewGateWorld();
    const reviewedHead = world.headSha;
    advanceLifecycleTail(world);
    world.reviews.push(coderabbitReview(world, "APPROVED", reviewedHead));

    const result = await runReconcileMain(env(world), deps(world, coderabbitPolicy()));

    expect(result).toEqual({ status: "published", effectInvoked: true });
    expect(shadowChecks(world)[0]).toMatchObject({ status: "in_progress", conclusion: null });
  });

  it("keeps a stale CodeRabbit changes-requested review pending", async () => {
    const world = createReviewGateWorld();
    world.reviews.push(coderabbitReview(world, "CHANGES_REQUESTED", "d".repeat(40)));

    const result = await runReconcileMain(env(world), deps(world, coderabbitPolicy()));

    expect(result).toEqual({ status: "published", effectInvoked: true });
    expect(shadowChecks(world)[0]).toMatchObject({ status: "in_progress", conclusion: null });
  });

  it("emits a pending shadow check under an attestation-only requirement with no provider effect", async () => {
    const world = createReviewGateWorld();

    const result = await runReconcileMain(env(world), deps(world));

    expect(result).toEqual({ status: "published", effectInvoked: false });
    const checks = shadowChecks(world);
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ name: "review-gate-shadow", status: "in_progress", conclusion: null });
    // Shadow projects one context only — no `merge-ok` (wrong-named context) is ever written.
    expect(world.checks.every((check) => check.name === "review-gate-shadow")).toBe(true);
    // Attestation-only topology: the ledger anchor is the sole comment write; no reserve/acknowledge receipts.
    expect(world.comments).toHaveLength(1);
  });

  it("converges on the existing shadow check across re-runs instead of creating a duplicate", async () => {
    const world = createReviewGateWorld();

    await runReconcileMain(env(world), deps(world));
    await runReconcileMain(env(world), deps(world));

    expect(shadowChecks(world)).toHaveLength(1);
  });

  it("requires substantive adapter-observed clean evidence beyond a current-head CodeRabbit approval", async () => {
    const world = createReviewGateWorld();
    world.reviews.push(coderabbitReview(world, "APPROVED"));

    const emptyApproval = await runReconcileMain(env(world), deps(world, coderabbitPolicy()));

    expect(emptyApproval).toEqual({ status: "published", effectInvoked: true });
    expect(shadowChecks(world)[0]).toMatchObject({ name: "review-gate-shadow", status: "in_progress", conclusion: null });
    const review = world.reviews[0];
    if (review === undefined) throw new Error("missing review fixture");
    review.body = "Review complete\n\n**Actionable comments posted: 0**";

    const substantive = await runReconcileMain(env(world), deps(world, coderabbitPolicy()));

    expect(substantive).toEqual({ status: "published", effectInvoked: false });
    expect(shadowChecks(world)[0]).toMatchObject({ name: "review-gate-shadow", status: "completed", conclusion: "success" });
    expect(receiptComments(world).map((comment) => comment.body)).toEqual([
      expect.stringContaining('"action":"reserved"'),
      expect.stringContaining('"action":"acknowledged"'),
    ]);
  });

  it("executes a qualified generation-zero request through the receipt protocol", async () => {
    const world = createReviewGateWorld();

    const result = await runReconcileMain(env(world), deps(world, coderabbitPolicy()));

    expect(result).toEqual({ status: "published", effectInvoked: true });
    expect(shadowChecks(world)[0]).toMatchObject({ name: "review-gate-shadow", status: "in_progress", conclusion: null });
    expect(world.labels).toEqual([]);
    // Anchor plus reserved and acknowledged receipts landed durably.
    expect(receiptComments(world).map((comment) => comment.body)).toEqual([
      expect.stringContaining('"action":"reserved"'),
      expect.stringContaining('"action":"acknowledged"'),
    ]);
  });

  it("adopts the PR author's Codex trigger and reduces the pinned clean artifact", async () => {
    const world = createReviewGateWorld();
    const policy = codexPolicy(world);
    const declaration = policy.qualifications.find((item) => item.sourceIdentity === "codex-pr");
    if (declaration?.guidanceDigest === null || declaration === undefined) throw new Error("missing Codex guidance");

    const reserved = await runReconcileMain(env(world), deps(world, policy));
    expect(reserved).toEqual({ status: "action-ready", effectInvoked: false });
    commandComment(world, world.author.login, buildCodexReviewCommand(declaration.guidanceDigest));

    const adopted = await runReconcileMain(env(world), deps(world, policy));
    expect(adopted).toEqual({ status: "published", effectInvoked: true });
    codexComment(world, `Codex Review:\n\nDidn't find any major issues.\n\nReviewed commit: \`${world.headSha}\``);

    const clean = await runReconcileMain(env(world), deps(world, policy));
    expect(clean).toEqual({ status: "published", effectInvoked: false });
    expect(shadowChecks(world)[0]).toMatchObject({ status: "completed", conclusion: "success" });
  });

  it("applies an authorized require command composed from a PR comment, flipping a routine success to pending", async () => {
    const world = createReviewGateWorld({ changedPaths: [{ status: "modified", path: "README.md" }] });
    world.collaborators.set("reviewer", { id: 55, role: "write" });
    commandComment(world, "reviewer", "/review-gate require independent-analysis needs a second look");

    const result = await runReconcileMain(env(world), deps(world));

    expect(result.status).toBe("published");
    expect(shadowChecks(world)[0]).toMatchObject({ name: "review-gate-shadow", status: "in_progress", conclusion: null });
    expect(receiptComments(world)).toHaveLength(1);

    world.comments = world.comments.filter((comment) => comment.performed_via_github_app !== null);
    await runReconcileMain(env(world), deps(world));

    expect(shadowChecks(world)[0]).toMatchObject({ name: "review-gate-shadow", status: "in_progress", conclusion: null });
    expect(receiptComments(world)).toHaveLength(1);
  });

  it("persists a human refresh reservation and invokes the qualified provider", async () => {
    const world = createReviewGateWorld({ changedPaths: [{ status: "modified", path: "README.md" }] });
    world.collaborators.set("reviewer", { id: 55, role: "write" });
    commandComment(
      world,
      "reviewer",
      "/review-gate refresh independent-analysis coderabbit-pr full request another review",
    );

    const result = await runReconcileMain(env(world), deps(world, coderabbitPolicy()));

    expect(result).toEqual({ status: "published", effectInvoked: true });
    expect(world.labels).toEqual([]);
    expect(receiptComments(world).map((comment) => comment.body)).toEqual([
      expect.stringContaining('"action":"reserved"'),
      expect.stringContaining('"action":"acknowledged"'),
    ]);
  });

  it("ignores a require command from an under-permissioned author, leaving the routine success intact", async () => {
    const world = createReviewGateWorld({ changedPaths: [{ status: "modified", path: "README.md" }] });
    world.collaborators.set("reader", { id: 56, role: "read" });
    commandComment(world, "reader", "/review-gate require independent-analysis needs a second look");

    const result = await runReconcileMain(env(world), deps(world));

    expect(result.status).toBe("published");
    expect(shadowChecks(world)[0]).toMatchObject({ name: "review-gate-shadow", status: "completed", conclusion: "success" });
  });

  it("replaces an earlier green shadow check with failure when the receipt ledger degrades", async () => {
    const world = createReviewGateWorld();
    await dispatchAttestation(world);
    await runReconcileMain(env(world), deps(world));
    expect(shadowChecks(world)[0]).toMatchObject({ conclusion: "success" });

    corruptReceiptComment(world);
    await runReconcileMain(env(world), deps(world));

    expect(shadowChecks(world)).toHaveLength(1);
    expect(shadowChecks(world)[0]).toMatchObject({ status: "completed", conclusion: "failure" });
  });

  it("fails closed when all receipt state disappears after a controller check exists", async () => {
    const world = createReviewGateWorld({ changedPaths: [{ status: "modified", path: "README.md" }] });

    await runReconcileMain(env(world), deps(world));
    expect(shadowChecks(world)[0]).toMatchObject({ conclusion: "success" });

    world.comments = [];
    await runReconcileMain(env(world), deps(world));

    expect(shadowChecks(world)[0]).toMatchObject({ status: "completed", conclusion: "failure" });
    expect(world.comments).toEqual([]);
  });
});
