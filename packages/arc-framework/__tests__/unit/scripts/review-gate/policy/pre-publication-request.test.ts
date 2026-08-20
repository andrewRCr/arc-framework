/**
 * Lane policy-request composition for the pre-publication procedure.
 *
 * The composition's contract is that the CLI owns what the caller must not carry — per-attempt
 * progress, source order, pass ceilings — and refuses rather than guessing at what the repository
 * cannot supply.
 */

import { describe, expect, it, vi } from "vitest";

import {
  applyCarriedStandardReviewReservation,
  composePrePublicationReviewRequest,
  type AssuranceRead,
  type CandidateRead,
  type ImmutableTargetRead,
  type PrePublicationCompositionDependencies,
  type ReviewLane,
  type TargetRead,
} from "../../../../../src/scripts/review-gate/policy/pre-publication-request.js";
import type { LaneProgressProjection } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createStandardReviewReservation } from
  "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";

const HEAD = "a".repeat(40);
const PREPUBLICATION_HEAD = "b".repeat(40);
const CANDIDATE_ID = `sha256:${"c".repeat(64)}`;

const currentCandidate: CandidateRead = {
  status: "current",
  candidateId: CANDIDATE_ID,
  headSha: HEAD,
  subjectDigest: `sha256:${"d".repeat(64)}`,
  implementationChanged: false,
  convergenceVerification: "satisfied",
  lineageHeadShas: [HEAD],
};

const resolvedAssurance: AssuranceRead = {
  status: "resolved",
  assurance: { workContext: "work-unit", workClass: "Heavy" },
  activity: { selfReview: true, frontlineReview: false },
};

const resolvedTarget: TargetRead = {
  status: "resolved",
  target: { repository: "arc-framework/example", pullRequest: null, headSha: HEAD },
};

const immutableTarget: ImmutableTargetRead = {
  status: "resolved",
  target: createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "arc-framework/example",
    baseRef: "main",
    diffBaseSha: "c".repeat(40),
    diffBaseTree: "d".repeat(40),
    headSha: HEAD,
    headTree: "e".repeat(40),
  }),
};

function dependencies(
  overrides: Partial<PrePublicationCompositionDependencies> = {},
): PrePublicationCompositionDependencies {
  return {
    readCandidate: vi.fn(async () => currentCandidate),
    readAssurance: vi.fn(async () => resolvedAssurance),
    resolveTarget: vi.fn(async () => resolvedTarget),
    deriveImmutableTarget: vi.fn(async () => immutableTarget),
    readLaneProgress: vi.fn(async (): Promise<LaneProgressProjection> => ({
      status: "recorded",
      completedPasses: 0,
      attempts: [],
    })),
    readLanePolicy: vi.fn(async (lane: ReviewLane) => lane === "frontline"
      ? { sources: [], maxPasses: 2 }
      : { sources: ["codex-pr"], maxPasses: 2 }),
    ...overrides,
  };
}

describe("composePrePublicationReviewRequest", () => {
  it("keeps a carried reservation's source order after an approved Candidate subject advance", async () => {
    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies({
      readLanePolicy: async (lane) => lane === "frontline"
        ? { sources: [], maxPasses: 2 }
        : { sources: ["codex-pr", "coderabbit-pr"], maxPasses: 2 },
    }));
    const rebound = applyCarriedStandardReviewReservation(composition, {
      candidateId: CANDIDATE_ID,
      candidateSubjectDigest: `sha256:${"f".repeat(64)}`,
      reservation: createStandardReviewReservation({
        candidateId: CANDIDATE_ID,
        sourceId: "coderabbit-pr",
        sources: ["coderabbit-pr", "codex-pr"],
        repository: "arc-framework/example",
        headSha: PREPUBLICATION_HEAD,
        obligation: {
          obligation: "required",
          reasons: ["sensitive-change-set"],
          rubricVersion: "standard-review/v1",
          rubricDigest: `sha256:${"e".repeat(64)}`,
          retrigger: "full-final",
          count: 1,
        },
      }),
    });

    expect(rebound.status).toBe("composed");
    if (rebound.status !== "composed") return;
    expect(rebound.request.standard.target.headSha).toBe(HEAD);
    expect(rebound.request.standard.sources).toEqual(["coderabbit-pr", "codex-pr"]);
  });

  it("composes both lanes against one target with CLI-owned sources and ceilings", async () => {
    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies());

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.frontline).toMatchObject({
      lane: "frontline",
      target: resolvedTarget.status === "resolved" ? resolvedTarget.target : null,
      sources: [],
      maxPasses: 2,
      completedPasses: 0,
    });
    expect(composition.request.standard).toMatchObject({
      lane: "standard",
      sources: ["codex-pr"],
      maxPasses: 2,
    });
    expect(composition.request.candidateId).toBe(CANDIDATE_ID);
  });

  it("composes the exact target the operations it routes to bind against", async () => {
    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies());

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.target)
      .toEqual(immutableTarget.status === "resolved" ? immutableTarget.target : null);
    // The lane target routes; the exact target identifies. Conflating them is what left the
    // exact-target operations with no obtainable input.
    expect(composition.request.frontline.target).not.toHaveProperty("targetId");
  });

  it("refuses independently resolved targets that do not identify the Candidate head", async () => {
    const policyMismatch = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies({
      resolveTarget: vi.fn(async (): Promise<TargetRead> => ({
        status: "resolved",
        target: { repository: "arc-framework/example", pullRequest: null, headSha: "b".repeat(40) },
      })),
    }));
    expect(policyMismatch).toMatchObject({ status: "refused", reason: expect.stringMatching(/Candidate head/u) });

    const immutableMismatch = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies({
      deriveImmutableTarget: vi.fn(async (): Promise<ImmutableTargetRead> => ({
        status: "resolved",
        target: createReviewTarget({
          schemaVersion: 2,
          semanticsVersion: "review-gate/v2",
          kind: "change-set",
          repositoryId: "arc-framework/example",
          baseRef: "main",
          diffBaseSha: "c".repeat(40),
          diffBaseTree: "d".repeat(40),
          headSha: "b".repeat(40),
          headTree: "e".repeat(40),
        }),
      })),
    }));
    expect(immutableMismatch).toMatchObject({
      status: "refused",
      reason: expect.stringMatching(/Candidate head/u),
    });
  });

  it("reports an underivable exact target without refusing the work that needs none", async () => {
    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies({
      deriveImmutableTarget: vi.fn(async (): Promise<ImmutableTargetRead> => ({
        status: "unavailable",
        reason: "the working tree is dirty",
      })),
    }));

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.target).toBeNull();
    expect(composition.advisories.join(" ")).toContain("the working tree is dirty");
  });

  it("routes an unestablished change set to a required standard obligation", async () => {
    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies());

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.standard.standardReview.obligation).toBe("required");
    expect(composition.request.standard.standardReview.reasons).toContain("unknown-change-set");
  });

  it("routes a supplied change set through the router rather than the unestablished default", async () => {
    const composition = await composePrePublicationReviewRequest(
      {
        workUnit: "example",
        changeSet: {
          changeSetState: "known",
          contentKind: "documentation",
          reviewRisk: "routine",
          changeDeterminacy: "ordinary",
          ownership: "self",
          surfaceAuthority: "planning-grooming",
        },
      },
      dependencies(),
    );

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.standard.standardReview.obligation).toBe("exempt");
    expect(composition.request.standard.standardReview.reasons).not.toContain("unknown-change-set");
    expect(composition.advisories).toHaveLength(0);
  });

  it("reduces supplied facts in the composition rather than accepting a caller's obligation", async () => {
    // The caller asserts facts; the two the repository establishes are not among them. A caller
    // claiming a light class or an inactive method must not lower the route it receives.
    const composition = await composePrePublicationReviewRequest(
      {
        workUnit: "example",
        changeSet: {
          changeSetState: "known",
          contentKind: "code-bearing",
          reviewRisk: "routine",
          changeDeterminacy: "atomic",
          ownership: "self",
          surfaceAuthority: "ordinary",
          assurance: { workContext: "work-unit", workClass: "Light" },
          activity: { selfReview: false, frontlineReview: true },
        },
      },
      dependencies(),
    );

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    // The caller's facts reached the reducer — an atomic code change set softens to `recommended`.
    expect(composition.request.standard.standardReview.obligation).toBe("recommended");
    // Its claims about the repository's own two facts did not: the fixture holds the inverse of both.
    expect(composition.request.frontline.frontlineActive).toBe(false);
    expect(composition.request.selfReview).toBe("pending");
    expect(composition.advisories).toHaveLength(0);
  });

  it.each([
    ["an unrecognized fact value", { changeSetState: "known", contentKind: "prose" }, "contentKind"],
    ["an unrecognized fact key", { changeSetState: "known", blastRadius: "wide" }, "blastRadius"],
    ["a non-record change set", "documentation", "$"],
  ])("normalizes %s to the conservative route and says why", async (_label, changeSet, path) => {
    const composition = await composePrePublicationReviewRequest(
      { workUnit: "example", changeSet },
      dependencies(),
    );

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.standard.standardReview.obligation).toBe("required");
    expect(composition.request.standard.standardReview.reasons).toContain("unknown-change-set");
    expect(composition.advisories).toHaveLength(1);
    expect(composition.advisories[0]).toContain(path);
  });

  it("binds each lane's scope and ceiling judgment to the resolved target and lane", async () => {
    const composition = await composePrePublicationReviewRequest(
      {
        workUnit: "example",
        lanes: {
          frontline: { scopeMode: "chunked" },
          standard: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } },
        },
      },
      dependencies(),
    );

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    // The caller supplies the judgment; the target and lane it would otherwise restate come from
    // the composition, so a target or lane mismatch is not reachable from this path.
    expect(composition.request.frontline.scopeSelection)
      .toEqual({ mode: "chunked", target: resolvedTarget.status === "resolved" ? resolvedTarget.target : null });
    expect(composition.request.frontline.ceilingOverride).toBeUndefined();
    expect(composition.request.standard.scopeSelection).toBeUndefined();
    expect(composition.request.standard.ceilingOverride).toMatchObject({
      lane: "standard",
      exhaustedPassCount: 2,
      nextPass: 3,
      target: resolvedTarget.status === "resolved" ? resolvedTarget.target : null,
    });
  });

  it("carries an explicit one-run frontline skip beside its bounded scope", async () => {
    const composition = await composePrePublicationReviewRequest(
      {
        workUnit: "example",
        lanes: {
          frontline: { scopeMode: "chunked", invocation: { mode: "skip" } },
          standard: { scopeMode: "chunked" },
        },
      },
      dependencies({
        readAssurance: async () => ({
          ...resolvedAssurance,
          activity: { selfReview: true, frontlineReview: true },
        }),
      }),
    );

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.frontline).toMatchObject({
      frontlineActive: true,
      invocation: { mode: "skip" },
      scopeSelection: { mode: "chunked" },
    });
    expect(composition.request.standard).not.toHaveProperty("invocation");
  });

  it("omits both per-lane inputs when no judgment is supplied", async () => {
    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies());

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.frontline.scopeSelection).toBeUndefined();
    expect(composition.request.standard.ceilingOverride).toBeUndefined();
  });

  it.each([
    ["an unrecognized scope mode", { standard: { scopeMode: "partial" } }],
    ["a half-supplied ceiling override", { standard: { ceilingOverride: { nextPass: 3 } } }],
    ["a caller-restated target", { standard: { scopeMode: "chunked", target: { repository: "x/y" } } }],
    ["an unrecognized lane", { hosted: { scopeMode: "chunked" } }],
    ["a frontline override on the standard lane", { standard: { invocation: { mode: "skip" } } }],
  ])("refuses %s rather than dropping it to the unbounded default", async (_label, lanes) => {
    // Deliberately unlike the change-set facts, which normalize: silently dropping a bounded scope
    // reviews the whole target, and dropping an override re-blocks a pass already approved.
    const composition = await composePrePublicationReviewRequest(
      { workUnit: "example", lanes },
      dependencies(),
    );

    expect(composition.status).toBe("refused");
    expect(composition.status === "refused" && composition.reason)
      .toContain("per-lane review judgment is not composable");
  });

  it("carries the effective method activity into both lanes and the self-review state", async () => {
    const active = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies({
      readAssurance: async () => ({
        ...resolvedAssurance,
        activity: { selfReview: true, frontlineReview: true },
      }),
    }));
    const inactive = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies({
      readAssurance: async () => ({
        ...resolvedAssurance,
        activity: { selfReview: false, frontlineReview: false },
      }),
    }));

    expect(active.status === "composed" && active.request.frontline.frontlineActive).toBe(true);
    expect(active.status === "composed" && active.request.selfReview).toBe("pending");
    expect(inactive.status === "composed" && inactive.request.frontline.frontlineActive).toBe(false);
    expect(inactive.status === "composed" && inactive.request.selfReview).toBe("inactive");
  });

  it("prefers the author's self-review report over the method's activity", async () => {
    const composition = await composePrePublicationReviewRequest(
      { workUnit: "example", selfReview: "settled" },
      dependencies(),
    );

    expect(composition.status === "composed" && composition.request.selfReview).toBe("settled");
  });

  it("replays each lane's durable progress rather than accepting caller-supplied attempts", async () => {
    const readLaneProgress = vi.fn(async (lane: ReviewLane): Promise<LaneProgressProjection> =>
      lane === "standard"
        ? {
            status: "recorded",
            completedPasses: 1,
            attempts: [{ attemptId: "attempt-1", sourceId: "codex-pr", outcome: "findings" }],
          }
        : { status: "recorded", completedPasses: 0, attempts: [] });

    const composition = await composePrePublicationReviewRequest(
      { workUnit: "example" },
      dependencies({
        readLaneProgress,
        resolveTarget: async () => ({
          status: "resolved",
          target: { repository: "arc-framework/example", pullRequest: 42, headSha: HEAD },
        }),
      }),
    );

    expect(readLaneProgress).toHaveBeenCalledWith("frontline", HEAD, [HEAD]);
    expect(readLaneProgress).toHaveBeenCalledWith("standard", HEAD, [HEAD]);
    expect(composition.status === "composed" && composition.request.standard).toMatchObject({
      completedPasses: 1,
      attempts: [{ sourceId: "codex-pr", outcome: "findings" }],
    });
  });

  it("carries the review ceiling across a fix-induced Candidate head change", async () => {
    const priorHead = "9".repeat(40);
    const readLaneProgress = vi.fn(async (lane: ReviewLane): Promise<LaneProgressProjection> => ({
      status: "recorded",
      completedPasses: lane === "standard" ? 2 : 0,
      attempts: [],
    }));
    const composition = await composePrePublicationReviewRequest(
      { workUnit: "example", selfReview: "settled" },
      dependencies({
        readCandidate: async () => ({ ...currentCandidate, lineageHeadShas: [priorHead, HEAD] }),
        readLaneProgress,
      }),
    );

    expect(readLaneProgress).toHaveBeenCalledWith("standard", HEAD, [priorHead, HEAD]);
    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.standard.completedPasses).toBe(2);
  });

  it("refuses when recorded progress cannot compose against the current target", async () => {
    // A hosted attempt is recorded at this head, but the change request is no longer open — the
    // two reads disagree, and the request schema is what detects it.
    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies({
      readLaneProgress: async (lane) => lane === "standard"
        ? {
            status: "recorded",
            completedPasses: 1,
            attempts: [{ attemptId: "attempt-1", sourceId: "codex-pr", outcome: "findings" }],
          }
        : { status: "recorded", completedPasses: 0, attempts: [] },
    }));

    expect(composition.status).toBe("refused");
    expect(composition.status === "refused" && composition.reason)
      .toContain("does not compose against the current review target");
  });

  it("reports an unrecorded lane instead of silently composing it as never attempted", async () => {
    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies({
      readLaneProgress: async (lane) => lane === "standard"
        ? { status: "unrecorded" }
        : { status: "recorded", completedPasses: 0, attempts: [] },
    }));

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.standard.completedPasses).toBe(0);
    expect(composition.request.standard.attempts).toEqual([]);
    expect(composition.advisories).toHaveLength(1);
    expect(composition.advisories[0]).toContain("standard lane has no durable progress");
  });

  it.each([
    ["a missing Candidate record", { readCandidate: async (): Promise<CandidateRead> => ({ status: "missing" }) }, "No managed Candidate record", undefined],
    ["an unexplained reviewable delta", { readCandidate: async (): Promise<CandidateRead> => ({ status: "blocked", reason: "Run full work-unit verification." }) }, "Run full work-unit verification.", "candidate-unexplained-delta"],
    ["an unbindable rubric", { readAssurance: async (): Promise<AssuranceRead> => ({ status: "refused", reason: "rubric unavailable" }) }, "rubric unavailable", undefined],
    ["unresolvable origin coordinates", { resolveTarget: async (): Promise<TargetRead> => ({ status: "refused", reason: "no origin" }) }, "no origin", undefined],
  ] as const)("refuses on %s", async (_label, override, expected, expectedCode) => {
    const composition = await composePrePublicationReviewRequest(
      { workUnit: "example" },
      dependencies(override),
    );

    expect(composition.status).toBe("refused");
    expect(composition.status === "refused" && composition.reason).toContain(expected);
    expect(composition.status === "refused" ? composition.code : undefined).toBe(expectedCode);
  });

  it("does not read assurance, target, or progress once the Candidate read refuses", async () => {
    const readAssurance = vi.fn();
    const resolveTarget = vi.fn();
    const readLaneProgress = vi.fn();

    await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies({
      readCandidate: async () => ({ status: "missing" }),
      readAssurance,
      resolveTarget,
      readLaneProgress,
    }));

    expect(readAssurance).not.toHaveBeenCalled();
    expect(resolveTarget).not.toHaveBeenCalled();
    expect(readLaneProgress).not.toHaveBeenCalled();
  });
});
