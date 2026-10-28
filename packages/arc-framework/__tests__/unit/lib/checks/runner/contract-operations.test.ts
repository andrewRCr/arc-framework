/** Operation wire records distinguish qualification, native outcomes and lifetime settlement. */
import { expect, it } from "vitest";
import { PrepareParamsSchema, QualifiedRuntimeSchema, PrepareResultSchema, TerminalOutcomeSchema, RunParamsSchema,
  RunGroupParamsSchema, CancelParamsSchema, ReleaseParamsSchema, SettledRunResultSchema, CancelResultSchema,
  ReleaseResultSchema, RecoveryParamsSchema, OutputParamsSchema, OutcomeParamsSchema } from "../../../../../src/lib/checks/runner/contract.js";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../../../helpers/schema-assertion.js";

const planId = "00000000-0000-4000-8000-000000000001";
const digest = `sha256:${"a".repeat(64)}`;
const coordinates = { tree: "1".repeat(40), merged: [] };
const invocation = { id: "invocation", argv: ["runner", ""], cwd: ".", shell: false };
const probe = { id: "probe", argv: ["runner", "--version"], cwd: "." };
const runtime = { kind: "known", bindings: [{ invocationId: invocation.id, identity: digest,
  probes: [{ id: probe.id, stdout: " \nversion\r\n" }] }] };
const plan = { protocolVersion: 1, planId, source: { root: "/owned/source", manifest: "/owned/manifest", digest, coordinates },
  environment: { MODE: { kind: "value", state: "set", value: "literal\n" } },
  probes: { global: [probe], check: [] }, invocations: [invocation] };

it("preserves a fixed preparation plan with source coordinates, bindings and probes", () => {
  expect(assertSchemaAccepts(PrepareParamsSchema, plan)).toEqual(plan);
});

it.each([runtime, { kind: "unknown", reason: "fingerprint unavailable" }])("preserves runtime qualification: %j", qualification => {
  expect(assertSchemaAccepts(QualifiedRuntimeSchema, qualification)).toEqual(qualification);
});

it.each([
  { status: "ready", planId, contextId: "context", sourceDigest: digest, runtime, capabilities: { runGroup: true } },
  { status: "ready", planId, contextId: "context", sourceDigest: digest, runtime: { kind: "unknown", reason: "unknown" }, capabilities: { runGroup: false } },
  { status: "unavailable", planId, reason: "not admitted", remedy: "retry when available", settled: true },
])("preserves the preparation closure arm: $status", preparation => {
  expect(assertSchemaAccepts(PrepareResultSchema, preparation)).toEqual(preparation);
});

it.each([0, 1, 137, 255, 256, 0x80000000, 0xFFFFFFFF])("preserves the exact native status %i", exitCode => {
  const outcome = { status: "completed", exitCode, notice: "ran on worker" };
  expect(assertSchemaAccepts(TerminalOutcomeSchema, outcome)).toEqual(outcome);
});

it.each([
  { status: "unavailable", reason: "runner unavailable", remedy: "repair the runner and retry" },
  { status: "cancelled", reason: "request cancelled" },
])("preserves non-completion outcome $status", outcome => {
  expect(assertSchemaAccepts(TerminalOutcomeSchema, outcome)).toEqual(outcome);
});

it.each([
  { name: "single run", schema: RunParamsSchema, value: { contextId: "context", invocationId: invocation.id } },
  { name: "group run", schema: RunGroupParamsSchema, value: { contextId: "context", invocationIds: [invocation.id] } },
  { name: "context cancellation", schema: CancelParamsSchema, value: { planId, contextId: "context" } },
  { name: "preparation cancellation", schema: CancelParamsSchema, value: { planId } },
  { name: "release", schema: ReleaseParamsSchema, value: { contextId: "context" } },
  { name: "settlement", schema: SettledRunResultSchema,
    value: { contextId: "context", settled: true, outputComplete: true, invocationIds: [invocation.id] } },
  { name: "cancellation acknowledgement", schema: CancelResultSchema, value: { planId, accepted: true } },
  { name: "release reply", schema: ReleaseResultSchema,
    value: { contextId: "context", released: true, cleanupWarning: "directory cleanup needs retry" } },
  { name: "recovery", schema: RecoveryParamsSchema, value: { planId, instructions: "Inspect and settle by this attempt UUID" } },
  { name: "binary output", schema: OutputParamsSchema, value: { contextId: "context", invocationId: invocation.id,
    stream: "stdout", dataBase64: Buffer.from([0, 255, 10]).toString("base64") } },
  { name: "outcome notification", schema: OutcomeParamsSchema,
    value: { contextId: "context", invocationId: invocation.id, outcome: { status: "completed", exitCode: 0 } } },
])("preserves $name payloads", ({ schema, value }) => {
  expect(assertSchemaAccepts(schema, value)).toEqual(value);
});

it.each([
  { ...plan, protocolVersion: 2 }, { ...plan, planId: "not-a-uuid" },
  { ...plan, source: { ...plan.source, digest: "bad" } },
  { ...plan, source: { ...plan.source, root: "" } },
  { ...plan, probes: { ...plan.probes, testFramework: "unsupported" } },
  { ...plan, invocations: [invocation, { ...invocation, argv: ["runner", "again"] }] },
  { ...plan, probes: { global: [probe], check: [{ ...probe, argv: ["runner", "--help"] }] } },
])("refuses invalid preparation claims: %j", input => {
  assertSchemaRefuses(PrepareParamsSchema, input);
});

it.each([-1, 0.5, 0x100000000])("refuses a non-uint32 native status %j", exitCode => {
  assertSchemaRefuses(TerminalOutcomeSchema, { status: "completed", exitCode });
});

it.each([
  { kind: "unknown", reason: "" }, { kind: "unknown", reason: "unknown", bindings: [] },
  { kind: "known", bindings: [{ invocationId: "invocation", identity: "bad", probes: [] }] },
  { kind: "known", bindings: [{ invocationId: "", identity: digest, probes: [] }] },
  { kind: "known", bindings: [{ invocationId: "invocation", identity: digest, probes: [{ id: "probe", stdout: "bad\uD800" }] }] },
])("refuses malformed claimed runtime qualification: %j", input => {
  assertSchemaRefuses(QualifiedRuntimeSchema, input);
});

it.each([
  { status: "unavailable", planId, reason: "busy", remedy: "retry", settled: false },
  { status: "unavailable", planId, reason: "busy", remedy: "retry", settled: true, contextId: "ungranted" },
  { status: "ready", planId, contextId: "", sourceDigest: digest, runtime, capabilities: { runGroup: false } },
  { status: "ready", planId, contextId: "context", sourceDigest: "bad", runtime, capabilities: { runGroup: false } },
])("refuses invalid preparation closure claims: %j", input => {
  assertSchemaRefuses(PrepareResultSchema, input);
});

it.each([
  { name: "empty run identity", schema: RunParamsSchema, value: { contextId: "context", invocationId: "" } },
  { name: "duplicate group IDs", schema: RunGroupParamsSchema, value: { contextId: "context", invocationIds: ["id", "id"] } },
  { name: "invalid cancel UUID", schema: CancelParamsSchema, value: { planId: "not-a-uuid" } },
  { name: "empty release context", schema: ReleaseParamsSchema, value: { contextId: "" } },
  { name: "incomplete settlement", schema: SettledRunResultSchema,
    value: { contextId: "context", settled: false, outputComplete: true, invocationIds: ["id"] } },
  { name: "incomplete output", schema: SettledRunResultSchema,
    value: { contextId: "context", settled: true, outputComplete: false, invocationIds: ["id"] } },
  { name: "unaccepted cancel", schema: CancelResultSchema, value: { planId, accepted: false } },
  { name: "unreleased context", schema: ReleaseResultSchema, value: { contextId: "context", released: false } },
  { name: "empty recovery instructions", schema: RecoveryParamsSchema, value: { planId, instructions: "" } },
  { name: "invalid recovery UUID", schema: RecoveryParamsSchema, value: { planId: "invalid", instructions: "inspect and settle" } },
  { name: "empty outcome context", schema: OutcomeParamsSchema,
    value: { contextId: "", invocationId: "invocation", outcome: { status: "completed", exitCode: 0 } } },
])("refuses $name", ({ schema, value }) => {
  assertSchemaRefuses(schema, value);
});

it.each(["?", "QQ=", "AB==", "AA===", " AA==", "AAAA\n"])(
  "refuses malformed or oversized execution output: %#", dataBase64 => {
    assertSchemaRefuses(OutputParamsSchema, { contextId: "context", invocationId: "id", stream: "stdout", dataBase64 });
  },
);

it("refuses output exceeding 64 KiB after decoding", () => {
  expect(OutputParamsSchema.safeParse({ contextId: "context", invocationId: "id", stream: "stdout",
    dataBase64: Buffer.alloc(65537).toString("base64") }).success).toBe(false);
});

it.each(["", "QQ==", "QQ", "QUI=", "QUI", Buffer.alloc(65536).toString("base64")])(
  "preserves correctly encoded output through the 64 KiB boundary: %#", dataBase64 => {
    const parsed = assertSchemaAccepts(OutputParamsSchema, { contextId: "context", invocationId: "id", stream: "stderr", dataBase64 });
    expect(parsed.dataBase64 === dataBase64).toBe(true);
  },
);
