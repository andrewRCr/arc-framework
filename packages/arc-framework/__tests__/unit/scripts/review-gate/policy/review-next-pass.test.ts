/** Shared next-look facts from immutable producers and approved responses. */
import { describe, expect, it } from "vitest";
import { findingsHostedResult, cleanHostedResult, approvedRecord, performedFix } from "../../../../fixtures/review-response-proof.js";
import { createReviewTarget, createReviewRequirement, createReviewRequest } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { confirmReviewCorrectionLeg, deriveReviewNextPassContext, type ReviewNextPassInput } from "../../../../../src/scripts/review-gate/policy/review-next-pass.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import type { IncrementalReviewScope } from "../../../../../src/scripts/review-gate/core/incremental-review-scope.js";
import type { ReviewResult } from "../../../../../src/scripts/review-gate/core/review-result.js";
import { resolveReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";

function input(predecessor: ReviewResult | null, severity: "major" | "minor" = "major", performed = true,
  retrigger: "full-final" | "incremental" = "full-final"): ReviewNextPassInput & { currentTarget: ReviewResult["target"] } {
  let result = predecessor ?? cleanHostedResult();
  if (result.kind === "frontline") throw new Error("expected standard producer");
  if (result.requirement.retrigger !== retrigger) {
    const { obligation, reasons, rubricVersion, rubricDigest, count } = result.requirement;
    const requirement = createReviewRequirement({ target: result.target,
      projection: { obligation, reasons, rubricVersion, rubricDigest, retrigger, count },
      acceptableSources: result.requirement.acceptableSources, initialAdmission: result.requirement.initialAdmission });
    if (requirement === null) throw new Error("expected requirement");
    result = { ...result, requirement, admission: { ...result.admission, policyVersion: requirement.policyVersion } };
    predecessor = result;
  }
  const { targetId: ignored, ...target } = result.target;
  void ignored;
  const currentTarget = createReviewTarget({ ...target, headSha: "e".repeat(40) });
  const record = predecessor?.originalOutcome === "findings" ? approvedRecord(predecessor, [{
    sourceVerification: "verified", verifiedSeverity: severity, disposition: "fix",
  }]) : null;
  const { obligation, reasons, rubricVersion, rubricDigest, count } = result.requirement;
  return {
    completePasses: predecessor === null ? 0 : 1,
    completedPasses: predecessor?.admission.logicalPass ?? 0,
    deltaAdmission: { sources: ["delegated-agent"], surface: "ordinary" },
    predecessor, currentTarget, currentLineage: result.admission.lineage,
    standardReview: { obligation, reasons, rubricVersion, rubricDigest, retrigger, count },
    resultReader: { readResult: async () => { throw new Error("no earlier producer"); } },
    dispositionStore: { readDispositionRecord: async () => record,
      appendDispositionRecord: async () => { throw new Error("read-only derivation"); } },
    readResponsePerformance: async () => record === null || !performed ? null
      : { ...performedFix(result, record), producedHeadSha: currentTarget.headSha },
  };
}

function localCorrectionResult(predecessor: ReviewResult, scope: IncrementalReviewScope): ReviewResult {
  if (predecessor.kind === "frontline") throw new Error("expected standard producer");
  const logicalPass = predecessor.admission.logicalPass + 1;
  const { targetId: ignored, ...coordinates } = predecessor.target;
  void ignored;
  const target = createReviewTarget({ ...coordinates, headSha: scope.headSha, headTree: "1".repeat(40) });
  const { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } = predecessor.requirement;
  const requirement = createReviewRequirement({ target,
    projection: { obligation, reasons, rubricVersion, rubricDigest, retrigger, count },
    acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }], initialAdmission: "automatic" });
  if (requirement === null) throw new Error("expected requirement");
  const request = createReviewRequest(target, { schemaVersion: 2, semanticsVersion: "review-gate/v2",
    repositoryId: target.repositoryId, targetId: target.targetId, requirementId: requirement.requirementId,
    carrier: { kind: "local-change-set", adapterId: "delegated-agent", changeRequestId: null },
    authorIdentity: "author", evaluatorIdentity: "delegated-agent", lineageId: canonicalDigest(predecessor.admission.lineage),
    logicalPass, generation: 0, requestMechanism: "subagent" });
  return { kind: "attested-local", producerId: `local/delta-${logicalPass}`, repositoryId: target.repositoryId, target,
    sourceIdentity: "delegated-agent", originalOutcome: "findings",
    findings: [{ findingId: "finding-1", severity: "major", locus: "src/delta.ts:1",
      evidenceUrlOrId: "local:finding-1", sourceOrdinal: 1 }], resultDigest: canonicalDigest({ request, scope }),
    admission: { lineage: predecessor.admission.lineage, logicalPass, retryGeneration: 0,
      requestedCoverage: "incremental", effectiveCoverage: "incremental", scopeMode: "whole-target",
      policyVersion: requirement.policyVersion, correctionScope: scope },
    vehicle: { kind: "work-unit", identity: "example" }, requirement, request,
    receiptRef: `receipts/local-delta-${logicalPass}`, localSourceRef: `sources/local-delta-${logicalPass}` };
}

function rangeProof(request: ReviewNextPassInput & { currentTarget: ReviewResult["target"] }) {
  const predecessor = request.predecessor;
  if (predecessor === null) throw new Error("expected a predecessor");
  const current = request.currentTarget;
  return { cwd: "/checkout", exec: scriptGitExec([
    { match: ["rev-parse", "--verify", `${predecessor.target.headSha}^{commit}`],
      responses: [{ stdout: predecessor.target.headSha }] },
    { match: ["rev-parse", "--verify", `${current.headSha}^{commit}`], responses: [{ stdout: current.headSha }] },
    { match: ["merge-base", "--is-ancestor", predecessor.target.headSha, current.headSha], responses: [{ stdout: "" }] },
    { match: ["rev-list", "--first-parent", "--merges", "--parents", `${predecessor.target.headSha}..${current.headSha}`],
      responses: [{ stdout: "" }] },
  ]).exec };
}

it("reports a converged linear leg as range-proven when ordinary grounds require review", async () => {
  const request = input(cleanHostedResult(), "minor", true, "incremental");
  if (request.predecessor === null) throw new Error("expected predecessor");
  await expect(confirmReviewCorrectionLeg({ ...request, predecessor: request.predecessor,
    rangeProof: rangeProof(request), confirmGrounds: async () => "review-required",
  })).resolves.toBe("range-proven");
});

it.each(["site grounds", "performed response"] as const)("keeps %s ahead of a valid range proof", async kind => {
  const request = input(kind === "site grounds" ? cleanHostedResult() : findingsHostedResult(["minor"]),
    "minor", true, "incremental");
  if (request.predecessor === null) throw new Error("expected predecessor");
  await expect(confirmReviewCorrectionLeg({ ...request, predecessor: request.predecessor,
    rangeProof: rangeProof(request),
    confirmGrounds: async () => kind === "site grounds" ? "applicable" : "review-required",
  })).resolves.toBe("applicable");
});

it("resolves a range-proven correction scope with a delta basis", async () => {
  const request = input(findingsHostedResult(["minor"]), "minor", true, "incremental");
  const context = await deriveReviewNextPassContext({ ...request, rangeProof: rangeProof(request),
    readResponsePerformance: async result => {
      const performance = await request.readResponsePerformance(result);
      return performance === null ? null : { ...performance, producedHeadSha: "f".repeat(40) };
    },
    confirmCurrentApplicability: async () => "review-required",
  });
  expect(context).toMatchObject({ completePasses: 1, convergence: "converged", responseDue: false, incremental: {
    basis: "delta-check", scope: { predecessorProducerId: request.predecessor!.producerId,
      predecessorHeadSha: request.predecessor!.target.headSha, basisHeadSha: request.predecessor!.target.headSha,
      headSha: request.currentTarget.headSha },
  } });
});

it("resolves a clean predecessor's range without inventing a fix", async () => {
  const request = input(cleanHostedResult(), "minor", true, "incremental");
  expect((await deriveReviewNextPassContext({ ...request, rangeProof: rangeProof(request),
    confirmCurrentApplicability: async () => "review-required",
  })).incremental).toEqual({ basis: "delta-check", scope: {
    schemaVersion: 1, predecessorProducerId: request.predecessor!.producerId,
    predecessorHeadSha: request.predecessor!.target.headSha, basisHeadSha: request.predecessor!.target.headSha,
    headSha: request.currentTarget.headSha, requiredFindings: [],
  } });
});

it.each([
  ["incremental", "ordinary", ["codex-pr", "delegated-agent"], true],
  ["incremental", "ordinary", ["codex-pr"], false],
  ["incremental", "ordinary", [], false],
  ["full-final", "ordinary", ["delegated-agent"], false],
  ["full-final", "pre-publication", ["delegated-agent"], true],
  ["full-final", "open-pr-errand", ["delegated-agent"], true],
  ["full-final", "pre-publication", ["codex-pr"], false],
] as const)("bounds delta admission under %s at %s with %j", async (retrigger, surface, sources, admitted) => {
  const request = input(cleanHostedResult(), "minor", true, retrigger);
  const context = await deriveReviewNextPassContext({ ...request,
    deltaAdmission: { sources, surface }, rangeProof: rangeProof(request),
    confirmCurrentApplicability: async () => "review-required",
  });
  expect(context.incremental?.basis ?? null).toBe(admitted ? "delta-check" : null);
});

it("re-proves a delta leg when a later material fix extends the local coverage chain", async () => {
  const raw = cleanHostedResult();
  const first = input({ ...raw, admission: { ...raw.admission,
    lineage: { kind: "candidate", candidateId: canonicalDigest({ candidate: "example" }) } } },
    "minor", true, "incremental");
  const root = first.predecessor!;
  const range = rangeProof(first);
  const delta = await deriveReviewNextPassContext({ ...first, rangeProof: range,
    confirmCurrentApplicability: async () => "review-required" });
  if (delta.incremental === null) throw new Error("expected delta scope");
  const middle = localCorrectionResult(root, delta.incremental.scope);
  const second = input(middle, "major", true, "incremental");
  const { targetId: ignored, ...coordinates } = second.currentTarget;
  void ignored;
  const currentTarget = createReviewTarget({ ...coordinates, headSha: "f".repeat(40) });
  const record = approvedRecord(middle, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const contextInput = { ...second, currentTarget, rangeProof: range,
    resultReader: { readResult: async () => root },
    dispositionStore: { ...second.dispositionStore,
      readDispositionRecord: async (producer: string) => producer === middle.producerId ? record : null },
    readResponsePerformance: async () => ({ ...performedFix(middle, record), producedHeadSha: currentTarget.headSha }),
    confirmApplicability: async () => "review-required" as const,
  };
  expect((await deriveReviewNextPassContext(contextInput)).incremental).toMatchObject({
    basis: "fix-check", scope: { basisHeadSha: root.target.headSha, predecessorProducerId: middle.producerId,
      predecessorHeadSha: middle.target.headSha, headSha: currentTarget.headSha,
      requiredFindings: [{ producerId: middle.producerId, findingId: "finding-1", locus: "src/delta.ts:1" }] },
  });
  expect((await deriveReviewNextPassContext({ ...contextInput,
    rangeProof: { cwd: "/checkout", exec: scriptGitExec([]).exec },
  })).incremental).toBeNull();
});

it("carries deferred material findings into a converged no-fix delta scope", async () => {
  const request = input(findingsHostedResult(["major"]), "major", true, "incremental");
  const record = approvedRecord(request.predecessor!, [{
    sourceVerification: "verified", verifiedSeverity: "major", disposition: "defer",
  }]);
  const context = await deriveReviewNextPassContext({ ...request, rangeProof: rangeProof(request),
    dispositionStore: { ...request.dispositionStore, readDispositionRecord: async () => record },
    readResponsePerformance: async () => null, confirmCurrentApplicability: async () => "review-required",
  });
  expect(context).toMatchObject({ convergence: "converged", incremental: { basis: "delta-check", scope: {
    requiredFindings: [{ producerId: request.predecessor!.producerId, findingId: "finding-1", locus: "src/example.ts:1" }],
  } } });
});

describe("next-pass context", () => {
  it.each([
    ["first look", null, "major", true, "none", false],
    ["clean look", cleanHostedResult(), "major", true, "converged", false],
    ["minor response", findingsHostedResult(["minor"]), "minor", true, "converged", false],
    ["material response", findingsHostedResult(["major"]), "major", true, "unconverged", false],
    ["unperformed material response", findingsHostedResult(["major"]), "major", false, "unconverged", true],
    ["unperformed minor response", findingsHostedResult(["minor"]), "minor", false, "pending", true],
  ] as const)("derives %s", async (_label, result, severity, performed, convergence, responseDue) => {
    expect(await deriveReviewNextPassContext(input(result, severity, performed))).toMatchObject({ convergence, responseDue });
  });

  it("keeps an unapproved findings response pending and due", async () => {
    const request = input(findingsHostedResult(["major"]));
    expect(await deriveReviewNextPassContext({ ...request,
      dispositionStore: { ...request.dispositionStore, readDispositionRecord: async () => null },
    })).toMatchObject({ completePasses: 1, convergence: "pending", responseDue: true, incremental: null });
  });

  it.each(["clean", "no-fix"] as const)("offers no fix check after a %s predecessor under incremental policy", async kind => {
    const predecessor = kind === "clean" ? cleanHostedResult() : findingsHostedResult(["minor"]);
    const request = input(predecessor, "minor", true, "incremental");
    const record = kind === "clean" ? null : approvedRecord(request.predecessor!, [{
      sourceVerification: "verified", verifiedSeverity: "minor", disposition: "defer",
    }]);
    expect((await deriveReviewNextPassContext({ ...request,
      dispositionStore: { ...request.dispositionStore, readDispositionRecord: async () => record },
      confirmCurrentApplicability: async () => "applicable",
    })).incremental).toBeNull();
  });

  it("offers a proven material-fix scope when the site's grounds refuse the changed code", async () => {
    const request = input(findingsHostedResult(["major"]));
    const context = await deriveReviewNextPassContext({ ...request,
      confirmCurrentApplicability: async () => "review-required",
    });
    expect(context.incremental).toEqual({ basis: "fix-check", scope: {
      schemaVersion: 1, predecessorProducerId: request.predecessor!.producerId,
      predecessorHeadSha: request.predecessor!.target.headSha, basisHeadSha: request.predecessor!.target.headSha,
      headSha: request.currentTarget.headSha,
      requiredFindings: [{ producerId: request.predecessor!.producerId, findingId: "finding-1", locus: "src/example.ts:1" }],
    } });
  });
  it("withholds a fix check when neither grounds nor response prove the leg", async () => {
    const request = input(findingsHostedResult(["major"]));
    expect((await deriveReviewNextPassContext({ ...request,
      readResponsePerformance: async result => {
        const performance = await request.readResponsePerformance(result);
        return performance === null ? null : { ...performance, producedHeadSha: "f".repeat(40) };
      },
      confirmCurrentApplicability: async () => "review-required",
    })).incremental).toBeNull();
  });

  it("withholds a fix check after convergence under full-final, and keeps one under incremental", async () => {
    const request = input(findingsHostedResult(["minor"]), "minor");
    expect((await deriveReviewNextPassContext(request)).incremental).toBeNull();
    const incremental = input(findingsHostedResult(["minor"]), "minor", true, "incremental");
    expect((await deriveReviewNextPassContext(incremental)).incremental?.basis).toBe("fix-check");
  });

  it("keeps a no-fix hosted response pending until host settlement", async () => {
    const initial = findingsHostedResult(["minor"]);
    if (initial.kind !== "hosted") throw new Error("expected hosted producer");
    const predecessor = { ...initial, hostSettlementFindingIds: ["finding-1"], settled: false };
    const request = input(predecessor, "minor");
    const record = approvedRecord(predecessor, [{ sourceVerification: "verified", verifiedSeverity: "minor", disposition: "defer" }]);
    expect(await deriveReviewNextPassContext({ ...request,
      dispositionStore: { ...request.dispositionStore, readDispositionRecord: async () => record },
    })).toMatchObject({ completePasses: 1, convergence: "pending", responseDue: true, incremental: null });
  });

  it("re-proves an earlier fixed leg before extending its correction chain", async () => {
    const root = findingsHostedResult(["major"]);
    if (root.kind !== "hosted") throw new Error("expected hosted producer");
    const first = input(root);
    const scope = { schemaVersion: 1 as const, predecessorProducerId: root.producerId,
      predecessorHeadSha: root.target.headSha, basisHeadSha: root.target.headSha, headSha: first.currentTarget.headSha,
      requiredFindings: [{ producerId: root.producerId, findingId: "finding-1", locus: "src/example.ts:1" }] };
    const requirement = createReviewRequirement({ target: first.currentTarget, projection: first.standardReview,
      acceptableSources: root.requirement.acceptableSources, initialAdmission: root.requirement.initialAdmission });
    if (requirement === null) throw new Error("expected requirement");
    const middle = { ...root, producerId: "hosted/attempt-2", target: first.currentTarget, requirement,
      hostedTarget: { ...root.hostedTarget, headSha: first.currentTarget.headSha },
      admission: { ...root.admission, logicalPass: 2, requestedCoverage: "incremental" as const,
        effectiveCoverage: "incremental" as const, correctionScope: scope, policyVersion: requirement.policyVersion } };
    const rootRecord = approvedRecord(root, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
    const middleRecord = approvedRecord(middle, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
    const second = input(middle);
    const { targetId: ignored, ...coordinates } = second.currentTarget;
    void ignored;
    const currentTarget = createReviewTarget({ ...coordinates, headSha: "f".repeat(40) });
    const request = { ...second, currentTarget,
      resultReader: { readResult: async () => root },
      dispositionStore: { ...second.dispositionStore,
        readDispositionRecord: async (producer: string) => producer === root.producerId ? rootRecord : middleRecord },
      readResponsePerformance: async (result: ReviewResult) => result.producerId === root.producerId
        ? { ...performedFix(root, rootRecord), producedHeadSha: middle.target.headSha }
        : { ...performedFix(middle, middleRecord), producedHeadSha: currentTarget.headSha },
      confirmApplicability: async () => "review-required" as const,
      confirmCurrentApplicability: async () => "review-required" as const,
    };
    expect((await deriveReviewNextPassContext(request)).incremental?.scope).toMatchObject({
      basisHeadSha: root.target.headSha, predecessorProducerId: middle.producerId, headSha: currentTarget.headSha,
      requiredFindings: expect.arrayContaining([
        { producerId: root.producerId, findingId: "finding-1", locus: "src/example.ts:1" },
        { producerId: middle.producerId, findingId: "finding-1", locus: "src/example.ts:1" },
      ]),
    });
    expect((await deriveReviewNextPassContext({ ...request,
      readResponsePerformance: async result => result.producerId === root.producerId ? null
        : request.readResponsePerformance(result),
    })).incremental).toBeNull();
  });

  it("retains response facts but offers no range when the current Git target is unavailable", async () => {
    const request = input(findingsHostedResult(["major"]));
    expect(await deriveReviewNextPassContext({ ...request, currentTarget: null }))
      .toEqual({ completePasses: 1, convergence: "unconverged", responseDue: false, incremental: null });
  });

});


it("binds a correction predecessor to the finished logical attempt rather than the complete count", async () => {
  const request = input(findingsHostedResult(["major"]));
  const matching = { ...request, completedPasses: request.predecessor!.admission.logicalPass, completePasses: 1 };
  expect((await deriveReviewNextPassContext(matching)).incremental?.basis).toBe("fix-check");
  expect((await deriveReviewNextPassContext({ ...matching, completedPasses: matching.completedPasses + 1 })).incremental)
    .toBeNull();
});

it("admits repeated material fix checks at the ceiling with the complete correction history", async () => {
  const original = findingsHostedResult(["major"]);
  let predecessor: ReviewResult = { ...original, admission: { ...original.admission,
    lineage: { kind: "candidate", candidateId: canonicalDigest({ candidate: "repeated-fixes" }) } } };
  const results = new Map<string, ReviewResult>();
  const records = new Map<string, ReturnType<typeof approvedRecord>>();
  const performances = new Map<string, ReturnType<typeof performedFix>>();
  const requiredProducers: string[] = [];

  for (const seed of ["e", "f", "1"]) {
    results.set(predecessor.producerId, predecessor);
    requiredProducers.push(predecessor.producerId);
    const record = approvedRecord(predecessor, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
    records.set(predecessor.producerId, record);
    const { targetId: ignored, ...coordinates } = predecessor.target;
    void ignored;
    const currentTarget = createReviewTarget({ ...coordinates, headSha: seed.repeat(40), headTree: "1".repeat(40) });
    performances.set(predecessor.producerId, { ...performedFix(predecessor, record), producedHeadSha: currentTarget.headSha });
    const request = { ...input(predecessor), currentTarget,
      resultReader: { readResult: async (id: string) => {
        const result = results.get(id);
        if (result === undefined) throw new Error(`Missing producer ${id}`);
        return result;
      } },
      dispositionStore: { readDispositionRecord: async (id: string) => records.get(id) ?? null,
        appendDispositionRecord: async () => { throw new Error("read-only derivation"); } },
      readResponsePerformance: async (result: ReviewResult) => performances.get(result.producerId) ?? null,
    };
    const nextPassContext = await deriveReviewNextPassContext(request);
    expect(nextPassContext).toMatchObject({ completePasses: 1, convergence: "unconverged", responseDue: false,
      incremental: { basis: "fix-check", scope: { predecessorProducerId: predecessor.producerId,
        headSha: currentTarget.headSha } } });
    const scope = nextPassContext.incremental?.scope;
    if (scope === undefined) throw new Error("Expected the proved correction chain");
    expect(scope.requiredFindings.map(finding => finding.producerId).sort()).toEqual([...requiredProducers].sort());
    expect(resolveReviewPolicy({ schemaVersion: 1,
      target: { repository: "owner/repository", pullRequest: null, headSha: currentTarget.headSha },
      lane: "standard", standardReview: request.standardReview, sources: ["delegated-agent"], maxPasses: 1,
      completedPasses: predecessor.admission.logicalPass, attempts: [], nextPassContext,
    })).toMatchObject({ state: "ready", payload: { pass: predecessor.admission.logicalPass + 1,
      sourceId: "delegated-agent", ceilingOverrideApplied: false } });
    predecessor = localCorrectionResult(predecessor, scope);
  }
});
