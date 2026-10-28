/** Disposal evidence requires the applicable terminal reply and fully observed process closure. */
import { expect, it } from "vitest";
import { runnerStreamHarness, prepare, reply, completeRun } from "../../../../fixtures/checks/runner-streams.js";
import { makeRunnerProtocolPlan } from "../../../../fixtures/checks/runner-protocol.js";

it("releases a ready context and requires drained exit zero before normal closure", async () => {
  const h = runnerStreamHarness();
  await prepare(h);
  h.stdin.on("data", (bytes: Buffer) => {
    const request = JSON.parse(bytes.toString("utf8")) as { method: string; id: string };
    if (request.method === "check/release") reply(h, { contextId: "context", released: true }, request.id);
  });
  let closed = false;
  const pending = h.session.close().then(result => { closed = true; return result; });
  await new Promise<void>(resolve => { setImmediate(resolve); });
  expect(closed).toBe(false);
  expect(h.stdin.writableEnded).toBe(true);
  await h.close();
  await expect(pending).resolves.toEqual({ status: "closed", exit: { started: true, exitCode: 0 } });
});

it("keeps a closing-stdin error outside authority after terminal preparation settlement", async () => {
  const h = runnerStreamHarness();
  const plan = makeRunnerProtocolPlan();
  const preparing = h.session.request({ method: "check/prepare", params: plan });
  reply(h, { status: "unavailable", planId: plan.planId, settled: true,
    reason: "Preparation cancelled and settled", remedy: "Retry with a fresh attempt." });
  await preparing;
  const pending = h.session.close();
  h.stdin.emit("error", new Error("input pipe already closed"));
  await h.close();
  await expect(pending).resolves.toMatchObject({ status: "closed" });
});

it.each([false, true])("closes terminal preparation with optional late cancel acknowledgement: %s", async late => {
  const h = runnerStreamHarness();
  const plan = makeRunnerProtocolPlan();
  const preparing = h.session.request({ method: "check/prepare", params: plan });
  const prepareId = h.requests.at(-1)!.id;
  const cancelling = h.session.request({ method: "check/cancel", params: { planId: plan.planId } });
  const cancelled = cancelling.then(value => ({ value }), (error: unknown) => ({ error }));
  const cancelId = h.requests.at(-1)!.id;
  reply(h, { status: "unavailable", planId: plan.planId, settled: true,
    reason: "Preparation cancelled and settled", remedy: "Retry with a fresh attempt." }, prepareId);
  await preparing;
  const pending = h.session.close().then(value => ({ value }), (error: unknown) => ({ error }));
  if (late) reply(h, { planId: plan.planId, accepted: true }, cancelId);
  await h.close();
  expect(await pending).toEqual({ value: { status: "closed", exit: { started: true, exitCode: 0 } } });
  if (late) expect(await cancelled).toEqual({ value: { planId: plan.planId, accepted: true } });
  else expect(await cancelled).toHaveProperty("error");
});

it("keeps settled cleanup warnings advisory", async () => {
  const h = runnerStreamHarness();
  await prepare(h);
  h.stdin.on("data", (bytes: Buffer) => {
    const request = JSON.parse(bytes.toString("utf8")) as { method: string; id: string };
    if (request.method === "check/release") reply(h, { contextId: "context", released: true, cleanupWarning: "Remove the settled scratch directory manually." }, request.id);
  });
  const pending = h.session.close();
  await h.close();
  await expect(pending).resolves.toEqual({ status: "closed", exit: { started: true, exitCode: 0 },
    cleanupWarning: "Remove the settled scratch directory manually." });
});

it.each([
  { release: false, exit: { started: true, exitCode: 0 } },
  { release: true, exit: { started: true, exitCode: 1 } },
  { release: true, exit: { started: true, signal: "SIGTERM" as const } },
])("keeps missing release or abnormal process closure uncertain: $release/$exit", async ({ release, exit }) => {
  const h = runnerStreamHarness();
  await prepare(h);
  h.stdin.on("data", (bytes: Buffer) => {
    const request = JSON.parse(bytes.toString("utf8")) as { method: string; id: string };
    if (release && request.method === "check/release") reply(h, { contextId: "context", released: true }, request.id);
  });
  const pending = h.session.close();
  await h.close(exit);
  await expect(pending).resolves.toMatchObject({ status: "uncertain", exit, reason: expect.stringMatching(/inspect.*settle/iu) });
});

it("refuses premature close and permits closure after the same work settles", async () => {
  const h = runnerStreamHarness();
  await prepare(h);
  const running = h.session.request({ method: "check/run", params: { contextId: "context", invocationId: "__proto__" } });
  const rejected = h.session.close();
  const refusal = expect(rejected).rejects.toThrow(/outstanding.*settlement/iu);
  completeRun(h);
  await running;
  h.stdin.on("data", (bytes: Buffer) => {
    const request = JSON.parse(bytes.toString("utf8")) as { method: string; id: string };
    if (request.method === "check/release") reply(h, { contextId: "context", released: true }, request.id);
  });
  const pending = h.session.close();
  await h.close();
  await refusal;
  await expect(pending).resolves.toMatchObject({ status: "closed" });
});

it("closes settled unavailable preparation without requesting context release", async () => {
  const h = runnerStreamHarness();
  const plan = makeRunnerProtocolPlan();
  const preparing = h.session.request({ method: "check/prepare", params: plan });
  reply(h, { status: "unavailable", planId: plan.planId, settled: true,
    reason: "No compatible placement", remedy: "Repair adapter placement and retry." });
  await preparing;
  h.stdin.on("data", () => { h.stdout.write("release is invalid without a context\n"); });
  const pending = h.session.close();
  await h.close();
  await expect(pending).resolves.toEqual({ status: "closed", exit: { started: true, exitCode: 0 } });
  expect(h.stdin.writableEnded).toBe(true);
  expect(h.session.failure).toBeUndefined();
});

it("keeps malformed late cancellation acknowledgement uncertain", async () => {
  const h = runnerStreamHarness();
  const plan = makeRunnerProtocolPlan();
  const preparing = h.session.request({ method: "check/prepare", params: plan });
  const prepareId = h.requests.at(-1)!.id;
  const cancelling = h.session.request({ method: "check/cancel", params: { planId: plan.planId } });
  const refused = expect(cancelling).rejects.toThrow(/another attempt/iu);
  const cancelId = h.requests.at(-1)!.id;
  reply(h, { status: "unavailable", planId: plan.planId, settled: true,
    reason: "Preparation cancelled and settled", remedy: "Retry with a fresh attempt." }, prepareId);
  await preparing;
  const pending = h.session.close();
  reply(h, { planId: "00000000-0000-4000-8000-000000000002", accepted: true }, cancelId);
  await h.close();
  await refused;
  await expect(pending).resolves.toMatchObject({ status: "uncertain" });
});

it.each([false, true])("distinguishes never-started from disappeared preparation: started=%s", async started => {
  const h = runnerStreamHarness();
  const preparing = h.session.request({ method: "check/prepare", params: makeRunnerProtocolPlan() });
  const refused = expect(preparing).rejects.toThrow(/closed/iu);
  await h.close({ started, ...(started ? { exitCode: 0 } : {}) });
  await refused;
  await expect(h.session.close()).resolves.toMatchObject({ status: started ? "uncertain" : "unavailable" });
});
