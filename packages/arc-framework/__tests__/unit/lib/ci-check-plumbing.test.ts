/** CI placements are checked against the emitted invocation list. */
import { expect, it } from "vitest";
import { validateCheckPlumbing } from "../../../src/lib/ci-check-plumbing.js";
import { CheckDeclarationSchema } from "../../../src/lib/checks/declaration.js";
import { resolveCheckForecast } from "../../../src/lib/checks/forecast.js";
import { resolve } from "node:path";

it("names a mapped check missing from the invocation list", () => {
  expect(() => validateCheckPlumbing([], { removed: [{ job: "lint", step: "check" }] },
    { jobs: { lint: { steps: [{ id: "check" }] } } })).toThrow("removed");
});

it("names a sharded check whose literal matrix differs from its forecast", () => {
  const check = CheckDeclarationSchema.parse({ checks: { unit: {
    command: ["npm", "test", "--"], shards: { count: 2, argument: "--shard={index}/{count}" },
  } } }).checks.unit!;
  const forecast = { id: "unit", kind: "enforcement" as const, outcome: "would run" as const,
    ...resolveCheckForecast(check, resolve("repository"), [], process.platform) };
  expect(() => validateCheckPlumbing([forecast], { unit: [{ job: "unit", step: "test" }] },
    { jobs: { unit: { steps: [{ id: "test" }], strategy: { matrix: { shard: [1, 3] } } } } }))
    .toThrow("unit");
});

it("names a mapped job and step missing from the workflow", () => {
  expect(() => validateCheckPlumbing([{ id: "lint", kind: "enforcement", outcome: "would run" }],
    { lint: [{ job: "lint", step: "missing-step" }] },
    { jobs: { lint: { steps: [{ id: "check" }] } } })).toThrow("lint/missing-step");
});
