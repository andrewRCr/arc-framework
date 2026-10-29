/** Prepared keys bind content and qualification without inheriting transport identity. */
import { expect, it } from "vitest";
import { CheckDeclarationSchema } from "../../../../../src/lib/checks/declaration.js";
import { checkContentKey } from "../../../../../src/lib/checks/key.js";
import type { CheckKeyMaterial } from "../../../../../src/lib/checks/key-resolver.js";
import { composePreparedCheckKey, type PreparedCheckKeyContext } from "../../../../../src/lib/checks/runner/key.js";
import { indexRunnerPlan, qualifyRunnerRuntime } from "../../../../../src/lib/checks/runner/correlation.js";
import { makeRunnerProtocolPlan, makeRunnerProtocolReady } from "../../../../fixtures/checks/runner-protocol.js";

function fixture(): { material: CheckKeyMaterial; execution: PreparedCheckKeyContext } {
  const plan = makeRunnerProtocolPlan();
  const declaration = CheckDeclarationSchema.parse({ checks: { check: { command: ["runner", "first"], inputs: ["input.txt"] } } });
  const check = declaration.checks.check;
  if (check === undefined) throw new Error("Expected resolved check");
  return { material: { id: "check", declaration: check, inputs: [], materializedInputs: [{ path: "input.txt",
    entry: { path: "input.txt", kind: "file", mode: 0o644, bytes: 3, digest: `sha256:${"c".repeat(64)}` } }] },
  execution: { plan, runtime: qualifyRunnerRuntime(indexRunnerPlan(plan), makeRunnerProtocolReady(plan).runtime),
    environmentIdentity: `sha256:${"d".repeat(64)}` } };
}

it("composes known qualification in fixed invocation and probe order without local probing", () => {
  const { material, execution } = fixture();
  const expected = checkContentKey({ ...material, environmentIdentity: execution.environmentIdentity,
    preparedRuntime: execution.plan.invocations.map(() => ({ identity: `sha256:${"b".repeat(64)}`,
      globalRuntime: [" \n__proto__\r\n"], runtime: [" \nconstructor\r\n"] })) });
  expect(composePreparedCheckKey(material, execution)).toBe(expected);
});

it.each(["unknown runtime", "failed scoped read", "canonical content only"])("withholds a key for %s", condition => {
  const { material, execution } = fixture();
  if (condition === "canonical content only") delete material.materializedInputs;
  expect(composePreparedCheckKey(condition === "failed scoped read" ? null : material,
    condition === "unknown runtime" ? { ...execution, runtime: undefined } : execution)).toBeNull();
});
