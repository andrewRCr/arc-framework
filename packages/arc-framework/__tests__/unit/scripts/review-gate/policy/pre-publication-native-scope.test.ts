/**
 * A native scope-judgment refusal records the Owner judgments its call carried, because the native continuation it
 * emits carries only call inputs. Following that continuation then composes with every judgment intact.
 */
import { expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createReviewDecisionPort } from "../../../../../src/lib/store/kinds/review/decision/access.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewResult } from "../../../../../src/scripts/review-gate/core/review-result.js";
import type { LaneProgressProjection } from "../../../../../src/scripts/review-gate/lane-progress.js";
import {
  composePrePublicationReviewRequest,
  type PrePublicationCompositionDependencies,
  type ReviewLane,
} from "../../../../../src/scripts/review-gate/policy/pre-publication-request.js";
import { resolveNativeExtraPassJudgment } from "../../../../../src/scripts/review-gate/runtime/native-extra-pass.js";
import { resolveNativeReviewTerminus } from "../../../../../src/scripts/review-gate/runtime/native-terminus.js";
import { prepareNativeReviewTerminus } from "../../../../../src/scripts/review-gate/runtime/native-terminus-write.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";

const HEAD = "a".repeat(40);
const REPOSITORY = "arc-framework/example";
const CANDIDATE_ID: `sha256:${string}` = `sha256:${"c".repeat(64)}`;
const assurance = { workContext: "work-unit", workClass: "Heavy" } as const;
const activity = { selfReview: true, frontlineReview: false };
const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
  repositoryId: REPOSITORY, baseRef: "main", diffBaseSha: "c".repeat(40), diffBaseTree: "d".repeat(40), headSha: HEAD,
  headTree: "e".repeat(40) });
const admission = { lineage: { kind: "candidate" as const, candidateId: CANDIDATE_ID }, logicalPass: 1, retryGeneration: 0,
  requestedCoverage: "complete" as const, effectiveCoverage: "complete" as const, scopeMode: "whole-target" as const };

function frontlineClean(): ReviewResult {
  const source = { sourceId: "coderabbit-cli", kind: "command" as const, executable: "coderabbit", argv: ["review"] };
  return { kind: "frontline", producerId: "frontline-1", repositoryId: REPOSITORY, target, sourceIdentity: source.sourceId,
    originalOutcome: "clean", findings: [], resultDigest: canonicalDigest({ result: "frontline-1" }),
    admission: { ...admission, policyVersion: canonicalDigest({ policy: "frontline" }) },
    outcomeRef: "frontline/frontline-1", sourceBindingId: canonicalDigest({ source: source.sourceId }), executableIdentity: null,
    outcome: { schemaVersion: 1, semanticsVersion: "frontline-review/v1", source, target, pass: 1, maxPasses: 2,
      outcome: "clean", findings: [], reason: null } };
}

async function nativeFixture(input: { results: readonly ReviewResult[];
  progress: Record<ReviewLane, LaneProgressProjection> }) {
  const h = createReviewHarness(), owner = (await h.seedMeta("example")).reference.owner;
  const facts = { decisions: createReviewDecisionPort(h.store, owner), readProjectId: async () => REPOSITORY };
  const now = "2026-10-31T12:00:00Z";
  const dependencies: PrePublicationCompositionDependencies = {
    stateOffBranch: true,
    resultReader: { readResult: vi.fn(async (producerId: string) => {
      const result = input.results.find(value => value.producerId === producerId);
      if (result === undefined) throw new Error(`missing result ${producerId}`);
      return result;
    }) },
    dispositionStore: { readDispositionRecord: vi.fn(async () => null) },
    readResponsePerformance: vi.fn(async () => null),
    confirmIncrementalApplicability: vi.fn(async () => "applicable" as const),
    confirmPriorProducerApplicability: vi.fn(async () => "applicable" as const),
    readCandidate: vi.fn(async () => ({ status: "current" as const, candidateId: CANDIDATE_ID, headSha: HEAD,
      subjectDigest: `sha256:${"d".repeat(64)}` as const, implementationChanged: false,
      convergenceVerification: "satisfied" as const, convergenceScope: null, lineageHeadShas: [HEAD] })),
    readAssurance: vi.fn(async () => ({ status: "resolved" as const, assurance, activity })),
    resolveTarget: vi.fn(async () => ({ status: "resolved" as const,
      target: { repository: REPOSITORY, pullRequest: null, headSha: HEAD } })),
    readReservationTarget: vi.fn(async (_workUnit, singleton) => ({ status: "resolved" as const,
      target: { kind: "pinned-head" as const, ...singleton } })),
    readDeliveryReviewTargets: vi.fn(async () => ({ status: "absent" as const })),
    deriveImmutableTarget: vi.fn(async () => ({ status: "resolved" as const, target })),
    readOwnerTerminusAuthority: vi.fn(async () => ({ status: "authorized" as const, ownerIdentity: "andrew" })),
    readLaneProgress: vi.fn(async (lane: ReviewLane) => input.progress[lane]),
    readLanePolicy: vi.fn(async (lane: ReviewLane) => lane === "frontline"
      ? { sources: ["coderabbit-cli"], maxPasses: 2 } : { sources: ["codex-pr"], maxPasses: 2 }),
    resolveExtraPassJudgment: async context => (await resolveNativeExtraPassJudgment({ ...context, facts,
      repositoryId: context.repositoryId ?? REPOSITORY, actor: "andrew", now })).judgment,
    resolveNativeTerminus: async context => resolveNativeReviewTerminus({ facts, ...context }),
    prepareNativeTerminusDecision: async context => prepareNativeReviewTerminus({ facts, ...context, now }),
  };
  const listDecisions = async () => {
    const listing = await facts.decisions.list();
    if (listing.status !== "complete") throw new Error(listing.reason);
    return listing.records;
  };
  return { h, dependencies, listDecisions };
}

const recorded = (completedPasses: number,
  attempts: Extract<LaneProgressProjection, { status: "recorded" }>["attempts"] = []): LaneProgressProjection =>
  ({ status: "recorded", completedPasses, completePasses: completedPasses, attempts });

const grants = [
  ["ceilingOverride", { exhaustedPassCount: 2, nextPass: 3 }, "ceiling"],
  ["additionalPassAuthorization", { headSha: HEAD, precedingProducerId: "producer-2", completedPasses: 2, nextPass: 3 },
    "additional"],
] as const;

it.each(grants)("records a frontline refusal's carried standard %s and terminus, then composes with both on re-entry",
  async (field, grant, precondition) => {
    const { h, dependencies, listDecisions } = await nativeFixture({ results: [frontlineClean()],
      progress: { frontline: recorded(1, [{ attemptId: "frontline-1", logicalPass: 1, sourceId: "coderabbit-cli",
        outcome: "clean" }]), standard: recorded(2) } });
    const refused = await composePrePublicationReviewRequest({ workUnit: "example", lanes: {
      frontline: { scopeMode: "chunked" },
      standard: { [field]: grant, terminus: { mode: "owner-accepted" } },
    } }, dependencies);

    expect(refused, JSON.stringify(refused)).toMatchObject({ status: "refused", code: "scope-judgment-required",
      scopeMismatch: { lane: "frontline", observedScope: "whole-target", selectedScope: "chunked" },
      terminusDecision: { key: expect.stringMatching(/^sha256:/u), put: { action: "put" } } });
    expect((await listDecisions()).map(({ value }) => value)).toEqual([expect.objectContaining({ lane: "standard",
      choice: expect.objectContaining({ kind: "extra-pass", passCount: 2, precondition: expect.objectContaining({
        kind: precondition }) }) })]);
    if (refused.status !== "refused" || refused.terminusDecision?.put === undefined) return;
    await h.store.write({ ...refused.terminusDecision.put, provenance: { verb: "review", lifecycleAction: "edit" } });

    const resumed = await composePrePublicationReviewRequest({ workUnit: "example",
      lanes: { frontline: { scopeMode: "whole-target" } } }, dependencies);
    expect(resumed, JSON.stringify(resumed)).toMatchObject({ status: "composed", request: { standard: {
      [field]: { nextPass: 3, decisionKey: expect.stringMatching(/^sha256:/u) },
      terminus: { kind: "owner-accepted", completedPasses: 2, decisionKey: refused.terminusDecision.key },
    } } });
  });
