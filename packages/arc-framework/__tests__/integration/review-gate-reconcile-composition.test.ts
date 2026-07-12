import { describe, expect, it } from "vitest";

import { computeChangeSetId, computePolicyVersion } from "../../src/scripts/review-gate/core/identity.js";
import { runAttestMain, type AttestMainDependencies } from "../../src/scripts/review-gate/runtime/attest-main.js";
import { createAttestRuntime, createReconcileRuntime } from "../../src/scripts/review-gate/runtime/composition.js";
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
  commandComment,
  corruptReceiptComment,
  createWorld,
  routingExec,
  routingFetch,
  receiptComments,
  shadowChecks,
  type E2EWorld,
} from "./review-gate-reconcile-composition.fakes.js";

/** Policy variant that enables and qualifies the `coderabbit-pr` provider source. */
function coderabbitPolicy(): SelfHostingPolicy {
  const [coderabbit, ...rest] = SELF_HOSTING_POLICY.qualifications;
  if (coderabbit === undefined) throw new Error("missing CodeRabbit policy fixture");
  return {
    ...SELF_HOSTING_POLICY,
    qualifications: [
      { ...coderabbit, enabled: true, exactCoverage: true, durableResults: true, distinctOutcomes: true, closureCapability: true },
      ...rest,
    ],
  };
}

function env(world: E2EWorld, overrides: Partial<ReconcileMainEnv> = {}): ReconcileMainEnv {
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

function deps(world: E2EWorld, policy: SelfHostingPolicy = SELF_HOSTING_POLICY): ReconcileMainDependencies {
  return {
    createRuntime: createReconcileRuntime,
    fetch: routingFetch(world),
    createGitExec: () => routingExec(world),
    policy,
    now: NOW,
  };
}

function attestDeps(world: E2EWorld): AttestMainDependencies {
  return {
    createRuntime: createAttestRuntime,
    fetch: routingFetch(world),
    createGitExec: () => routingExec(world),
    policy: SELF_HOSTING_POLICY,
    now: NOW,
  };
}

function attestationManifest(world: E2EWorld): string {
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

async function dispatchAttestation(world: E2EWorld): Promise<void> {
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

describe("review-gate reconcile composition (e2e)", () => {
  it("persists an attestation that a separate reconcile reduces to a satisfied shadow verdict", async () => {
    const world = createWorld();

    await dispatchAttestation(world);
    expect(receiptComments(world)).toHaveLength(1);
    expect(receiptComments(world)[0]?.body).toContain('"reviewRunId":"run-e2e-1"');

    const result = await runReconcileMain(env(world), deps(world));

    expect(result).toEqual({ status: "published", effectInvoked: false });
    expect(shadowChecks(world)[0]).toMatchObject({ status: "completed", conclusion: "success" });
    expect(world.counters.commentCreate).toBe(2);
  });

  it("carries attested evidence over bookkeeping only and rejects a substantive tail without provider effects", async () => {
    const bookkeeping = createWorld();
    await dispatchAttestation(bookkeeping);
    advanceLifecycleTail(bookkeeping);
    await runReconcileMain(env(bookkeeping), deps(bookkeeping));
    expect(shadowChecks(bookkeeping)[0]).toMatchObject({ status: "completed", conclusion: "success" });
    expect(bookkeeping.counters.commentCreate).toBe(2);

    const substantive = createWorld();
    await dispatchAttestation(substantive);
    advanceLifecycleTail(substantive, true);
    await runReconcileMain(env(substantive), deps(substantive));
    expect(shadowChecks(substantive)[0]).toMatchObject({ status: "in_progress", conclusion: null });
    expect(substantive.counters.commentCreate).toBe(2);
  });

  it("emits a pending shadow check under an attestation-only requirement with no provider effect", async () => {
    const world = createWorld();

    const result = await runReconcileMain(env(world), deps(world));

    expect(result).toEqual({ status: "published", effectInvoked: false });
    const checks = shadowChecks(world);
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ name: "review-gate-shadow", status: "in_progress", conclusion: null });
    // Shadow projects one context only — no `merge-ok` (wrong-named context) is ever written.
    expect(world.checks.every((check) => check.name === "review-gate-shadow")).toBe(true);
    // Attestation-only topology: the ledger anchor is the sole comment write; no reserve/acknowledge receipts.
    expect(world.counters.commentCreate).toBe(1);
    expect(world.counters.checkCreate).toBe(1);
  });

  it("converges on the existing shadow check across re-runs instead of creating a duplicate", async () => {
    const world = createWorld();

    await runReconcileMain(env(world), deps(world));
    await runReconcileMain(env(world), deps(world));

    expect(shadowChecks(world)).toHaveLength(1);
    expect(world.counters.checkCreate).toBe(1);
    expect(world.counters.checkPatch).toBeGreaterThanOrEqual(1);
  });

  it("projects success when a current-head CodeRabbit approval satisfies the enabled provider requirement", async () => {
    const world = createWorld();
    world.reviews.push(coderabbitReview(world, "APPROVED"));

    const result = await runReconcileMain(env(world), deps(world, coderabbitPolicy()));

    expect(result).toEqual({ status: "published", effectInvoked: false });
    expect(shadowChecks(world)[0]).toMatchObject({ name: "review-gate-shadow", status: "completed", conclusion: "success" });
    // Satisfied by decisive-review evidence — no provider request is reserved (anchor is the only comment write).
    expect(world.counters.commentCreate).toBe(1);
  });

  it("reserves a generation-zero request through the receipt protocol; the dormant trigger fails closed", async () => {
    const world = createWorld();

    const result = await runReconcileMain(env(world), deps(world, coderabbitPolicy()));

    // The request is admitted and invoked, but the shadow-capability trigger is not yet qualified (burn-in),
    // so invocation fails closed with a terminal-failure receipt and the gate projects failure rather than a
    // false green — exactly the dormant-provider boundary the enabled policy exercises.
    expect(result).toEqual({ status: "published", effectInvoked: true });
    expect(shadowChecks(world)[0]).toMatchObject({ name: "review-gate-shadow", status: "completed", conclusion: "failure" });
    // Anchor plus reserved and terminal-failure receipts landed durably — the reserve path is wired end-to-end.
    expect(world.counters.commentCreate).toBeGreaterThanOrEqual(3);
  });

  it("applies an authorized require command composed from a PR comment, flipping a routine success to pending", async () => {
    const world = createWorld({ changedPaths: [{ status: "modified", path: "README.md" }] });
    world.collaborators.set("reviewer", { id: 55, role: "write" });
    commandComment(world, "reviewer", "/review-gate require independent-analysis needs a second look");

    const result = await runReconcileMain(env(world), deps(world));

    expect(result.status).toBe("published");
    expect(shadowChecks(world)[0]).toMatchObject({ name: "review-gate-shadow", status: "in_progress", conclusion: null });
  });

  it("ignores a require command from an under-permissioned author, leaving the routine success intact", async () => {
    const world = createWorld({ changedPaths: [{ status: "modified", path: "README.md" }] });
    world.collaborators.set("reader", { id: 56, role: "read" });
    commandComment(world, "reader", "/review-gate require independent-analysis needs a second look");

    const result = await runReconcileMain(env(world), deps(world));

    expect(result.status).toBe("published");
    expect(shadowChecks(world)[0]).toMatchObject({ name: "review-gate-shadow", status: "completed", conclusion: "success" });
  });

  it("replaces an earlier green shadow check with failure when the receipt ledger degrades", async () => {
    const world = createWorld();
    world.reviews.push(coderabbitReview(world, "APPROVED"));
    await runReconcileMain(env(world), deps(world, coderabbitPolicy()));
    expect(shadowChecks(world)[0]).toMatchObject({ conclusion: "success" });

    corruptReceiptComment(world);
    await runReconcileMain(env(world), deps(world, coderabbitPolicy()));

    expect(shadowChecks(world)).toHaveLength(1);
    expect(shadowChecks(world)[0]).toMatchObject({ status: "completed", conclusion: "failure" });
    expect(world.counters.checkCreate).toBe(1);
    expect(world.counters.checkPatch).toBeGreaterThanOrEqual(1);
  });
});
