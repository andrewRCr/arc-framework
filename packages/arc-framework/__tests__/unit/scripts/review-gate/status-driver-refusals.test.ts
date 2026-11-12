/** Driver refusals remain actionable across public review-status routes. */
import { expect, it } from "vitest";
import { canonicalDigest } from "../../../../src/lib/kernel/index.js";
import { DeliveryReviewMemberVehicleSchema } from "../../../../src/lib/delivery/review-vehicle.js";
import { resolveReviewPolicy } from "../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { composeDeliveryReviewObligation, composeSingletonReviewObligation, resolveReviewStatus }
  from "../../../../src/scripts/review-gate/status.js";
import { createHostedHandleFixture } from "../../../fixtures/hosted-review.js";

const vehicle = DeliveryReviewMemberVehicleSchema.parse({ kind: "delivery-member",
  planId: "123e4567-e89b-42d3-a456-426614174000", deliverableId: canonicalDigest({ member: 1 }),
  workUnitId: "example", head: "c".repeat(40) });
const handle = createHostedHandleFixture({ provider: "codex-pr", vehicle });
const target = { repository: handle.target.repository, headRef: "feat/example", headSha: handle.target.headSha };
const requirement = handle.admission.requirement;
const standardReview = { obligation: requirement.obligation, reasons: requirement.reasons,
  rubricVersion: requirement.rubricVersion, rubricDigest: requirement.rubricDigest, retrigger: requirement.retrigger,
  count: requirement.count };

it.each([true, false])("preserves singleton delta refusal and local recovery, configured=%s", async configured => {
  const request = { schemaVersion: 1, target: handle.target, lane: "standard", standardReview,
    sources: configured ? ["codex-pr", "delegated-agent"] : ["codex-pr"], maxPasses: 4, completedPasses: 1,
    attempts: [], invocation: { mode: "force", sourceId: "codex-pr" },
    nextPassContext: { completePasses: 1, convergence: "converged", responseDue: false,
      incremental: { basis: "delta-check", scope: { schemaVersion: 1, predecessorProducerId: "local/converged",
        predecessorHeadSha: "b".repeat(40), basisHeadSha: "b".repeat(40), headSha: handle.target.headSha,
        requiredFindings: [] } } },
  };
  const statusRoute = { kind: "target" as const, target };
  const status = (admission: ReturnType<typeof resolveReviewPolicy>) => resolveReviewStatus({ target }, {
    observe: async () => ({ actualHeadSha: target.headSha, currentBaseOid: "b".repeat(40),
      baseContained: true, requiredChecks: "green", routedObligation: composeSingletonReviewObligation({ statusRoute,
        discharge: { discharged: false, detail: "The delta needs local review.",
          requestCoverage: "incremental" },
        applicabilityContext: { workUnitId: "example", expectedRecordVersion: canonicalDigest({ version: 1 }),
          candidateId: canonicalDigest({ candidate: 1 }) },
        request: { target: handle.target, admission, sourceId: "delegated-agent", coverage: "incremental", standardReview },
      }) }),
  });
  const refusal = await status(resolveReviewPolicy(request));
  expect(refusal).toMatchObject({ state: "blocked",
    reason: configured ? "delta-check-local-review-required" : "delta-check-local-source-unconfigured",
    remedy: { argv: ["arc", "review", "status", "--target", JSON.stringify(target),
      ...(configured ? ["--source", "delegated-agent"] : [])] } });
  if (refusal.state !== "blocked" || !("remedy" in refusal)) throw new Error("expected delta recovery");
  expect(refusal.remedy.text).toContain("delta check");
  expect(refusal.remedy.text).toContain(configured ? "delegated-agent" : "review.standard_sources");
  expect(refusal.remedy.text).not.toContain("fixes have not been re-examined");
  await expect(status(resolveReviewPolicy({ ...request, sources: ["codex-pr", "delegated-agent"],
    invocation: { mode: "force", sourceId: "delegated-agent" } }))).resolves.toMatchObject({
    nextAction: "review-singleton-local-prepare",
  });
});

it.each(["delivery work-unit", "delivery target", "singleton"].flatMap(surface =>
  [{ configured: true, sourcePending: false }, { configured: false, sourcePending: false },
    ...(surface.startsWith("delivery") ? [{ configured: true, sourcePending: true }] : [])]
    .map(facts => ({ surface, ...facts }))))(
  "carries the local-review refusal through $surface status, configured=$configured, source pending=$sourcePending", async ({ surface, configured, sourcePending }) => {
  const delivery = surface.startsWith("delivery");
  const statusRoute = surface === "delivery work-unit" ? { kind: "work-unit" as const, workUnitId: "example" }
    : { kind: "target" as const, target };
  const routeArgv = ["arc", "review", "status", ...(statusRoute.kind === "work-unit"
    ? ["--work-unit", "example"] : ["--target", JSON.stringify(target)])];
    const admission = resolveReviewPolicy({ schemaVersion: 1, target: handle.target, lane: "standard", standardReview,
      sources: configured ? ["codex-pr", "delegated-agent"] : ["codex-pr"], maxPasses: 4, completedPasses: 1,
      attempts: [], nextPassContext: { completePasses: 1, convergence: "unconverged", responseDue: false, incremental: null },
      ...(configured ? { invocation: { mode: "force" as const, sourceId: "codex-pr" } } : {}),
    });
    const discharge = { discharged: false, detail: "A material fix still needs local review.",
      nextSource: sourcePending ? null : configured ? "delegated-agent" : "codex-pr", requestCoverage: "complete" as const };
    const obligation = delivery ? composeDeliveryReviewObligation({ statusRoute,
      targets: [{ ...handle.target, vehicle, position: 1, memberCount: 1, chunkKey: "first", title: "First member" }],
      discharges: [{ ...discharge, requestAdmission: admission, completedPasses: 1, completePasses: 1,
        passCeiling: 4, attemptHistory: [] }],
    }) : composeSingletonReviewObligation({ statusRoute, discharge,
      applicabilityContext: { workUnitId: vehicle.workUnitId, expectedRecordVersion: canonicalDigest({ version: 1 }),
        candidateId: canonicalDigest({ candidate: 1 }) },
      request: { target: handle.target, admission, sourceId: configured ? "delegated-agent" : "codex-pr", coverage: "complete" },
    });
    const result = await resolveReviewStatus({ target }, { observe: async () => ({ actualHeadSha: target.headSha,
      currentBaseOid: "b".repeat(40), baseContained: true, requiredChecks: "green", routedObligation: obligation }) });
    const code = configured ? "material-fix-local-review-required" : "material-fix-local-source-unconfigured";
    expect(result).toMatchObject({ state: "blocked", reason: code, remedy: {
      argv: [...routeArgv, ...(configured ? ["--source", "delegated-agent"] : [])],
    } });
    if (result.state !== "blocked" || !("remedy" in result)) throw new Error("expected a recoverable refusal");
    expect(result.remedy.text).toContain("delegated-agent");
    if (!configured && surface === "delivery work-unit") {
      expect(result.remedy.text).toContain("Owner's stop");
      expect(result.remedy.text).toContain("not been re-examined");
    } else expect(result.remedy.text).not.toContain("Owner's stop");
});

it.each(["delivery work-unit", "delivery target", "singleton"])(
  "refuses hosted incremental coverage through %s with a local retry", async surface => {
    const statusRoute = surface === "delivery work-unit" ? { kind: "work-unit" as const, workUnitId: "example" }
      : { kind: "target" as const, target };
    const admission = resolveReviewPolicy({ schemaVersion: 1, target: handle.target, lane: "standard", standardReview,
      sources: ["codex-pr", "delegated-agent"], maxPasses: 4, completedPasses: 0, attempts: [],
      nextPassContext: { completePasses: 0, convergence: "none", responseDue: false, incremental: null } });
    const discharge = { discharged: false, detail: "Review is required.", nextSource: "codex-pr",
      requestCoverage: "incremental" as const };
    const obligation = surface.startsWith("delivery") ? composeDeliveryReviewObligation({ statusRoute,
      targets: [{ ...handle.target, vehicle, position: 1, memberCount: 1, chunkKey: "first", title: "First member" }],
      discharges: [{ ...discharge, requestAdmission: admission, completedPasses: 0, completePasses: 0,
        passCeiling: 4, attemptHistory: [] }],
    }) : composeSingletonReviewObligation({ statusRoute, discharge,
      applicabilityContext: { workUnitId: vehicle.workUnitId, expectedRecordVersion: canonicalDigest({ version: 1 }),
        candidateId: canonicalDigest({ candidate: 1 }) },
      request: { target: handle.target, admission, sourceId: "codex-pr", coverage: "incremental" },
    });
    const result = await resolveReviewStatus({ target }, { observe: async () => ({ actualHeadSha: target.headSha,
      currentBaseOid: "b".repeat(40), baseContained: true, requiredChecks: "green", routedObligation: obligation }) });
    expect(result).toMatchObject({ state: "blocked", reason: "hosted-incremental-unsupported", remedy: {
      text: expect.stringContaining("local fix check"), argv: ["arc", "review", "status",
        ...(statusRoute.kind === "work-unit" ? ["--work-unit", "example"] : ["--target", JSON.stringify(target)]),
        "--source", "delegated-agent"],
    } });
  });
