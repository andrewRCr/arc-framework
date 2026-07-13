import { describe, expect, it } from "vitest";

import type { CapabilitySet } from "../../../../../src/scripts/review-gate/core/contracts.js";
import type { Evidence } from "../../../../../src/scripts/review-gate/core/evidence.js";
import type { ReviewReceipt, ReviewRequest } from "../../../../../src/scripts/review-gate/core/execution.js";
import { createReceipt } from "../../../../../src/scripts/review-gate/core/request-key.js";
import { reduceFindingSettlements, resolveSettlementActor } from "../../../../../src/scripts/review-gate/core/settlement.js";

const OLD = "a".repeat(40);
const FIX = "b".repeat(40);
const CHANGE = "c".repeat(64);
const request: ReviewRequest = {
  schemaVersion: 1, repositoryId: "1", changeRequestId: "7", changeSetId: CHANGE,
  policyVersion: "d".repeat(64), semanticsVersion: "review-gate/v1", rubricVersion: "independent-analysis/v1",
  requirementId: "analysis", sourceIdentity: "coderabbit-pr", coverage: "full", coverageFromSha: "0".repeat(40),
  coverageThroughSha: OLD, generation: 0, actorIdentity: "302312524", requestMechanism: "automatic",
  requiredActorIdentity: "302312524", requestCommand: null,
};

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    schemaVersion: 1, requirementId: "analysis", sourceKind: "agent", sourceIdentity: "coderabbit-pr",
    result: "findings", evidenceUrlOrId: "review:old", policyVersion: request.policyVersion,
    rubricVersion: request.rubricVersion, coverage: "full", coverageFromSha: request.coverageFromSha,
    coverageThroughSha: OLD, baseRef: "main", diffBaseSha: request.coverageFromSha, changeSetId: CHANGE,
    headSha: OLD, findings: [{ findingId: "f-1", severity: "high", locus: "src/a.ts:1", evidenceUrlOrId: "finding:1" }],
    closures: [], observedAt: "2026-07-12T20:00:00.000Z", ...overrides,
  };
}

function disposition(kind: "fixed" | "deferred" | "rejected" | "provider-closed", overrides: Record<string, unknown> = {}): ReviewReceipt {
  const fixed = kind === "fixed";
  const nonFix = kind === "deferred" || kind === "rejected";
  const payload = {
    kind: "finding-disposition" as const, disposition: kind, findingId: "f-1", sourceIdentity: "coderabbit-pr",
    oldHeadSha: OLD, fixHeadSha: fixed ? FIX : null, actorIdentity: kind === "provider-closed" ? "coderabbit-pr" : "44",
    rationale: nonFix ? "Not applicable because the guarded path is unreachable." : null,
    directReplyRef: kind === "provider-closed" ? null : "reply:1",
    followUpEvidenceRef: fixed ? "review:fix" : kind === "provider-closed" ? "closure:1" : null,
    verificationRefs: fixed ? ["ci:fix"] : [], settledAt: "2026-07-12T21:00:00.000Z", ...overrides,
  };
  return createReceipt({
    eventId: `${kind}:f-1`, previousLedgerVersion: 4, action: kind, request, result: null,
    reason: payload.rationale as string | null, evidenceUrlOrId: (payload.directReplyRef ?? payload.followUpEvidenceRef) as string,
    findingIds: ["f-1"], payload,
  });
}

function resolved(dispositionReceipt: ReviewReceipt, overrides: Record<string, unknown> = {}): ReviewReceipt {
  const payload = {
    kind: "conversation-resolved" as const, findingId: "f-1", sourceIdentity: "coderabbit-pr", headSha: FIX,
    threadId: "thread:1", resolvedByActorIdentity: "44", dispositionReceiptHash: dispositionReceipt.receiptHash,
    hostEvidenceRef: "thread:resolved", resolvedAt: "2026-07-12T21:01:00.000Z", ...overrides,
  };
  return createReceipt({
    eventId: "resolved:f-1", previousLedgerVersion: 5, action: "conversation-resolved", request,
    result: null, evidenceUrlOrId: "thread:resolved", findingIds: ["f-1"], payload,
  });
}

describe("settlement actor selection", () => {
  it("uses a maintain-capable PR author, otherwise the pinned fallback, revalidated live", async () => {
    const calls: string[] = [];
    const resolve = async (actor: { login: string; expectedActorId: string }): Promise<CapabilitySet> => {
      calls.push(actor.login);
      return { schemaVersion: 1, actorIdentity: actor.expectedActorId, permissions: actor.login === "author" ? ["write"] : ["maintain"] };
    };
    await expect(resolveSettlementActor({
      prAuthor: { login: "author", expectedActorId: "7" }, fallbackMaintainer: { login: "maintainer", expectedActorId: "44" },
      resolveCapabilities: resolve,
    })).resolves.toEqual({ login: "maintainer", expectedActorId: "44" });
    expect(calls).toEqual(["author", "maintainer"]);
  });
});

describe("finding settlement reduction", () => {
  it("closes FIX only after exact CI, follow-up evidence, direct reply, disposition, and resolution", () => {
    const fixed = disposition("fixed");
    const followUp = evidence({
      result: "clean", findings: [], evidenceUrlOrId: "review:fix", coverageThroughSha: FIX, headSha: FIX,
      changeSetId: "e".repeat(64),
    });
    expect(reduceFindingSettlements({
      evidence: [evidence(), followUp], receipts: [fixed, resolved(fixed)], currentHeadSha: FIX, ciState: "success",
      authorizedActorIdentity: "44", qualifiedClosureSources: ["coderabbit-pr"],
    })).toMatchObject({ openFindings: [], errors: [] });
  });

  it("rejects recurrence, bare/reordered resolution, wrong actor, and missing evidence", () => {
    const fixed = disposition("fixed");
    const recurring = evidence({
      result: "findings", evidenceUrlOrId: "review:fix", coverageThroughSha: FIX, headSha: FIX,
      changeSetId: "e".repeat(64), findings: [{
        findingId: "f-2", severity: "high", locus: "src/a.ts:2", evidenceUrlOrId: "finding:2", recursFindingId: "f-1",
      }],
    });
    const result = reduceFindingSettlements({
      evidence: [evidence(), recurring], receipts: [resolved(fixed), fixed], currentHeadSha: FIX, ciState: "success",
      authorizedActorIdentity: "99", qualifiedClosureSources: ["coderabbit-pr"],
    });
    expect(result.openFindings).toHaveLength(2);
    expect(result.errors).toEqual(expect.arrayContaining(["resolution-before-disposition:f-1", "invalid-settlement-actor:f-1", "finding-recurred:f-1"]));
  });

  it.each(["deferred", "rejected"] as const)("closes an authorized %s disposition on the unchanged head", (kind) => {
    const receipt = disposition(kind);
    expect(reduceFindingSettlements({
      evidence: [evidence()], receipts: [receipt, resolved(receipt, { headSha: OLD })], currentHeadSha: OLD,
      ciState: "failure", authorizedActorIdentity: "44", qualifiedClosureSources: [],
    }).openFindings).toEqual([]);
  });

  it("accepts provider closure only from the qualified finding source", () => {
    const provider = disposition("provider-closed");
    const closureEvidence = evidence({ result: "clean", findings: [], evidenceUrlOrId: "review:2", closures: [{
      findingId: "f-1", authorityKind: "source-confirmed", authorityIdentity: "coderabbit-pr", evidenceUrlOrId: "closure:1",
    }] });
    expect(reduceFindingSettlements({
      evidence: [evidence(), closureEvidence], receipts: [provider], currentHeadSha: OLD, ciState: "success",
      authorizedActorIdentity: "44", qualifiedClosureSources: ["coderabbit-pr"],
    }).openFindings).toEqual([]);
    expect(reduceFindingSettlements({
      evidence: [evidence(), closureEvidence],
      receipts: [disposition("provider-closed", { actorIdentity: "44" })],
      currentHeadSha: OLD,
      ciState: "success",
      authorizedActorIdentity: "44",
      qualifiedClosureSources: ["coderabbit-pr"],
    })).toMatchObject({ openFindings: [expect.objectContaining({ findingId: "f-1" })], errors: ["invalid-provider-closure:f-1"] });
  });
});
