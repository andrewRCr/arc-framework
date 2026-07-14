import { describe, expect, it, vi } from "vitest";

import type { CapabilitySet, ReviewRequirement } from "../../../../../src/scripts/review-gate/core/contracts.js";
import type { ReceiptEnvelope, ReviewReceipt } from "../../../../../src/scripts/review-gate/core/execution.js";
import { computeChangeSetId } from "../../../../../src/scripts/review-gate/core/identity.js";
import type { ReviewReceiptStore } from "../../../../../src/scripts/review-gate/core/ports.js";
import type { AttestComposition } from "../../../../../src/scripts/review-gate/runtime/composition.js";
import { runAttestMain } from "../../../../../src/scripts/review-gate/runtime/attest-main.js";
import { SELF_HOSTING_POLICY } from "../../../../../src/scripts/review-gate/policy/self-hosting/schema.js";

const DIFF_BASE = "d".repeat(40);
const HEAD = "c".repeat(40);
const CHANGE_SET = computeChangeSetId({ baseRef: "main", diffBaseSha: DIFF_BASE, headSha: HEAD });
const NOW = new Date("2026-07-10T20:15:00.000Z");

const requirement: ReviewRequirement = {
  schemaVersion: 1,
  id: "independent-analysis",
  kind: "independent-analysis",
  obligation: "required",
  acceptableSources: [{ sourceKind: "agent", qualifier: "independent-analysis/v1" }],
  count: 1,
  initialAdmission: "automatic",
  policyVersion: "a".repeat(64),
  rubricVersion: "independent-analysis/v1",
  reasons: ["code-surface"],
  changeSetId: CHANGE_SET,
  headSha: HEAD,
};

function manifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    sourceKind: "agent",
    sourceIdentity: "codex-cli",
    reviewerClaim: "codex-cli",
    reviewRunId: "run-1",
    reviewerRuntime: { kind: "codex", version: "1.0.0" },
    requirementId: requirement.id,
    result: "clean",
    baseRef: "main",
    diffBaseSha: DIFF_BASE,
    headSha: HEAD,
    changeSetId: CHANGE_SET,
    policyVersion: requirement.policyVersion,
    rubricVersion: requirement.rubricVersion,
    coverage: "full",
    coverageFromSha: DIFF_BASE,
    coverageThroughSha: HEAD,
    evidenceUrlOrId: "https://example.test/evidence/run-1",
    startedAt: "2026-07-10T20:00:00.000Z",
    completedAt: "2026-07-10T20:10:00.000Z",
    findings: [],
    closures: [],
    ...overrides,
  });
}

class MemoryStore implements ReviewReceiptStore {
  envelopes: ReceiptEnvelope[] = [];

  readLedger() {
    return Promise.resolve({ kind: "valid" as const, ledgerVersion: this.envelopes.length, receipts: this.envelopes });
  }

  appendReceipt(receipt: ReviewReceipt, expectedLedgerVersion: number) {
    if (expectedLedgerVersion !== this.envelopes.length) throw new Error("version-conflict");
    const envelope: ReceiptEnvelope = {
      schemaVersion: 1,
      durableRecordId: `IC_${this.envelopes.length + 1}`,
      recordedAt: NOW.toISOString(),
      lastModifiedAt: NOW.toISOString(),
      ledgerVersion: this.envelopes.length + 1,
      receipt,
    };
    this.envelopes.push(envelope);
    return Promise.resolve({ ledgerVersion: envelope.ledgerVersion, durableEvidenceRef: envelope.durableRecordId });
  }
}

function capabilities(permissions: CapabilitySet["permissions"] = ["maintain"]): CapabilitySet {
  return { schemaVersion: 1, actorIdentity: "maintainer-1", permissions };
}

function composition(store = new MemoryStore(), actor = capabilities()): AttestComposition {
  return {
    store,
    resolveValidationContext: async () => ({
      repositoryId: "100",
      changeRequestId: "PR_node",
      requirement,
      authenticatedActor: actor,
      acceptedReviewerClaims: ["codex-cli", "claude-code", "coderabbit-cli"],
      acceptedRuntimeKinds: SELF_HOSTING_POLICY.attestationEnforcement.acceptedRuntimeKinds,
      authorIdentity: "author-1",
      maxRunAgeMinutes: SELF_HOSTING_POLICY.attestationEnforcement.maxRunAgeMinutes,
    }),
  };
}

const env = {
  ARC_REVIEW_GATE_APP_ID: "4268856",
  ARC_APP_TOKEN: "ghs_token",
  ARC_APP_SLUG: "arc-review-gate",
  ARC_DISPATCH_ACTOR_ID: "maintainer-1",
  GITHUB_TOKEN: "gh_token",
  GITHUB_REPOSITORY: "o/r",
};

function event(payload = manifest()) {
  return {
    repository: { id: 100 },
    sender: { login: "maintainer" },
    inputs: { pull_request: 7, payload },
  };
}

function dependencies(runtime: AttestComposition) {
  return {
    createRuntime: vi.fn(async () => runtime),
    fetch: vi.fn(),
    createGitExec: vi.fn(() => vi.fn()),
    policy: SELF_HOSTING_POLICY,
    now: NOW,
  };
}

describe("attest main", () => {
  it("appends validated evidence exactly once and reports an exact replay", async () => {
    const store = new MemoryStore();
    const deps = dependencies(composition(store));

    await expect(runAttestMain(env, event(), deps)).resolves.toEqual({
      status: "appended",
      ledgerVersion: 1,
      durableEvidenceRef: "IC_1",
    });
    await expect(runAttestMain(env, event(), deps)).resolves.toEqual({
      status: "replay",
      ledgerVersion: 1,
      durableEvidenceRef: "IC_1",
    });
    expect(store.envelopes).toHaveLength(1);
    expect(store.envelopes[0]?.receipt.evidence).toMatchObject({ reviewRunId: "run-1", result: "clean" });
  });

  it.each([
    ["stale scope", manifest({ headSha: "e".repeat(40) })],
    ["unaccepted claim", manifest({ reviewerClaim: "other-agent" })],
    ["over-age", manifest({ completedAt: "2026-07-10T18:00:00.000Z" })],
  ])("fails closed on %s", async (_name, payload) => {
    await expect(runAttestMain(env, event(payload), dependencies(composition()))).rejects.toThrow(/attestation-rejected/u);
  });

  it("fails closed when the submitter lacks permission", async () => {
    await expect(runAttestMain(env, event(), dependencies(composition(new MemoryStore(), capabilities(["write"])))))
      .rejects.toThrow(/requires maintain/u);
  });

  it("fails closed when actor login resolution does not match the dispatched immutable id", async () => {
    const runtime = composition();
    runtime.resolveValidationContext = async () => { throw new Error("actor-identity-mismatch"); };
    await expect(runAttestMain(env, event(), dependencies(runtime))).rejects.toThrow(/actor-identity-mismatch/u);
  });
});
