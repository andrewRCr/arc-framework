/** CI forecast decoding retains declaration metadata and refuses stale envelopes. */
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { CheckDeclarationSchema } from "../../../src/lib/checks/declaration.js";
import { resolveCheckForecast } from "../../../src/lib/checks/forecast.js";
import { CHECK_REQUEST_SCHEMA_VERSION, renderDeclaredChecks } from "../../../src/handlers/check/run-output.js";
import { parseCiCheckForecast } from "../../../src/lib/ci-check-runner.js";

function envelope() {
  const environmentInputs = Object.fromEntries([["CHECK_MODE", "value"], ["CHECK_WEIGHTS", "file"],
    ["__proto__", "value"], ["constructor", "file"]]);
  const declaration = CheckDeclarationSchema.parse({ checks: { check: { command: ["check"], environment_inputs: environmentInputs } } });
  const forecast = resolveCheckForecast(declaration.checks.check!, resolve("repository"), [], process.platform);
  return JSON.parse(renderDeclaredChecks({ kind: "result", exitCode: 0, result: {
    status: "completed", ci: true, tree: "tree", checks: [{ id: "check", kind: "enforcement", outcome: "would run", ...forecast }],
  } }, true));
}

it("round-trips the producer's environment names and kinds through serialized CI output", () => {
  const source = envelope();
  expect(source.schemaVersion).toBe(CHECK_REQUEST_SCHEMA_VERSION);
  expect(parseCiCheckForecast(source).checks[0]?.environmentInputs).toEqual(
    Object.fromEntries([["CHECK_MODE", "value"], ["CHECK_WEIGHTS", "file"], ["__proto__", "value"], ["constructor", "file"]]));
});

it.each([undefined, { CHECK_MODE: "private-invalid-kind" }])("requires current declaration metadata with a regenerate remedy: %j", metadata => {
  const source = envelope();
  source.result.checks[0].environmentInputs = metadata;
  expect(() => parseCiCheckForecast(source)).toThrow(/regenerate.*arc check gate merge --ci --dry-run --json/iu);
  try { parseCiCheckForecast(source); } catch (error) {
    expect(String(error)).not.toContain("private-invalid-kind");
  }
});
