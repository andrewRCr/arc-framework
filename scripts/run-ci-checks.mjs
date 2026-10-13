/** Replay the declaration's source-generated merge forecast in a native CI step. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { CheckDeclarationSchema } from "../packages/arc-framework/src/lib/checks/declaration.ts";
import { CheckPlumbingSchema, validateCheckPlumbing } from "../packages/arc-framework/src/lib/ci-check-plumbing.ts";
import { parseCiCheckForecast, runCiCheckStep } from "../packages/arc-framework/src/lib/ci-check-runner.ts";

const root = resolve(import.meta.dirname, "..");
try {
  const readYaml = async path => load(await readFile(resolve(root, path), "utf8"));
  const forecast = parseCiCheckForecast(JSON.parse(await readFile(resolve(root, ".arc-check-forecast.json"), "utf8")));
  const plumbing = CheckPlumbingSchema.parse(await readYaml(".github/check-plumbing.yml"));
  const [mode, job, step, ...forwarded] = process.argv.slice(2);
  if (mode === "validate") {
    validateCheckPlumbing(forecast.checks.map(check => ({ ...check, kind: "enforcement", outcome: "would run" })),
      plumbing, await readYaml(".github/workflows/ci.yml"));
  } else if (mode === "run" && job && step) {
    let shard;
    if (forwarded[0] === "--shard") {
      forwarded.shift();
      shard = Number(forwarded.shift());
      if (!Number.isInteger(shard) || shard < 1) throw new Error("--shard requires a positive integer");
    }
    if (forwarded[0] === "--") forwarded.shift();
    const declaration = CheckDeclarationSchema.parse(await readYaml(".arc/system/arc-checks.yml"));
    process.exitCode = await runCiCheckStep({ root, forecast, plumbing, declaration, job, step, shard, arguments: forwarded });
  } else {
    throw new Error("Usage: run-ci-checks.mjs validate | run <job> <step> [--shard <index>] [-- <arguments>]");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
