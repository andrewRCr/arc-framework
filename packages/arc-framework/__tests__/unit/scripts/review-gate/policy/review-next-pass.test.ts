/** Shared next-look facts from immutable producers and approved responses. */
import { describe, expect, it } from "vitest";
import { findingsHostedResult, cleanHostedResult, approvedRecord, performedFix } from "../../../../fixtures/review-response-proof.js";
import { createReviewTarget, createReviewRequirement } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { confirmReviewCorrectionLeg, deriveReviewNextPassContext, type ReviewNextPassInput } from "../../../../../src/scripts/review-gate/policy/review-next-pass.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import type { ReviewResult } from "../../../../../src/scripts/review-gate/core/review-result.js";

function input(predecessor: ReviewResult | null, severity: "major" | "minor" = "major", performed = true,
  retrigger: "full-final" | "incremental" = "full-final"): ReviewNextPassInput & { currentTarget: ReviewResult["target"] } {
  let result = predecessor ?? cleanHostedResult();
  if (result.kind !== "hosted") throw new Error("expected hosted producer");
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
    predecessor, currentTarget, currentLineage: result.admission.lineage,
    standardReview: { obligation, reasons, rubricVersion, rubricDigest, retrigger, count },
    resultReader: { readResult: async () => { throw new Error("no earlier producer"); } },
    dispositionStore: { readDispositionRecord: async () => record,
      appendDispositionRecord: async () => { throw new Error("read-only derivation"); } },
    readResponsePerformance: async () => record === null || !performed ? null
      : { ...performedFix(result, record), producedHeadSha: currentTarget.headSha },
  };
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
  expect(context).toMatchObject({ convergence: "converged", responseDue: false, incremental: {
    basis: "delta-check", scope: { predecessorProducerId: request.predecessor!.producerId,
      predecessorHeadSha: request.predecessor!.target.headSha, basisHeadSha: request.predecessor!.target.headSha,
      headSha: request.currentTarget.headSha },
  } });
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
    })).toMatchObject({ convergence: "pending", responseDue: true, incremental: null });
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
    })).toMatchObject({ convergence: "pending", responseDue: true, incremental: null });
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
      .toEqual({ convergence: "unconverged", responseDue: false, incremental: null });
  });

});
