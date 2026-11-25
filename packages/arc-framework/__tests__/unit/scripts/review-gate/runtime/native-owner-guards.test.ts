/** Native review publication and persistence refuse a missing exact work item as a typed selection naming its repair. */
import { expect, it, onTestFinished } from "vitest";
import { ReviewOwnerSelectionError } from "../../../../../src/lib/store/kinds/review/errors.js";
import { isNativeTypedRefusal } from "../../../../../src/lib/store/native-refusal.js";
import { createReviewDecisionPort } from "../../../../../src/lib/store/kinds/review/decision/access.js";
import { hostedAwaitAction } from "../../../../../src/scripts/review-gate/hosted/request.js";
import { retainReviewOperationReference } from "../../../../../src/scripts/review-gate/runtime/continuation-invocation.js";
import { retainHostedAwaitReference, retainHostedRequestReference }
  from "../../../../../src/scripts/review-gate/runtime/hosted-invocation.js";
import { createReviewCompositionContext } from "../../../../../src/scripts/review-gate/runtime/composition-context.js";
import { recordNativeFrontlineSkip } from "../../../../../src/scripts/review-gate/runtime/native-frontline-window.js";
import { persistNativeTerminusBoundary, persistNativeTerminusDecision }
  from "../../../../../src/scripts/review-gate/runtime/native-terminus-persistence.js";
import { prepareNativeReviewTerminus } from "../../../../../src/scripts/review-gate/runtime/native-terminus-write.js";
import { selectedSourceOwner } from "../../../../../src/scripts/review-gate/runtime/source-invocation.js";
import { createHostedHandleFixture } from "../../../../fixtures/hosted-review.js";
import { boundaryV2Fixture } from "../../../../fixtures/review-boundary.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { candidateFixture } from "../../../../helpers/store/tracked-write-fixture.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";
const remedy = { text: "Run the command from the work unit's checkout, or continue it from the reference its producer emitted." };

async function native() {
  const h = createReviewHarness();
  await h.seedProject(projectId);
  const { owner } = (await h.seedMeta("example")).reference;
  const input = { cwd: "/native-owner-guards", exec: scriptGitExec([]).exec, store: h.store, projectId: h.projectId };
  const terminus = await prepareNativeReviewTerminus({ facts: { decisions: createReviewDecisionPort(h.store, owner) },
    subject: { lineage: { kind: "candidate", candidateId: `sha256:${"c".repeat(64)}` }, headSha: null,
      subjectDigest: `sha256:${"d".repeat(64)}` }, acceptedBy: "andrew", completedPasses: 1, now: "2026-10-31T12:00:00Z" });
  if (terminus.put === undefined) throw new Error("Expected a fresh terminus decision");
  return { h, owner, input, decision: terminus.put, key: terminus.key };
}

/** Refuse without the exact work item as a typed native refusal, then run with it. */
async function refusesThenRuns<T>(attempt: (bound: boolean) => Promise<T>, condition: string): Promise<T> {
  const refused = await attempt(false).then(() => undefined, (error: unknown) => error);
  expect(refused).toBeInstanceOf(ReviewOwnerSelectionError);
  expect(isNativeTypedRefusal(refused)).toBe(true);
  expect(refused).toMatchObject({ code: "invalid-input", condition, remedy });
  return attempt(true);
}

it("refuses a native source reference with no exact work item, and names the owner once bound", async () => {
  const { owner, input } = await native();
  expect(await refusesThenRuns(bound => selectedSourceOwner({ ...input, ...(bound ? { workItem: owner } : {}) }),
    "A native source reference needs the invocation's exact work item.")).toEqual({ repositoryId: projectId, workItem: owner });
});

it("refuses a native operation reference with no exact work item, and publishes it once bound", async () => {
  const { owner, input } = await native();
  expect(await refusesThenRuns(bound => retainReviewOperationReference({ ...input, ...(bound ? { workItem: owner } : {}) },
    { payload: { operationId: "operation-1" } }), "A native operation reference needs the invocation's exact work item."))
    .toMatchObject({ payload: { operationId: "operation-1", operationRef: expect.any(String) } });
});

it.each(["request", "await"] as const)("refuses a native hosted %s reference with no exact work item, and publishes it once bound",
  async kind => {
    const { owner, input } = await native();
    const handle = createHostedHandleFixture({ repositoryId: projectId });
    const result = kind === "request"
      ? { ...hostedAwaitAction(handle), mode: "review-hosted-request", requestedCoverage: handle.requestedCoverage,
        attemptedProviders: [handle.provider], state: "requested", nextAction: "await", action: hostedAwaitAction(handle) }
      : { ...hostedAwaitAction(handle), mode: "review-hosted-await", state: "pending", nextAction: "await",
        action: hostedAwaitAction(handle), elapsedMs: 0 };
    const retain: (options: Parameters<typeof retainHostedRequestReference>[0], result: unknown) => Promise<unknown> =
      kind === "request" ? retainHostedRequestReference : retainHostedAwaitReference;
    expect(await refusesThenRuns(bound => retain({ ...input, ...(bound ? { workItem: owner } : {}) }, result),
      "A native hosted reference needs the invocation's exact work item."))
      .toMatchObject({ operationRef: expect.any(String), action: { operationRef: expect.any(String) } });
  });

it("refuses a native terminus decision with no exact work item, and records it once bound", async () => {
  const { h, owner, input, decision, key } = await native();
  await refusesThenRuns(bound => persistNativeTerminusDecision({ ...input, ...(bound ? { workItem: owner } : {}) }, decision),
    "A native review terminus needs the invocation's exact work item.");
  expect(await createReviewDecisionPort(h.store, owner).read(key)).not.toBeNull();
});

it("refuses a native terminus boundary with no exact work item, and records both once bound", async () => {
  const { h, owner, input, decision, key } = await native();
  await refusesThenRuns(bound => persistNativeTerminusBoundary({ ...input, ...(bound ? { workItem: owner } : {}) },
    boundaryV2Fixture(), null, decision), "A native review terminus needs the invocation's exact work item.");
  expect(await createReviewDecisionPort(h.store, owner).read(key)).not.toBeNull();
});

it("refuses a native Candidate frontline skip with no exact work item, and records it once bound", async () => {
  const h = createReviewHarness();
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example"), candidate = candidateFixture();
  await h.seedCandidate(primary.reference.owner, candidate);
  const checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  const { family } = createReviewCompositionContext({ ...checkout, workItem: primary.reference.owner });
  if (family.mode !== "stored" || family.ports.inFlight.nativeFacts === undefined) throw new Error("Expected native facts");
  const facts = family.ports.inFlight.nativeFacts;
  const lineage = { kind: "candidate" as const, candidateId: candidate.attestation.candidateId };
  await refusesThenRuns(bound => recordNativeFrontlineSkip({ invocation: { ...checkout,
    ...(bound ? { workItem: primary.reference.owner } : {}) }, facts, repositoryId: projectId, lineage,
  headSha: "a".repeat(40), now: "2026-10-31T12:00:00Z" }), "A native frontline skip needs the invocation's exact work item.");
  const listing = await facts.decisions.list();
  expect(listing).toMatchObject({ status: "complete", records: [{ value: { lane: "frontline", choice: { kind: "lane-skip" } } }] });
});
