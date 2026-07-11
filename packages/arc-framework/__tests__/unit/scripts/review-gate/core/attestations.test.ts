import { describe, expect, it } from "vitest";

import type { ReviewRequirement } from "../../../../../src/scripts/review-gate/core/contracts.js";
import {
  ingestAttestation,
  validateAttestation,
} from "../../../../../src/scripts/review-gate/core/attestations.js";
import { computeChangeSetId } from "../../../../../src/scripts/review-gate/core/identity.js";

const DIFF_BASE = "d".repeat(40);
const HEAD = "c".repeat(40);
const CHANGE_SET = computeChangeSetId({ baseRef: "main", diffBaseSha: DIFF_BASE, headSha: HEAD });

const requirement: ReviewRequirement = {
  schemaVersion: 1,
  id: "analysis",
  kind: "independent-analysis",
  obligation: "required",
  acceptableSources: [
    { sourceKind: "agent", qualifier: "independent-analysis/v1" },
    { sourceKind: "human", qualifier: "independent-analysis/v1" },
  ],
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
    requirementId: "analysis",
    result: "clean",
    baseRef: "main",
    diffBaseSha: DIFF_BASE,
    headSha: requirement.headSha,
    changeSetId: requirement.changeSetId,
    policyVersion: requirement.policyVersion,
    rubricVersion: requirement.rubricVersion,
    coverage: "full",
    coverageFromSha: DIFF_BASE,
    coverageThroughSha: requirement.headSha,
    evidenceUrlOrId: "https://example.test/evidence/run-1",
    startedAt: "2026-07-10T20:00:00.000Z",
    completedAt: "2026-07-10T20:10:00.000Z",
    findings: [],
    closures: [],
    ...overrides,
  });
}

const context = {
  requirement,
  authenticatedActor: { schemaVersion: 1 as const, actorIdentity: "maintainer-1", permissions: ["maintain" as const] },
  acceptedReviewerClaims: ["codex-cli", "claude-code", "coderabbit-cli"],
  acceptedRuntimeKinds: {
    "codex-cli": "codex",
    "claude-code": "claude-code",
    "coderabbit-cli": "coderabbit",
  },
  usedRunIds: [] as string[],
  authorIdentity: "author-1",
  now: new Date("2026-07-10T20:15:00.000Z"),
  maxRunAgeMinutes: 60,
};

describe("neutral attestations", () => {
  it.each([
    ["codex-cli", "codex"],
    ["claude-code", "claude-code"],
    ["coderabbit-cli", "coderabbit"],
  ])("accepts maintainer-attested fresh %s evidence", (claim, runtime) => {
    expect(validateAttestation(manifest({
      reviewerClaim: claim,
      sourceIdentity: claim,
      reviewerRuntime: { kind: runtime, version: "1.0.0" },
    }), context)).toMatchObject({
      ok: true,
      evidence: { submitterIdentity: "maintainer-1", reviewerClaim: claim },
    });
  });

  it.each([
    ["reused run", manifest(), { ...context, usedRunIds: ["run-1"] }],
    ["local transcript", manifest({ evidenceUrlOrId: "file:///tmp/review.txt" }), context],
    ["expiring evidence", manifest({ evidenceUrlOrId: "https://example.test/run?X-Amz-Signature=abc" }), context],
    ["unauthenticated token", manifest({ prToken: "approved" }), context],
    ["stale head", manifest({ headSha: "e".repeat(40) }), context],
    ["stale run", manifest({ startedAt: "2026-07-10T18:00:00.000Z", completedAt: "2026-07-10T18:10:00.000Z" }), context],
    ["missing manifest", "", context],
    ["disallowed claim", manifest({ reviewerClaim: "unknown-agent" }), context],
    ["runtime mismatch", manifest({ sourceIdentity: "claude-code", reviewerClaim: "claude-code" }), context],
    ["native reactive artifact", manifest({ sourceIdentity: "codex-github", reviewerClaim: "codex-github" }), context],
  ])("rejects %s", (_name, input, validationContext) => {
    expect(validateAttestation(input, validationContext).ok).toBe(false);
  });

  it("retains findings as blocking evidence", () => {
    const findings = [{ findingId: "f-1", severity: "high", locus: "src/a.ts:1", evidenceUrlOrId: "https://example.test/f-1" }];
    const result = validateAttestation(manifest({ result: "findings", findings }), context);
    expect(result).toMatchObject({ ok: true, evidence: { result: "findings", findings } });
  });

  it("accepts a qualified non-author human and rejects authors or delegated identities", () => {
    const human = manifest({
      sourceKind: "human",
      sourceIdentity: "human-1",
      reviewerClaim: "independent-analysis/v1",
      reviewerRuntime: { kind: "human", version: "1" },
    });
    const humanContext = {
      ...context,
      authenticatedActor: { schemaVersion: 1 as const, actorIdentity: "human-1", permissions: ["write" as const] },
      acceptedReviewerClaims: ["independent-analysis/v1"],
    };
    expect(validateAttestation(human, humanContext).ok).toBe(true);
    expect(validateAttestation(human, { ...humanContext, authorIdentity: "human-1" }).ok).toBe(false);
    expect(validateAttestation(human, {
      ...humanContext,
      authenticatedActor: { ...humanContext.authenticatedActor, actorIdentity: "delegate-1" },
    }).ok).toBe(false);
  });

  it("enforces manifest and array bounds", () => {
    expect(validateAttestation(`{"padding":"${"x".repeat(33 * 1024)}"}`, context).ok).toBe(false);
    expect(validateAttestation(manifest({ findings: Array.from({ length: 257 }, (_, index) => ({
      findingId: `f-${index}`, severity: "low", locus: "x", evidenceUrlOrId: `https://example.test/${index}`,
    })) }), context).ok).toBe(false);
  });

  it("emits a stable unadmitted receipt and suppresses a duplicate provider request", () => {
    const input = {
      content: manifest(),
      context,
      repositoryId: "100",
      changeRequestId: "PR_node",
      expectedLedgerVersion: 4,
      priorReceipts: [],
    };
    const first = ingestAttestation(input);
    expect(first).toMatchObject({
      ok: true,
      replay: false,
      requestSuppressed: true,
      receipt: { action: "unadmitted", previousLedgerVersion: 4, result: "clean" },
    });
    if (!first.ok) throw new Error(first.error);
    expect(ingestAttestation({ ...input, priorReceipts: [first.receipt] })).toMatchObject({
      ok: true,
      replay: true,
      receipt: { receiptHash: first.receipt.receiptHash },
    });
  });

  it("fails closed when a reused run id carries conflicting evidence", () => {
    const baseline = ingestAttestation({
      content: manifest(), context, repositoryId: "100", changeRequestId: "PR_node",
      expectedLedgerVersion: 0, priorReceipts: [],
    });
    if (!baseline.ok) throw new Error(baseline.error);
    expect(ingestAttestation({
      content: manifest({ completedAt: "2026-07-10T20:11:00.000Z" }),
      context,
      repositoryId: "100",
      changeRequestId: "PR_node",
      expectedLedgerVersion: 0,
      priorReceipts: [baseline.receipt],
    })).toMatchObject({ ok: false, error: "conflicting attestation replay" });
  });

  it("enforces the manifest size bound before ingestion parses the payload", () => {
    expect(ingestAttestation({
      content: `{"reviewRunId":"run-1","padding":"${"x".repeat(33 * 1024)}"}`,
      context,
      repositoryId: "100",
      changeRequestId: "PR_node",
      expectedLedgerVersion: 0,
      priorReceipts: [],
    })).toEqual({ ok: false, error: "manifest exceeds 32 KiB" });
  });
});
