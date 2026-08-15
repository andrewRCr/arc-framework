/**
 * Lane policy-request composition for the pre-publication procedure.
 *
 * The composition's contract is that the CLI owns what the caller must not carry — per-attempt
 * progress, source order, pass ceilings — and refuses rather than guessing at what the repository
 * cannot supply.
 */

import { describe, expect, it, vi } from "vitest";

import {
  composePrePublicationReviewRequest,
  type AssuranceRead,
  type CandidateRead,
  type PrePublicationCompositionDependencies,
  type ReviewLane,
  type TargetRead,
} from "../../../../../src/scripts/review-gate/policy/pre-publication-request.js";
import type { LaneProgressProjection } from "../../../../../src/scripts/review-gate/lane-progress.js";

const HEAD = "a".repeat(40);
const CANDIDATE_ID = `sha256:${"c".repeat(64)}`;

const currentCandidate: CandidateRead = {
  status: "current",
  candidateId: CANDIDATE_ID,
  headSha: HEAD,
  implementationChanged: false,
  convergenceVerification: "satisfied",
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

function dependencies(
  overrides: Partial<PrePublicationCompositionDependencies> = {},
): PrePublicationCompositionDependencies {
  return {
    readCandidate: vi.fn(async () => currentCandidate),
    readAssurance: vi.fn(async () => resolvedAssurance),
    resolveTarget: vi.fn(async () => resolvedTarget),
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

  it("routes an unestablished change set to a required standard obligation", async () => {
    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies());

    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") return;
    expect(composition.request.standard.standardReview.obligation).toBe("required");
    expect(composition.request.standard.standardReview.reasons).toContain("unknown-change-set");
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
        ? { status: "recorded", completedPasses: 1, attempts: [{ sourceId: "codex-pr", outcome: "findings" }] }
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

    expect(readLaneProgress).toHaveBeenCalledWith("frontline", HEAD);
    expect(readLaneProgress).toHaveBeenCalledWith("standard", HEAD);
    expect(composition.status === "composed" && composition.request.standard).toMatchObject({
      completedPasses: 1,
      attempts: [{ sourceId: "codex-pr", outcome: "findings" }],
    });
  });

  it("refuses when recorded progress cannot compose against the current target", async () => {
    // A hosted attempt is recorded at this head, but the change request is no longer open — the
    // two reads disagree, and the request schema is what detects it.
    const composition = await composePrePublicationReviewRequest({ workUnit: "example" }, dependencies({
      readLaneProgress: async (lane) => lane === "standard"
        ? { status: "recorded", completedPasses: 1, attempts: [{ sourceId: "codex-pr", outcome: "findings" }] }
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
    ["a missing Candidate record", { readCandidate: async (): Promise<CandidateRead> => ({ status: "missing" }) }, "No managed Candidate record"],
    ["an unexplained reviewable delta", { readCandidate: async (): Promise<CandidateRead> => ({ status: "blocked", reason: "Run full work-unit verification." }) }, "Run full work-unit verification."],
    ["an unbindable rubric", { readAssurance: async (): Promise<AssuranceRead> => ({ status: "refused", reason: "rubric unavailable" }) }, "rubric unavailable"],
    ["unresolvable origin coordinates", { resolveTarget: async (): Promise<TargetRead> => ({ status: "refused", reason: "no origin" }) }, "no origin"],
  ])("refuses on %s", async (_label, override, expected) => {
    const composition = await composePrePublicationReviewRequest(
      { workUnit: "example" },
      dependencies(override),
    );

    expect(composition.status).toBe("refused");
    expect(composition.status === "refused" && composition.reason).toContain(expected);
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
