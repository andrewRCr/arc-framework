/** Stream-boundary tests for runner framing and request correlation. */
import { describe, expect, it } from "vitest";
import { makeRunnerProtocolPlan, makeRunnerProtocolReady } from "../../../../fixtures/checks/runner-protocol.js";
import { runnerStreamHarness, reply, recovery, prepare, completeRun } from "../../../../fixtures/checks/runner-streams.js";

describe("runner session byte framing", () => {
  it("preserves split UTF-8, escaped newlines and coalesced frames before a correlated reply", async () => {
    const h = runnerStreamHarness();
    const plan = makeRunnerProtocolPlan();
    const pending = h.session.request({ method: "check/prepare", params: plan });
    const recovery = { jsonrpc: "2.0", method: "check/recovery", params: { planId: plan.planId, instructions: "inspect ☃\nsettle 😀" } };
    const ready = makeRunnerProtocolReady(plan);
    const frame = Buffer.from(`${JSON.stringify(recovery)}\n${JSON.stringify({ jsonrpc: "2.0", id: h.requests[0]?.id, result: ready })}\n`);
    const split = frame.indexOf(Buffer.from("☃")) + 1;
    h.stdout.write(frame.subarray(0, split));
    h.stdout.write(frame.subarray(split, split + 1));
    h.stdout.write(frame.subarray(split + 1));
    await expect(pending).resolves.toEqual(ready);
    expect(h.notifications).toEqual([recovery]);
    await h.close();
    expect(h.session.failure).toBeUndefined();
  });

  it.each([
    ["console contamination", "installing dependencies\n"],
    ["batch envelopes", "[]\n"],
    ["unknown reply identity", '{"jsonrpc":"2.0","id":"other","result":{}}\n'],
    ["adapter requests", '{"jsonrpc":"2.0","id":"other","method":"check/release","params":{"contextId":"context"}}\n'],
    ["conflicting result/error", '{"jsonrpc":"2.0","id":"other","result":{},"error":{"code":1,"message":"bad"}}\n'],
    ["unknown notifications", '{"jsonrpc":"2.0","method":"other","params":{}}\n'],
    ["blank frames", "\n"],
  ])("rejects %s without exposing wire payloads", async (_name, line) => {
    const h = runnerStreamHarness();
    const pending = h.session.request({ method: "check/prepare", params: makeRunnerProtocolPlan() });
    h.stdout.write(line);
    await expect(pending).rejects.toThrow(/runner.*retry/iu);
    await h.close();
    expect(h.session.failure?.message).not.toContain(line.trim() || '"jsonrpc"');
  });

  it("rejects malformed UTF-8 rather than accepting replacement characters", async () => {
    const h = runnerStreamHarness();
    const pending = h.session.request({ method: "check/prepare", params: makeRunnerProtocolPlan() });
    h.stdout.write(Buffer.from([0xC3, 0x28, 0x0A]));
    await expect(pending).rejects.toThrow(/runner.*retry/iu);
    await h.close();
  });

  it("requires the final frame delimiter and complete UTF-8 at EOF", async () => {
    const h = runnerStreamHarness();
    const plan = makeRunnerProtocolPlan();
    const pending = h.session.request({ method: "check/prepare", params: plan });
    h.stdout.end(JSON.stringify({ jsonrpc: "2.0", id: h.requests[0]?.id, result: makeRunnerProtocolReady(plan) }));
    await expect(pending).rejects.toThrow(/runner.*retry/iu);
    await h.close();
  });

  it("rejects a second reply for an already answered request", async () => {
    const h = runnerStreamHarness();
    await prepare(h);
    reply(h, makeRunnerProtocolReady(makeRunnerProtocolPlan()));
    await h.close();
    expect(h.session.failure).toBeInstanceOf(Error);
    await expect(h.session.request({ method: "check/release", params: { contextId: "context" } })).rejects.toThrow(/runner/iu);
  });

  it("accepts CRLF delimiters without changing escaped payload carriage returns", async () => {
    const h = runnerStreamHarness();
    const plan = makeRunnerProtocolPlan();
    const pending = h.session.request({ method: "check/prepare", params: plan });
    const recovery = { jsonrpc: "2.0", method: "check/recovery", params: { planId: plan.planId, instructions: "inspect\r\nsettle" } };
    h.stdout.write(`${JSON.stringify(recovery)}\r`);
    h.stdout.write(`\n${JSON.stringify({ jsonrpc: "2.0", id: h.requests[0]?.id, result: makeRunnerProtocolReady(plan) })}\r\n`);
    await expect(pending).resolves.toEqual(makeRunnerProtocolReady(plan));
    expect(h.notifications).toEqual([recovery]);
    await h.close();
  });

  it.each(["stdin", "stdout"] as const)("rejects required %s I/O failure even when a valid reply follows", async stream => {
    const h = runnerStreamHarness();
    const plan = makeRunnerProtocolPlan();
    const pending = h.session.request({ method: "check/prepare", params: plan });
    recovery(h);
    h[stream].emit("error", new Error("private pipe fault"));
    reply(h, makeRunnerProtocolReady(plan));
    await expect(pending).rejects.toThrow(/runner.*(?:deliver|collect).*retry/iu);
    await h.close();
    expect(h.session.failure?.message).not.toContain("private pipe fault");
  });

  it("validates the result against the matched operation", async () => {
    const h = runnerStreamHarness();
    const pending = h.session.request({ method: "check/prepare", params: makeRunnerProtocolPlan() });
    reply(h, { planId: makeRunnerProtocolPlan().planId, accepted: true });
    await expect(pending).rejects.toThrow(/operation/iu);
    await h.close();
  });

  it("fails matched RPC errors while redacting provider error text", async () => {
    const h = runnerStreamHarness();
    const pending = h.session.request({ method: "check/prepare", params: makeRunnerProtocolPlan() });
    h.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: h.requests[0]?.id, error: { code: -32603, message: "private token" } })}\n`);
    await expect(pending).rejects.toThrow(/-32603/u);
    await h.close();
    expect(h.session.failure?.message).not.toContain("private token");
  });

  it("delivers exact binary chunks in order and awaits required delivery before settlement", async () => {
    const chunks: Buffer[] = [];
    let allowDelivery!: () => void;
    const blocked = new Promise<void>(resolve => { allowDelivery = resolve; });
    const h = runnerStreamHarness(async notification => {
      if (notification.method !== "check/output") return;
      await blocked;
      chunks.push(Buffer.from(notification.params.dataBase64, "base64"));
    });
    await prepare(h);
    let settled = false;
    const pending = h.session.request({ method: "check/run", params: { contextId: "context", invocationId: "__proto__" } });
    void pending.then(() => { settled = true; });
    for (const bytes of [Buffer.from([0, 255, 0xC3]), Buffer.from([0x28, 13, 10])]) {
      h.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method: "check/output", params: {
        contextId: "context", invocationId: "__proto__", stream: "stdout", dataBase64: bytes.toString("base64") } })}\n`);
    }
    completeRun(h);
    await new Promise<void>(resolve => { setImmediate(resolve); });
    expect(settled).toBe(false);
    expect(chunks).toEqual([]);
    allowDelivery();
    await pending;
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([0, 255, 0xC3, 0x28, 13, 10]));
    await h.close();
  });

  it("cannot accept outputComplete after required delivery fails", async () => {
    const h = runnerStreamHarness(notification => { if (notification.method === "check/output") throw new Error("private sink failure"); });
    await prepare(h);
    const pending = h.session.request({ method: "check/run", params: { contextId: "context", invocationId: "__proto__" } });
    h.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method: "check/output", params: {
      contextId: "context", invocationId: "__proto__", stream: "stderr", dataBase64: "AA==" } })}\n`);
    completeRun(h);
    await expect(pending).rejects.toThrow(/delivery/iu);
    await h.close();
    expect(h.session.failure?.message).not.toContain("private sink failure");
  });

  it("keeps adapter stderr and failed diagnostic display outside protocol authority", async () => {
    const diagnostics: Buffer[] = [];
    const h = runnerStreamHarness(undefined, async bytes => { diagnostics.push(Buffer.from(bytes)); throw new Error("display unavailable"); });
    h.stderr.write(Buffer.from([0, 255, 10]));
    h.stderr.emit("error", new Error("diagnostic read unavailable"));
    await prepare(h);
    await h.close();
    expect(Buffer.concat(diagnostics)).toEqual(Buffer.from([0, 255, 10]));
    expect(h.session.failure).toBeUndefined();
  });
});
