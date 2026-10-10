/** Invocation forecasts preserve every input across native batches and shard expansions. */
import { expect, it } from "vitest";
import { resolve } from "node:path";
import { CheckDeclarationSchema } from "../../../../src/lib/checks/declaration.js";
import { resolveCheckForecast } from "../../../../src/lib/checks/forecast.js";

it("expands each file batch into one invocation per shard without losing paths", () => {
  const check = CheckDeclarationSchema.parse({ checks: { check: {
    command: ["lint", "--strict"], mode: "files", shards: { count: 2, argument: "--shard={index}/{count}" },
  } } }).checks.check;
  if (!check) throw new Error("Missing fixture check");
  const paths = Array.from({ length: 2000 }, (_, index) => `src/${index}-${"x".repeat(80)}.ts`);
  const forecast = resolveCheckForecast(check, resolve("repository"), paths, process.platform);
  expect(forecast.batches.length).toBeGreaterThan(1);
  expect(forecast.batches.flatMap(batch => batch.slice(2))).toEqual(paths);
  expect(forecast.shards).toHaveLength(2);
  expect(forecast.shards?.[1]).toMatchObject({ index: 2,
    batches: forecast.batches.map(batch => [...batch, "--shard=2/2"]),
  });
});
