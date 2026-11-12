/** Wire execution records preserve captured values and exact native invocation policy. */
import { expect, it } from "vitest";
import { CapturedBindingSchema, CapturedEnvironmentSchema, InvocationSchema, ProbeSchema } from "../../../../../src/lib/checks/runner/contract.js";
import { captureEnvironmentInputs } from "../../../../../src/lib/checks/environment-inputs.js";
import type { CapturedBinding } from "../../../../../src/lib/checks/environment-inputs.js";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../../../helpers/schema-assertion.js";

const digest = `sha256:${"a".repeat(64)}`;
const tree = "1".repeat(40);

it.each<CapturedBinding>([
  { kind: "value", state: "unset" }, { kind: "value", state: "set", value: " \n literal \0" },
  { kind: "file", state: "unset" }, { kind: "file", state: "empty" },
  { kind: "file", state: "file", path: "/owned/input", digest, bytes: 0 },
])("preserves the captured $kind/$state binding union", binding => {
  expect(assertSchemaAccepts(CapturedBindingSchema, binding)).toEqual(binding);
});

it("preserves serialized native captures including prototype-shaped environment names", async () => {
  const capture = await captureEnvironmentInputs(Object.fromEntries([
    ["MODE", "value"], ["EMPTY_FILE", "file"], ["ABSENT", "value"], ["__proto__", "value"], ["constructor", "file"],
  ] as const), "/unused", { environment: { MODE: "literal\n", EMPTY_FILE: "", ["__proto__"]: "own value" } });
  try {
    const serialized: unknown = JSON.parse(JSON.stringify(capture.bindings));
    expect(assertSchemaAccepts(CapturedEnvironmentSchema, serialized)).toEqual(capture.bindings);
  } finally { await capture.dispose(); }
});

it.each([
  { id: "opaque: inv\n1", argv: ["runner", "", "a b"], cwd: ".", shell: false },
  { id: "files", argv: ["runner"], cwd: "nested/project", shell: false, commandContent: { tree, base: tree, merged: [tree] } },
  { id: "shell", argv: ["printf '%s' '$HOME'"], cwd: ".", shell: true },
  { id: "empty-shell", argv: [""], cwd: ".", shell: true },
])("preserves invocation policy for $id", invocation => {
  expect(assertSchemaAccepts(InvocationSchema, invocation)).toEqual(invocation);
});

it("preserves probe argv and cwd without a command-content channel", () => {
  const probe = { id: "opaque probe", argv: ["tool", "--version", ""], cwd: "nested" };
  expect(assertSchemaAccepts(ProbeSchema, probe)).toEqual(probe);
});

it.each([
  { kind: "value", state: "unset", value: "extra" },
  { kind: "file", state: "empty", path: "/extra" },
  { kind: "file", state: "file", path: "", digest, bytes: 0 },
  { kind: "file", state: "file", path: "/bad\0path", digest, bytes: 0 },
  { kind: "file", state: "file", path: "/input", digest: "bad", bytes: 0 },
  ...[-1, 0.5, 2 ** 53].map(bytes => ({ kind: "file", state: "file", path: "/input", digest, bytes })),
])("refuses invalid captured binding representations: %j", binding => {
  assertSchemaRefuses(CapturedBindingSchema, binding);
});

it.each([
  { GIT_DIR: { kind: "value", state: "unset" } },
  { arc_check_tree: { kind: "value", state: "unset" } },
  { "BAD-NAME": { kind: "value", state: "unset" } },
  { MODE: { kind: "value", state: "unset" }, mode: { kind: "file", state: "empty" } },
  Object.fromEntries([["__proto__", { kind: "file", state: "file", path: "/input", digest: "bad", bytes: 0 }]]),
])("refuses invalid captured environment names or prototype-shaped values: %j", environment => {
  assertSchemaRefuses(CapturedEnvironmentSchema, environment);
});

const invocation = { id: "invocation", argv: ["runner"], cwd: ".", shell: false };
it.each([
  { ...invocation, id: "" }, { ...invocation, argv: [] }, { ...invocation, argv: [""] },
  { ...invocation, argv: ["runner", "bad\0argument"] },
  { ...invocation, shell: true, argv: ["command", "extra"] },
  ...["", "/escape", "../escape", "a/../escape", "a//b", "bad\0cwd"].map(cwd => ({ ...invocation, cwd })),
  { ...invocation, testCount: 1 }, { ...invocation, commandContent: { tree: "not-a-tree" } },
])("refuses invalid native invocation policy: %j", input => {
  assertSchemaRefuses(InvocationSchema, input);
});

it.each([
  { id: "", argv: ["tool"], cwd: "." }, { id: "probe", argv: [], cwd: "." },
  { id: "probe", argv: ["tool"], cwd: ".", commandContent: { tree } },
  { id: "probe", argv: ["tool"], cwd: ".", shell: true },
])("refuses invalid probes or command-only policy on probes: %j", probe => {
  assertSchemaRefuses(ProbeSchema, probe);
});
