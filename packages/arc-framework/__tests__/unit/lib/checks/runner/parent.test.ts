/** Complete parent accounting composes correlated native evidence without another protocol parser. */
import { expect, it } from "vitest";
import { reduceCheckPlanOutcomes } from "../../../../../src/lib/checks/runner/parent.js";
import { RunnerExecution, indexRunnerPlan, validateRunnerPreparation } from "../../../../../src/lib/checks/runner/correlation.js";
import { makeRunnerProtocolPlan, makeRunnerProtocolReady } from "../../../../fixtures/checks/runner-protocol.js";

function fixture() {
  const source = makeRunnerProtocolPlan();
  const context = validateRunnerPreparation(indexRunnerPlan(source), makeRunnerProtocolReady(source),
    { planId: source.planId, instructions: "Inspect this fixture" });
  if (!context) throw new Error("Expected prepared context");
  const plan = { ...source, coordinates: [{ batch: 1, shard: { index: 1, count: 2 } }, { batch: 1, shard: { index: 2, count: 2 } }] };
  const execution = new RunnerExecution(context, { contextId: context.contextId, invocationIds: source.invocations.map(invocation => invocation.id) });
  return { plan, execution, contextId: context.contextId };
}

it("cannot pass when a planned shard has no terminal outcome", () => {
  const { plan, execution, contextId } = fixture();
  execution.acceptOutcome({ contextId, invocationId: plan.invocations[0]!.id, outcome: { status: "completed", exitCode: 0 } });
  const result = reduceCheckPlanOutcomes(plan, execution.observedOutcomes);
  expect(result.evidence.kind).toBe("unavailable");
  expect(result.evidence.incomplete).toEqual([expect.stringMatching(/batch 1.*shard 2\/2.*no terminal outcome/iu)]);
  expect(result.invocations).toEqual([
    { batch: 1, shard: { index: 1, count: 2 }, invocationId: plan.invocations[0]!.id, outcome: { kind: "success", exitCode: 0 } },
    { batch: 1, shard: { index: 2, count: 2 }, invocationId: plan.invocations[1]!.id,
      outcome: { kind: "unavailable", reason: expect.stringContaining("no terminal outcome") } },
  ]);
});

it.each(["duplicate", "conflicting", "unknown", "wrong-context"])("preserves an independently valid failure after %s evidence", fault => {
  const { plan, execution, contextId } = fixture();
  execution.acceptOutcome({ contextId, invocationId: plan.invocations[0]!.id,
    outcome: { status: "completed", exitCode: 0xC0000005, notice: "native failure" } });
  const notification = { contextId: fault === "wrong-context" ? "wrong" : contextId,
    invocationId: fault === "unknown" ? "unknown" : fault === "wrong-context" ? plan.invocations[1]!.id : plan.invocations[0]!.id,
    outcome: { status: "completed" as const, exitCode: fault === "conflicting" ? 0 : 0xC0000005 } };
  let diagnostic = "";
  try { execution.acceptOutcome(notification); } catch (error) { diagnostic = String(error); }
  expect(diagnostic).toMatch(/protocol/iu);
  const result = reduceCheckPlanOutcomes(plan, execution.observedOutcomes, undefined, [diagnostic]);
  expect(result.evidence).toMatchObject({ kind: "failure", exitCode: 0xC0000005,
    incomplete: [diagnostic, expect.stringMatching(/batch 1.*shard 2\/2/iu)] });
  expect(result.invocations[0]).toMatchObject({ outcome: { kind: "failure", exitCode: 0xC0000005, notice: "native failure" } });
  expect(result.invocations[1]).toMatchObject({ outcome: { kind: "unavailable" } });
});

it.each([
  { codes: [0, 0], kind: "success", exitCode: 0 },
  { codes: [5, 0], noEvidence: 5, kind: "success", exitCode: 0 },
  { codes: [5, 5], noEvidence: 5, kind: "no-evidence", exitCode: 5 },
  { codes: [137, 0], noEvidence: 137, kind: "success", exitCode: 0 },
  { codes: [137, 0], kind: "unavailable", exitCode: 137 },
  { codes: [256, 137], kind: "failure", exitCode: 256 },
  { codes: [0xFFFFFFFF, 137], kind: "failure", exitCode: 0xFFFFFFFF },
])("retains native parent meaning and exact per-pair statuses for $codes", ({ codes, noEvidence, kind, exitCode }) => {
  const { plan, execution, contextId } = fixture();
  codes.forEach((code, index) => execution.acceptOutcome({ contextId, invocationId: plan.invocations[index]!.id,
    outcome: { status: "completed", exitCode: code } }));
  const result = reduceCheckPlanOutcomes(plan, execution.observedOutcomes, noEvidence);
  expect(result.evidence).toMatchObject({ kind, exitCode });
  expect(result.invocations.map(detail => detail.outcome.exitCode)).toEqual(codes);
  expect(result.invocations.map(detail => detail.shard?.index)).toEqual([1, 2]);
});

it("requires successful final closure even after all expected outcomes arrived", () => {
  const { plan, execution, contextId } = fixture();
  for (const invocation of plan.invocations) execution.acceptOutcome({ contextId, invocationId: invocation.id,
    outcome: { status: "completed", exitCode: 0 } });
  expect(reduceCheckPlanOutcomes(plan, execution.observedOutcomes, undefined, ["required output was lost"]).evidence)
    .toMatchObject({ kind: "unavailable", incomplete: ["required output was lost"] });
});
