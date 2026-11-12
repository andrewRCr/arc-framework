/** Operation replies match both RPC identity and the submitted operation contract. */
import { expect, it } from "vitest";
import { decodeRunnerReply } from "../../../../../src/lib/checks/runner/correlation.js";
import { RunnerReplySchema, RunnerRequestSchema } from "../../../../../src/lib/checks/runner/contract.js";
import { makeRunnerProtocolPlan, makeRunnerProtocolReady } from "../../../../fixtures/checks/runner-protocol.js";

function cases() {
  const plan = makeRunnerProtocolPlan();
  const ready = makeRunnerProtocolReady(plan);
  const ids = plan.invocations.map(invocation => invocation.id);
  const entries = [
    { method: "check/prepare", params: plan, result: ready },
    { method: "check/run", params: { contextId: ready.contextId, invocationId: ids[0] },
      result: { contextId: ready.contextId, settled: true, outputComplete: true, invocationIds: [ids[0]] } },
    { method: "check/runGroup", params: { contextId: ready.contextId, invocationIds: ids },
      result: { contextId: ready.contextId, settled: true, outputComplete: true, invocationIds: ids } },
    { method: "check/cancel", params: { planId: plan.planId }, result: { planId: plan.planId, accepted: true } },
    { method: "check/release", params: { contextId: ready.contextId }, result: { contextId: ready.contextId, released: true } },
  ];
  return entries.map(entry => ({ ...entry,
    request: RunnerRequestSchema.parse({ jsonrpc: "2.0", id: "request", method: entry.method, params: entry.params }),
    reply: RunnerReplySchema.parse({ jsonrpc: "2.0", id: "request", result: entry.result }),
  }));
}

it.each(cases())("decodes the matched $method result", ({ request, reply, result }) => {
  expect(decodeRunnerReply(request, reply)).toEqual(result);
});

it.each(cases())("refuses another RPC request ID for $method", ({ request, reply }) => {
  expect(() => decodeRunnerReply(request, { ...reply, id: "another-request" })).toThrow(/runner protocol.*reply.*retry/iu);
});

it.each(cases())("refuses another result shape for $method", ({ request }) => {
  const reply = RunnerReplySchema.parse({ jsonrpc: "2.0", id: request.id, result: { private: "private-result-data" } });
  expect(() => decodeRunnerReply(request, reply)).toThrow(/runner protocol.*result.*retry/iu);
});

it.each(cases())("refuses another attempt or context in $method replies", ({ request, result }) => {
  const other = "planId" in result ? { ...result, planId: "00000000-0000-4000-8000-000000000002" }
    : { ...result, contextId: "another-context" };
  const reply = RunnerReplySchema.parse({ jsonrpc: "2.0", id: request.id, result: other });
  expect(() => decodeRunnerReply(request, reply)).toThrow(/runner protocol.*retry/iu);
});

it.each(cases().filter(entry => entry.method === "check/run" || entry.method === "check/runGroup"))(
  "refuses wrong settled coverage for $method", ({ request, result }) => {
    const reply = RunnerReplySchema.parse({ jsonrpc: "2.0", id: request.id,
      result: { ...result, invocationIds: ["unexpected-invocation"] } });
    expect(() => decodeRunnerReply(request, reply)).toThrow(/runner protocol.*coverage.*retry/iu);
  },
);

it("reports a standard RPC error as a protocol fault without echoing error data", () => {
  const { request } = cases()[0]!;
  const reply = RunnerReplySchema.parse({ jsonrpc: "2.0", id: request.id,
    error: { code: -32602, message: "private-adapter-message", data: { secret: "private-error-data" } } });
  expect(() => decodeRunnerReply(request, reply)).toThrow(/runner protocol.*-32602.*retry/iu);
  try { decodeRunnerReply(request, reply); } catch (error) { expect(String(error)).not.toContain("private"); }
});
