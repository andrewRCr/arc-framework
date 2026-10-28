/** Plan-scoped request ordering and retained authoritative evidence. */
import { expect, it } from "vitest";
import { makeRunnerProtocolPlan, makeRunnerProtocolReady } from "../../../../fixtures/checks/runner-protocol.js";
import { runnerStreamHarness, reply, recovery, prepare, completeRun } from "../../../../fixtures/checks/runner-streams.js";
import type { CheckRunnerOperation } from "../../../../../src/lib/checks/runner/session.js";

function outcome(h: ReturnType<typeof runnerStreamHarness>, invocationId: string, exitCode = 0): void {
  h.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method: "check/outcome", params: {
    contextId: "context", invocationId, outcome: { status: "completed", exitCode } } })}\n`);
}

it("requires retained matching recovery before accepting ready", async () => {
  const h = runnerStreamHarness();
  const plan = makeRunnerProtocolPlan();
  const pending = h.session.request({ method: "check/prepare", params: plan });
  reply(h, makeRunnerProtocolReady(plan));
  await expect(pending).rejects.toThrow(/recovery/iu);
  await h.close();
});

it("retains exact actionable guidance independently of diagnostic display", async () => {
  const h = runnerStreamHarness();
  await prepare(h);
  expect(h.session.recovery).toEqual({ planId: makeRunnerProtocolPlan().planId,
    instructions: "Inspect and settle this attempt with adapter inspect." });
  await h.close();
});

it("rejects recovery from another attempt even before a ready reply", async () => {
  const h = runnerStreamHarness();
  const plan = makeRunnerProtocolPlan();
  const pending = h.session.request({ method: "check/prepare", params: plan });
  h.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method: "check/recovery", params: {
    planId: "00000000-0000-4000-8000-000000000002", instructions: "adapter inspect --plan other" } })}\n`);
  reply(h, makeRunnerProtocolReady(plan));
  await expect(pending).rejects.toThrow(/another attempt/iu);
  await h.close();
});

it("allows only preparation as the first operation, then permits a valid preparation", async () => {
  const h = runnerStreamHarness();
  const rejected = h.session.request({ method: "check/run", params: { contextId: "context", invocationId: "__proto__" } });
  const refusal = expect(rejected).rejects.toThrow(/prepar/iu);
  await prepare(h);
  await h.close();
  await refusal;
});

it("refuses execution during preparation without disturbing preparation", async () => {
  const h = runnerStreamHarness();
  const plan = makeRunnerProtocolPlan();
  const preparing = h.session.request({ method: "check/prepare", params: plan });
  const prepareId = h.requests.at(-1)!.id;
  const premature = h.session.request({ method: "check/run", params: { contextId: "context", invocationId: "__proto__" } });
  const refusal = expect(premature).rejects.toThrow(/ready/iu);
  recovery(h);
  reply(h, makeRunnerProtocolReady(plan), prepareId);
  await preparing;
  await h.close();
  await refusal;
});

it("permits one execution request at a time without replacing its result", async () => {
  const h = runnerStreamHarness();
  await prepare(h);
  const first = h.session.request({ method: "check/run", params: { contextId: "context", invocationId: "__proto__" } });
  const firstId = h.requests.at(-1)!.id;
  const overlapping = h.session.request({ method: "check/run", params: { contextId: "context", invocationId: "constructor" } });
  const refusal = expect(overlapping).rejects.toThrow(/outstanding/iu);
  outcome(h, "__proto__");
  reply(h, { contextId: "context", settled: true, outputComplete: true, invocationIds: ["__proto__"] }, firstId);
  await first;
  await h.close();
  await refusal;
});

it("declines an unadvertised group while keeping mandatory single execution available", async () => {
  const h = runnerStreamHarness();
  const plan = makeRunnerProtocolPlan();
  const preparing = h.session.request({ method: "check/prepare", params: plan });
  recovery(h);
  reply(h, { ...makeRunnerProtocolReady(plan), capabilities: { runGroup: false } });
  await preparing;
  const group = h.session.request({ method: "check/runGroup", params: { contextId: "context", invocationIds: ["__proto__"] } });
  const refusal = expect(group).rejects.toThrow(/^Check execution request group execution was not advertised; correct the request/u);
  const single = h.session.request({ method: "check/run", params: { contextId: "context", invocationId: "__proto__" } });
  completeRun(h);
  await single;
  await h.close();
  await refusal;
});

it.each<{ name: string; operation: CheckRunnerOperation }>([
  { name: "duplicate group IDs", operation: { method: "check/runGroup", params: { contextId: "context", invocationIds: ["__proto__", "__proto__"] } } },
  { name: "an empty invocation ID", operation: { method: "check/run", params: { contextId: "context", invocationId: "" } } },
])("attributes $name to the caller and still settles a corrected request", async ({ operation }) => {
  const h = runnerStreamHarness();
  await prepare(h);
  await expect(h.session.request(operation)).rejects.toThrow(/^Check execution request operation is invalid; correct the request/u);
  const corrected = h.session.request({ method: "check/run", params: { contextId: "context", invocationId: "__proto__" } });
  completeRun(h);
  await expect(corrected).resolves.toMatchObject({ settled: true, invocationIds: ["__proto__"] });
  await h.close();
});

it("attributes closing with outstanding work to the caller and closes once it settles", async () => {
  const h = runnerStreamHarness();
  await prepare(h);
  const running = h.session.request({ method: "check/run", params: { contextId: "context", invocationId: "__proto__" } });
  await expect(h.session.close()).rejects.toThrow(/^Check execution request cannot close while work is outstanding;.*correct the request/u);
  completeRun(h);
  await running;
  await h.close();
});

it.each(["unknown", "constructor"])("rejects unplanned or wrong-context execution for %s", async id => {
  const h = runnerStreamHarness();
  await prepare(h);
  const pending = h.session.request({ method: "check/run", params: { contextId: id === "unknown" ? "context" : "other", invocationId: id } });
  const refusal = expect(pending).rejects.toThrow(/^Check execution request .*(unplanned|another context).*; correct the request/u);
  await h.close();
  await refusal;
});

it("runs each planned ID at most once across singles and groups", async () => {
  const h = runnerStreamHarness();
  await prepare(h);
  const first = h.session.request({ method: "check/run", params: { contextId: "context", invocationId: "__proto__" } });
  completeRun(h);
  await first;
  const replay = h.session.request({ method: "check/runGroup", params: { contextId: "context", invocationIds: ["__proto__", "constructor"] } });
  const refusal = expect(replay).rejects.toThrow(/already.*(?:requested|execut)/iu);
  await h.close();
  await refusal;
});

it("retains immutable terminal evidence separately from a later protocol failure", async () => {
  const h = runnerStreamHarness();
  await prepare(h);
  const pending = h.session.request({ method: "check/runGroup", params: { contextId: "context", invocationIds: ["__proto__", "constructor"] } });
  const failure = expect(pending).rejects.toThrow(/runner/iu);
  outcome(h, "__proto__", 7);
  h.stdout.write("broken protocol\n");
  await failure;
  expect(h.session.observedOutcomes).toEqual(new Map([["__proto__", { status: "completed", exitCode: 7 }]]));
  const observed = h.session.observedOutcomes.get("__proto__")!;
  expect(Object.isFrozen(observed)).toBe(true);
  expect(() => { Object.assign(observed, { exitCode: 0 }); }).toThrow();
  await h.close();
});

it.each([
  { planId: "00000000-0000-4000-8000-000000000002", contextId: "context" },
  { planId: makeRunnerProtocolPlan().planId, contextId: "other" },
])("rejects cancellation coordinates from another attempt or context: $contextId", async params => {
  const h = runnerStreamHarness();
  await prepare(h);
  const pending = h.session.request({ method: "check/cancel", params });
  const refusal = expect(pending).rejects.toThrow(/another attempt|another context/iu);
  await h.close();
  await refusal;
});

it("rejects conflicting recovery and retains the original received guidance", async () => {
  const h = runnerStreamHarness();
  const plan = makeRunnerProtocolPlan();
  const pending = h.session.request({ method: "check/prepare", params: plan });
  recovery(h);
  h.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method: "check/recovery", params: {
    planId: plan.planId, instructions: "Replace the original recovery instructions." } })}\n`);
  reply(h, makeRunnerProtocolReady(plan));
  await expect(pending).rejects.toThrow(/duplicate recovery/iu);
  expect(h.session.recovery?.instructions).toBe("Inspect and settle this attempt with adapter inspect.");
  await h.close();
});

it.each(["preparation", "execution"] as const)("allows cancellation during %s without replacing its settlement", async phase => {
  const h = runnerStreamHarness();
  const plan = makeRunnerProtocolPlan();
  let work: Promise<unknown>;
  if (phase === "preparation") work = h.session.request({ method: "check/prepare", params: plan });
  else {
    await prepare(h);
    work = h.session.request({ method: "check/run", params: { contextId: "context", invocationId: "__proto__" } });
  }
  const workId = h.requests.at(-1)!.id;
  let settled = false;
  const observed = work.then(value => { settled = true; return { value }; }, (error: unknown) => ({ error }));
  const acknowledgement = h.session.request({ method: "check/cancel", params: { planId: plan.planId,
    ...(phase === "execution" ? { contextId: "context" } : {}) } });
  const cancel = h.requests.find(request => request.method === "check/cancel");
  if (cancel !== undefined) reply(h, { planId: plan.planId, accepted: true }, cancel.id);
  try {
    await expect(acknowledgement).resolves.toEqual({ planId: plan.planId, accepted: true });
    expect(settled).toBe(false);
  } finally {
    if (phase === "preparation") { recovery(h); reply(h, makeRunnerProtocolReady(plan), workId); }
    else { outcome(h, "__proto__", 9); reply(h, { contextId: "context", settled: true, outputComplete: true, invocationIds: ["__proto__"] }, workId); }
    const result = await observed;
    await h.close();
    expect(result).toHaveProperty("value");
  }
});
