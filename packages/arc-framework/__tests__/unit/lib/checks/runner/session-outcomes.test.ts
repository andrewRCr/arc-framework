/** Required output and immutable terminal coverage across incomplete conversations. */
import { expect, it } from "vitest";
import { runnerStreamHarness, prepare, reply } from "../../../../fixtures/checks/runner-streams.js";

function terminal(h: ReturnType<typeof runnerStreamHarness>, id: string, exitCode: number): void {
  h.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method: "check/outcome", params: {
    contextId: "context", invocationId: id, outcome: { status: "completed", exitCode } } })}\n`);
}

function settlement(h: ReturnType<typeof runnerStreamHarness>, extra: Record<string, unknown> = {}): void {
  reply(h, { contextId: "context", settled: true, outputComplete: true, invocationIds: ["__proto__", "constructor"], ...extra });
}

it("retains observed failures when the protocol stream closes before EOF", async () => {
  const h = runnerStreamHarness();
  await prepare(h);
  const pending = h.session.request({ method: "check/runGroup", params: { contextId: "context", invocationIds: ["__proto__", "constructor"] } });
  const failed = expect(pending).rejects.toThrow(/runner/iu);
  terminal(h, "__proto__", 256);
  await new Promise<void>(resolve => { setImmediate(resolve); });
  h.stdout.destroy();
  await h.close();
  await failed;
  expect(h.session.observedOutcomes.get("__proto__")).toEqual({ status: "completed", exitCode: 256 });
  expect(h.session.failure?.message).toMatch(/output|protocol/iu);
});

it("requires every requested terminal outcome before accepting settlement", async () => {
  const h = runnerStreamHarness();
  await prepare(h);
  const pending = h.session.request({ method: "check/runGroup", params: { contextId: "context", invocationIds: ["__proto__", "constructor"] } });
  terminal(h, "__proto__", 17);
  settlement(h);
  await expect(pending).rejects.toThrow(/missing.*terminal outcomes/iu);
  expect(h.session.observedOutcomes).toEqual(new Map([["__proto__", { status: "completed", exitCode: 17 }]]));
  await h.close();
});

it.each([
  { contextId: "context", invocationId: "__proto__" },
  { contextId: "context", invocationId: "unknown" },
  { contextId: "other", invocationId: "constructor" },
])("rejects conflicting or unexpected terminal identity $contextId/$invocationId without overwriting prior failure", async identity => {
  const h = runnerStreamHarness();
  await prepare(h);
  const pending = h.session.request({ method: "check/runGroup", params: { contextId: "context", invocationIds: ["__proto__", "constructor"] } });
  terminal(h, "__proto__", 23);
  h.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method: "check/outcome", params: {
    ...identity, outcome: { status: "completed", exitCode: 0 } } })}\n`);
  settlement(h);
  await expect(pending).rejects.toThrow(/runner protocol/iu);
  expect(h.session.observedOutcomes).toEqual(new Map([["__proto__", { status: "completed", exitCode: 23 }]]));
  await h.close();
});

it.each([
  { settled: false, outputComplete: true },
  { settled: true, outputComplete: false },
  { settled: true, outputComplete: undefined },
])("refuses incomplete settlement/output claims $settled/$outputComplete while retaining terminal evidence", async claims => {
  const h = runnerStreamHarness();
  await prepare(h);
  const pending = h.session.request({ method: "check/runGroup", params: { contextId: "context", invocationIds: ["__proto__", "constructor"] } });
  terminal(h, "__proto__", 29);
  terminal(h, "constructor", 0);
  settlement(h, claims);
  await expect(pending).rejects.toThrow(/operation/iu);
  expect(h.session.observedOutcomes.size).toBe(2);
  expect(h.session.observedOutcomes.get("__proto__")).toEqual({ status: "completed", exitCode: 29 });
  await h.close();
});

it.each([256, 0x80000000, 0xC0000005, 0xFFFFFFFF])("preserves zero and full-width native completion %i exactly", async exitCode => {
  const h = runnerStreamHarness();
  await prepare(h);
  const pending = h.session.request({ method: "check/runGroup", params: { contextId: "context", invocationIds: ["__proto__", "constructor"] } });
  terminal(h, "constructor", exitCode);
  terminal(h, "__proto__", 0);
  settlement(h);
  await expect(pending).resolves.toEqual({ contextId: "context", settled: true, outputComplete: true, invocationIds: ["__proto__", "constructor"] });
  expect(h.session.observedOutcomes).toEqual(new Map([
    ["constructor", { status: "completed", exitCode }], ["__proto__", { status: "completed", exitCode: 0 }],
  ]));
  await h.close();
});

it("retains an observed failure when subsequent required output delivery fails", async () => {
  const h = runnerStreamHarness(async notification => { if (notification.method === "check/output") throw new Error("private output sink failure"); });
  await prepare(h);
  const pending = h.session.request({ method: "check/run", params: { contextId: "context", invocationId: "__proto__" } });
  terminal(h, "__proto__", 31);
  h.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method: "check/output", params: {
    contextId: "context", invocationId: "__proto__", stream: "stdout", dataBase64: "AP8=" } })}\n`);
  reply(h, { contextId: "context", settled: true, outputComplete: true, invocationIds: ["__proto__"] });
  await expect(pending).rejects.toThrow(/delivery/iu);
  expect(h.session.observedOutcomes.get("__proto__")).toEqual({ status: "completed", exitCode: 31 });
  await h.close();
});
