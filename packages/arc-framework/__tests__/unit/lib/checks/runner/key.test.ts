/** Prepared keys bind content and qualification without inheriting transport identity. */
import { expect, it } from "vitest";
import { CheckDeclarationSchema } from "../../../../../src/lib/checks/declaration.js";
import { InvocationSchema } from "../../../../../src/lib/checks/runner/contract-execution.js";
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
    preparedPlan: execution.plan.invocations.map(({ argv, cwd, shell }, index) => ({
      coordinate: { batch: index + 1 }, argv, cwd, shell,
    })),
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

it("invalidates prepared reuse when fixed argv, cwd or canonical coordinates change", () => {
  const { material, execution } = fixture();
  const first = composePreparedCheckKey(material, execution);
  for (const change of [
    { argv: ["runner", "other"] }, { cwd: "other" }, { shell: true as const, argv: ["runner first"] as [string] },
  ]) {
    const invocations = execution.plan.invocations.map((invocation, index) => index === 0 ? InvocationSchema.parse({ ...invocation, ...change }) : invocation);
    expect(composePreparedCheckKey(material, { ...execution, plan: { ...execution.plan, invocations } })).not.toBe(first);
  }
  const coordinates = execution.plan.invocations.map((_, index) => ({ batch: 1, shard: { index: index + 1, count: 2 } }));
  expect(composePreparedCheckKey(material, { ...execution, plan: { ...execution.plan, coordinates } })).not.toBe(first);
});

function matrixFixture() {
  const { material, execution } = fixture();
  const source = makeRunnerProtocolPlan();
  source.invocations = Array.from({ length: 4 }, (_, index) => InvocationSchema.parse({
    ...source.invocations[0], id: `pair:${index}`, argv: ["runner", `--shard=${index % 2 + 1}/2`],
  }));
  const ready = makeRunnerProtocolReady(source);
  if (ready.runtime.kind !== "known") throw new Error("Expected known fixture runtime");
  ready.runtime.bindings.forEach((binding, index) => { binding.identity = `sha256:${String(index + 1).repeat(64)}`; });
  ready.runtime.bindings.reverse();
  const coordinates = source.invocations.map((_, index) => ({ batch: Math.floor(index / 2) + 1,
    shard: { index: index % 2 + 1, count: 2 } }));
  const runtime = qualifyRunnerRuntime(indexRunnerPlan(source), ready.runtime);
  return { material, source, ready, execution: { ...execution, plan: { ...source, coordinates }, runtime } };
}

it("binds each shard runtime in canonical plan order even when received qualification is reordered", () => {
  const { material, execution } = matrixFixture();
  const expected = checkContentKey({ ...material, environmentIdentity: execution.environmentIdentity,
    preparedPlan: execution.plan.invocations.map(({ argv, cwd, shell }, index) => ({
      coordinate: execution.plan.coordinates[index]!, argv, cwd, shell,
    })), preparedRuntime: execution.plan.invocations.map((_, index) => ({ identity: `sha256:${String(index + 1).repeat(64)}`,
      globalRuntime: [" \n__proto__\r\n"], runtime: [" \nconstructor\r\n"] })) });
  expect(composePreparedCheckKey(material, execution)).toBe(expected);
  const changed = new Map(execution.runtime);
  changed.set("pair:3", { ...changed.get("pair:3")!, identity: `sha256:${"9".repeat(64)}` });
  expect(composePreparedCheckKey(material, { ...execution, runtime: changed })).not.toBe(expected);
  expect(composePreparedCheckKey(material, { ...execution, runtime: undefined })).toBeNull();
});

it.each(["missing", "duplicate", "unknown"])("refuses %s claimed runtime coverage over the complete matrix", fault => {
  const { source, ready } = matrixFixture();
  if (ready.runtime.kind !== "known") throw new Error("Expected known runtime");
  if (fault === "missing") ready.runtime.bindings.pop();
  else ready.runtime.bindings[3]!.invocationId = fault === "duplicate" ? "pair:1" : "unknown";
  expect(() => qualifyRunnerRuntime(indexRunnerPlan(source), ready.runtime)).toThrow(/runtime invocation coverage.*repair.*retry/u);
});

it("excludes attempt IDs and raw content coordinates from an otherwise identical matrix key", () => {
  const { material, execution } = matrixFixture();
  const original = composePreparedCheckKey(material, execution);
  const plan = { ...execution.plan, invocations: execution.plan.invocations.map((invocation, index) =>
    InvocationSchema.parse({ ...invocation, id: `new:${index}`, commandContent: { tree: "f".repeat(40) } })) };
  const runtime = new Map(plan.invocations.map((invocation, index) => [invocation.id, execution.runtime!.get(`pair:${index}`)!]));
  expect(composePreparedCheckKey(material, { ...execution, plan, runtime })).toBe(original);
});
