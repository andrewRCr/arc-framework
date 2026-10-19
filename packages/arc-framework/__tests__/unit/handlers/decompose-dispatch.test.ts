/** Machine-readable refusals for decomposition forms unavailable on tracked state. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { canonicalize } from "../../../src/lib/kernel/canonical/canonical-json.js";
import { handleDecompose } from "../../../src/handlers/decompose.js";

const { root } = vi.hoisted(() => ({ root: vi.fn() }));
vi.mock("../../../src/lib/paths.js", async original => ({
  ...await original<typeof import("../../../src/lib/paths.js")>(), resolveArcRoot: root,
}));
const authority = `sha256:${"a".repeat(64)}`;
let previousExitCode: typeof process.exitCode;
beforeEach(() => {
  vi.resetAllMocks();
  root.mockReturnValue("/repo");
  previousExitCode = process.exitCode;
  process.exitCode = undefined;
});
afterEach(() => { vi.restoreAllMocks(); process.exitCode = previousExitCode; });

it.each([
  { options: { revise: true as const }, reason: "unsupported", remedy: "explicit cleanup direction" },
  { options: { revise: "cut.json" }, reason: "unsupported", remedy: "explicit cleanup direction" },
  { options: { revise: "cut.json", apply: authority }, reason: "unsupported", remedy: "explicit cleanup direction" },
  { options: { discard: true as const }, reason: "unsupported", remedy: "explicit cleanup direction" },
  { options: { discard: true as const, apply: authority }, reason: "unsupported", remedy: "explicit cleanup direction" },
  { options: { finish: true as const }, reason: "finish-map-operand", remedy: "arc decompose origin --finish <cut-map>" },
  { options: { finish: true as const, apply: authority }, reason: "finish-map-operand", remedy: "arc decompose origin --finish <cut-map>" },
])("emits one canonical refusal for $options", async ({ options, reason, remedy }) => {
  const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  await handleDecompose("origin", options);
  const output = stdout.mock.calls.map(call => String(call[0])).join("");
  expect(output.length).toBeGreaterThan(0);
  const result = JSON.parse(output);
  expect(result).toMatchObject({ status: "refused", reason, class: "recoverable", remedy: { text: expect.stringContaining(remedy) } });
  expect(output).toBe(`${canonicalize(result)}\n`);
  expect(stderr.mock.calls.map(call => String(call[0])).join("")).toBe(`${reason}\n${result.remedy.text}\n`);
  expect(process.exitCode).toBe(1);
});
