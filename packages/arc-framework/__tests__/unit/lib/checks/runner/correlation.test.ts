/** Claimed runtime and settlement evidence must cover exactly the fixed plan. */
import { expect, it } from "vitest";
import { indexRunnerPlan, qualifyRunnerRuntime, RunnerExecution, validateRunnerPreparation, validateRunnerRecovery } from "../../../../../src/lib/checks/runner/correlation.js";
import { makeRunnerProtocolPlan, makeRunnerProtocolReady } from "../../../../fixtures/checks/runner-protocol.js";

it("indexes independent invocation and probe IDs without prototype collisions", () => {
  const plan = makeRunnerProtocolPlan();
  const indexed = indexRunnerPlan(plan);
  expect(indexed.planId).toBe(plan.planId);
  expect(indexed.sourceDigest).toBe(plan.source.digest);
  expect([...indexed.invocations]).toEqual(plan.invocations.map(invocation => [invocation.id, invocation]));
  expect([...indexed.probes]).toEqual([...plan.probes.global, ...plan.probes.check].map(probe => [probe.id, probe]));
});

it.each(["invocation", "global probe", "check probe", "cross-list probe"])("refuses duplicate %s IDs", kind => {
  const plan = makeRunnerProtocolPlan();
  if (kind === "invocation") plan.invocations.push(plan.invocations[0]!);
  else if (kind === "global probe") plan.probes.global.push(plan.probes.global[0]!);
  else if (kind === "check probe") plan.probes.check.push(plan.probes.check[0]!);
  else plan.probes.check.push(plan.probes.global[0]!);
  expect(() => indexRunnerPlan(plan)).toThrow(/runner protocol.*duplicate.*retry/iu);
});

it("qualifies every invocation and probe in fixed-plan order without trimming stdout", () => {
  const plan = makeRunnerProtocolPlan();
  const runtime = makeRunnerProtocolReady(plan).runtime;
  if (runtime.kind !== "known") throw new Error("Expected known fixture");
  runtime.bindings.reverse();
  for (const binding of runtime.bindings) binding.probes.reverse();
  const qualified = qualifyRunnerRuntime(indexRunnerPlan(plan), runtime);
  expect(qualified).toBeDefined();
  expect([...qualified!.keys()]).toEqual(plan.invocations.map(invocation => invocation.id));
  for (const binding of qualified!.values()) {
    expect(binding.identity).toBe(`sha256:${"b".repeat(64)}`);
    expect([...binding.probes]).toEqual([...plan.probes.global, ...plan.probes.check].map(probe => [probe.id, ` \n${probe.id}\r\n`]));
  }
});

it("leaves explicitly unknown runtime executable without reusable qualification", () => {
  expect(qualifyRunnerRuntime(indexRunnerPlan(makeRunnerProtocolPlan()), { kind: "unknown", reason: "fingerprint unavailable" }))
    .toBeUndefined();
});

it.each(["missing invocation", "duplicate invocation", "unexpected invocation", "missing probe", "duplicate probe", "unexpected probe"])(
  "refuses claimed-known %s coverage", kind => {
    const plan = makeRunnerProtocolPlan();
    const runtime = makeRunnerProtocolReady(plan).runtime;
    if (runtime.kind !== "known") throw new Error("Expected known fixture");
    if (kind === "missing invocation") runtime.bindings.pop();
    else if (kind === "duplicate invocation") runtime.bindings.push(runtime.bindings[0]!);
    else if (kind === "unexpected invocation") runtime.bindings[0]!.invocationId = "unexpected";
    else if (kind === "missing probe") runtime.bindings[0]!.probes.pop();
    else if (kind === "duplicate probe") runtime.bindings[0]!.probes.push(runtime.bindings[0]!.probes[0]!);
    else runtime.bindings[0]!.probes[0]!.id = "unexpected";
    expect(() => qualifyRunnerRuntime(indexRunnerPlan(plan), runtime)).toThrow(/runner protocol.*coverage.*retry/iu);
  },
);

it.each(["known", "unknown"])("accepts matching recovery/source evidence with %s runtime", kind => {
  const plan = makeRunnerProtocolPlan();
  const ready = makeRunnerProtocolReady(plan);
  if (kind === "unknown") ready.runtime = { kind: "unknown", reason: "fingerprint unavailable" };
  const context = validateRunnerPreparation(indexRunnerPlan(plan), ready, { planId: plan.planId, instructions: "inspect and settle" });
  expect(context?.contextId).toBe(ready.contextId);
  expect(context?.supportsRunGroup).toBe(true);
  expect(context?.runtime === undefined).toBe(kind === "unknown");
  if (kind === "known") expect(context?.runtime?.size).toBe(plan.invocations.length);
});

it("accepts a settled unavailable preparation without recovery or a context", () => {
  const plan = makeRunnerProtocolPlan();
  expect(validateRunnerPreparation(indexRunnerPlan(plan), { status: "unavailable", planId: plan.planId,
    reason: "busy", remedy: "retry when available", settled: true })).toBeUndefined();
});

it.each(["missing recovery", "wrong recovery", "wrong ready attempt", "wrong source", "wrong unavailable attempt"])(
  "refuses %s before accepting preparation", kind => {
    const plan = makeRunnerProtocolPlan();
    const ready = makeRunnerProtocolReady(plan);
    const other = "00000000-0000-4000-8000-000000000002";
    const recovery = kind === "missing recovery" ? undefined : { planId: kind === "wrong recovery" ? other : plan.planId,
      instructions: "inspect and settle" };
    if (kind === "wrong ready attempt") ready.planId = other;
    if (kind === "wrong source") ready.sourceDigest = `sha256:${"c".repeat(64)}`;
    const result = kind === "wrong unavailable attempt" ? { status: "unavailable" as const, planId: other,
      reason: "busy", remedy: "retry", settled: true as const } : ready;
    expect(() => validateRunnerPreparation(indexRunnerPlan(plan), result, recovery)).toThrow(/runner protocol.*retry/iu);
  },
);

it("refuses recovery guidance for another attempt before readiness", () => {
  const indexed = indexRunnerPlan(makeRunnerProtocolPlan());
  expect(() => validateRunnerRecovery(indexed, { planId: "00000000-0000-4000-8000-000000000002", instructions: "inspect and settle" }))
    .toThrow(/runner protocol.*attempt.*retry/iu);
});

function preparedContext(unknown = false) {
  const plan = makeRunnerProtocolPlan();
  const ready = makeRunnerProtocolReady(plan);
  if (unknown) ready.runtime = { kind: "unknown", reason: "fingerprint unavailable" };
  const context = validateRunnerPreparation(indexRunnerPlan(plan), ready, { planId: plan.planId, instructions: "inspect and settle" });
  if (context === undefined) throw new Error("Expected prepared fixture context");
  return context;
}

it.each(["single", "group", "unknown"])("settles complete %s execution outcomes in request order", kind => {
  const context = preparedContext(kind === "unknown");
  const ids = [...context.plan.invocations.keys()].slice(0, kind === "group" ? 2 : 1);
  const request = kind === "group" ? { contextId: context.contextId, invocationIds: ids }
    : { contextId: context.contextId, invocationId: ids[0]! };
  const execution = new RunnerExecution(context, request);
  const outcomes = ids.map((id, index) => ({ contextId: context.contextId, invocationId: id,
    outcome: { status: "completed" as const, exitCode: index === 0 ? 0 : 0xFFFFFFFF } }));
  for (const outcome of [...outcomes].reverse()) execution.acceptOutcome(outcome);
  execution.acceptOutput({ contextId: context.contextId, invocationId: ids[0]!, stream: "stdout", dataBase64: "AA==" });
  const settled = execution.settle({ contextId: context.contextId, settled: true, outputComplete: true, invocationIds: [...ids].reverse() });
  expect([...settled]).toEqual(outcomes.map(outcome => [outcome.invocationId, outcome.outcome]));
});

function singleExecution() {
  const context = preparedContext();
  const id = [...context.plan.invocations.keys()][0]!;
  const execution = new RunnerExecution(context, { contextId: context.contextId, invocationId: id });
  const outcome = { contextId: context.contextId, invocationId: id, outcome: { status: "completed" as const, exitCode: 0 } };
  const settled = { contextId: context.contextId, settled: true as const, outputComplete: true as const, invocationIds: [id] };
  return { context, id, execution, outcome, settled };
}

it.each(["wrong context", "unplanned ID", "duplicate IDs", "unsupported group"])("refuses execution request %s", kind => {
  const context = preparedContext();
  const id = [...context.plan.invocations.keys()][0]!;
  const request = kind === "duplicate IDs" || kind === "unsupported group" ? { contextId: context.contextId,
    invocationIds: kind === "duplicate IDs" ? [id, id] : [id] }
    : { contextId: kind === "wrong context" ? "other-context" : context.contextId,
      invocationId: kind === "unplanned ID" ? "unplanned" : id };
  expect(() => new RunnerExecution(kind === "unsupported group" ? { ...context, supportsRunGroup: false } : context, request))
    .toThrow(/runner protocol.*retry/iu);
});

it.each(["output context", "output invocation", "outcome context", "outcome invocation"])("refuses mismatched %s", kind => {
  const { context, id, execution } = singleExecution();
  const identity = { contextId: kind.endsWith("context") ? "other-context" : context.contextId,
    invocationId: kind.endsWith("invocation") ? "constructor" : id };
  expect(() => {
    if (kind.startsWith("output")) execution.acceptOutput({ ...identity, stream: "stdout", dataBase64: "" });
    else execution.acceptOutcome({ ...identity, outcome: { status: "completed", exitCode: 0 } });
  }).toThrow(/runner protocol.*retry/iu);
  expect(execution.observedOutcomes.size).toBe(0);
});

it.each(["identical", "conflicting"])("refuses a second %s terminal outcome", kind => {
  const { execution, outcome, id } = singleExecution();
  execution.acceptOutcome(outcome);
  expect(() => execution.acceptOutcome({ ...outcome, outcome: { status: "completed", exitCode: kind === "identical" ? 0 : 17 } }))
    .toThrow(/runner protocol.*terminal.*retry/iu);
  expect(execution.observedOutcomes.get(id)).toEqual({ status: "completed", exitCode: 0 });
});

it("retains terminal data independently of caller mutation", () => {
  const { execution, outcome, id } = singleExecution();
  execution.acceptOutcome(outcome);
  outcome.outcome.exitCode = 17;
  const observed = execution.observedOutcomes;
  expect(observed.get(id)).toEqual({ status: "completed", exitCode: 0 });
  expect(Object.isFrozen(observed.get(id))).toBe(true);
});

it.each(["wrong context", "missing ID", "unexpected ID", "duplicate ID", "missing outcome"])("refuses settlement with %s", kind => {
  const { execution, outcome, settled, id } = singleExecution();
  if (kind !== "missing outcome") execution.acceptOutcome(outcome);
  const result = { ...settled, contextId: kind === "wrong context" ? "other-context" : settled.contextId,
    invocationIds: kind === "missing ID" ? [] : kind === "unexpected ID" ? ["constructor"] : kind === "duplicate ID" ? [id, id] : [id] };
  expect(() => execution.settle(result)).toThrow(/runner protocol.*retry/iu);
});

it("retains observed failure details when another requested outcome is missing", () => {
  const context = preparedContext();
  const ids = [...context.plan.invocations.keys()];
  const execution = new RunnerExecution(context, { contextId: context.contextId, invocationIds: ids });
  execution.acceptOutcome({ contextId: context.contextId, invocationId: ids[0]!, outcome: { status: "completed", exitCode: 23 } });
  expect(() => execution.settle({ contextId: context.contextId, settled: true, outputComplete: true, invocationIds: ids }))
    .toThrow(/runner protocol.*outcome.*retry/iu);
  expect([...execution.observedOutcomes]).toEqual([[ids[0], { status: "completed", exitCode: 23 }]]);
});

it.each(["output", "outcome", "reply"])("refuses late %s after execution settlement", kind => {
  const { execution, outcome, settled, context, id } = singleExecution();
  execution.acceptOutcome(outcome);
  execution.settle(settled);
  expect(() => {
    if (kind === "output") execution.acceptOutput({ contextId: context.contextId, invocationId: id, stream: "stderr", dataBase64: "" });
    else if (kind === "outcome") execution.acceptOutcome(outcome);
    else execution.settle(settled);
  }).toThrow(/runner protocol.*settle.*retry/iu);
});

it("cannot settle successfully after a prior protocol fault", () => {
  const { execution, outcome, settled, id } = singleExecution();
  execution.acceptOutcome(outcome);
  expect(() => execution.acceptOutput({ contextId: "other-context", invocationId: id, stream: "stdout", dataBase64: "" }))
    .toThrow(/runner protocol/iu);
  expect(() => execution.settle(settled)).toThrow(/runner protocol.*failed.*retry/iu);
  expect(execution.observedOutcomes.get(id)).toEqual({ status: "completed", exitCode: 0 });
});
