/** RPC records bind operation shapes while keeping stdout protocol-only. */
import { expect, it } from "vitest";
import { RunnerRequestSchema, RunnerReplySchema, RunnerNotificationSchema, parseRunnerMessage } from "../../../../../src/lib/checks/runner/contract.js";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../../../helpers/schema-assertion.js";

const planId = "00000000-0000-4000-8000-000000000001";
const digest = `sha256:${"a".repeat(64)}`;
const plan = { protocolVersion: 1, planId,
  source: { root: "/owned/source", manifest: "/owned/manifest", digest, coordinates: { tree: "1".repeat(40), merged: [] } },
  environment: {}, probes: { global: [], check: [] }, invocations: [{ id: "invocation", argv: ["runner"], cwd: ".", shell: false }] };
const requests = [
  { jsonrpc: "2.0", id: "request:1", method: "check/prepare", params: plan },
  { jsonrpc: "2.0", id: "request:2", method: "check/run", params: { contextId: "context", invocationId: "invocation" } },
  { jsonrpc: "2.0", id: "request:3", method: "check/runGroup", params: { contextId: "context", invocationIds: ["invocation"] } },
  { jsonrpc: "2.0", id: "request:4", method: "check/cancel", params: { planId } },
  { jsonrpc: "2.0", id: "request:5", method: "check/release", params: { contextId: "context" } },
];
const replies = [
  { jsonrpc: "2.0", id: "request:1", result: { status: "unavailable", planId, reason: "busy", remedy: "retry", settled: true } },
  { jsonrpc: "2.0", id: "request:1", error: { code: -32602, message: "Invalid params", data: { field: "protocolVersion" } } },
];
const notifications = [
  { jsonrpc: "2.0", method: "check/recovery", params: { planId, instructions: "Inspect and settle by attempt UUID" } },
  { jsonrpc: "2.0", method: "check/output", params: { contextId: "context", invocationId: "invocation", stream: "stdout", dataBase64: "AA==" } },
  { jsonrpc: "2.0", method: "check/outcome", params: { contextId: "context", invocationId: "invocation", outcome: { status: "completed", exitCode: 0 } } },
];

it.each(requests)("preserves supported request $method", request => {
  expect(assertSchemaAccepts(RunnerRequestSchema, request)).toEqual(request);
});

it.each(replies)("preserves a correlated result or error reply: %#", reply => {
  expect(assertSchemaAccepts(RunnerReplySchema, reply)).toEqual(reply);
});

it.each(notifications)("preserves notification $method without an RPC ID", notification => {
  expect(assertSchemaAccepts(RunnerNotificationSchema, notification)).toEqual(notification);
});

it.each([...requests, ...replies, ...notifications])("decodes exactly one JSON-RPC line: %#", message => {
  expect(parseRunnerMessage(JSON.stringify(message))).toEqual(message);
});

it.each([
  { ...requests[1], jsonrpc: "1.0" }, { ...requests[1], id: 1 }, { ...requests[1], id: "" },
  { ...requests[1], id: null }, { ...requests[1], id: undefined },
  { ...requests[1], method: "check/unsupported" },
  { ...requests[1], params: { contextId: "context", invocationIds: ["invocation"] } },
  { ...requests[1], testCount: 1 },
])("refuses invalid request version, identity or operation shape: %#", request => {
  assertSchemaRefuses(RunnerRequestSchema, request);
});

it.each([
  { jsonrpc: "2.0", id: "request", result: null, error: { code: -32603, message: "fault" } },
  { jsonrpc: "2.0", id: 1, result: null }, { jsonrpc: "2.0", id: "", result: null },
  { jsonrpc: "1.0", id: "request", result: null },
  { jsonrpc: "2.0", id: "request", error: { code: 1.5, message: "fault" } },
  { jsonrpc: "2.0", id: "request", result: null, method: "check/run" },
])("refuses invalid reply identity or result/error envelope: %#", reply => {
  assertSchemaRefuses(RunnerReplySchema, reply);
});

it.each([
  { ...notifications[0], id: "forbidden" }, { ...notifications[0], jsonrpc: "1.0" },
  { ...notifications[0], method: "check/unsupported" },
  { ...notifications[0], method: "check/output" },
])("refuses request IDs or unsupported notification shape: %#", notification => {
  assertSchemaRefuses(RunnerNotificationSchema, notification);
});

it.each([
  "{private-environment-value", "", "null", JSON.stringify([requests[0]]),
  JSON.stringify(requests[0], null, 2), `${JSON.stringify(requests[0])}\n${JSON.stringify(requests[1])}`,
  JSON.stringify({ jsonrpc: "2.0", id: "request" }),
])("refuses malformed or multiline messages with a redacted retry route: %#", line => {
  expect(() => parseRunnerMessage(line)).toThrow(/runner.*repair.*retry/iu);
  try { parseRunnerMessage(line); } catch (error) { expect(String(error)).not.toContain("private-environment-value"); }
});
