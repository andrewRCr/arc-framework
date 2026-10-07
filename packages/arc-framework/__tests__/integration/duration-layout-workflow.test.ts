/** Duration trials share one handed input and restrict persisted results to writer runs. */
import { readFile } from "node:fs/promises";
import { load } from "js-yaml";
import { expect, it } from "vitest";
import { z } from "zod";

const step = z.object({ id: z.string().optional(), name: z.string().optional(), if: z.string().optional(),
  uses: z.string().optional(), run: z.string().optional(), env: z.record(z.string(), z.string()).optional(),
  with: z.record(z.string(), z.unknown()).optional() });
const job = z.object({ if: z.string().optional(), needs: z.union([z.string(), z.array(z.string())]).optional(),
  strategy: z.object({ matrix: z.record(z.string(), z.unknown()) }).optional(), steps: z.array(step) });
async function workflow() {
  return z.object({ on: z.object({ workflow_dispatch: z.object({ inputs: z.record(z.string(), z.unknown()) }) }),
    jobs: z.record(z.string(), job) }).parse(load(await readFile(
    new URL("../../../../.github/workflows/ci.yml", import.meta.url), "utf8")));
}

it("selects the duration source and shard matrices only for dispatched trials", async () => {
  const value = await workflow();
  expect(value.on.workflow_dispatch.inputs.duration_source).toMatchObject({ type: "choice", default: "none",
    options: ["none", "hand-kept-list", "results-cache"] });
  for (const tier of ["unit", "integration", "e2e"]) {
    const trial = value.jobs[`trial-${tier}`];
    expect(trial, tier).toBeDefined();
    expect(trial?.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(trial?.if).toContain("inputs.duration_source != 'none'");
    expect(trial?.if).not.toContain("outputs.weight");
    expect(trial?.strategy?.matrix.shard).toBe(`\${{ fromJSON(inputs.${tier}_shards) }}`);
    expect(value.jobs[tier]?.if).toContain("inputs.duration_source != 'none'");
  }
});

it("hands the same setup artifact to every trial and clears native results before execution", async () => {
  const value = await workflow();
  const setup = value.jobs.setup;
  expect(setup?.steps.find((entry) => entry.id === "duration-cache")?.uses).toMatch(/^actions\/cache\/restore@/u);
  expect(setup?.steps.find((entry) => entry.id === "duration-cache")?.with?.["restore-keys"])
    .toBe("arc-test-durations-Linux-");
  expect(setup?.steps.some((entry) => entry.run?.includes("prepare-duration-input.ts"))).toBe(true);
  expect(setup?.steps.find((entry) => entry.name === "Upload duration input")?.with?.name).toBe("test-duration-input");
  for (const tier of ["unit", "integration", "e2e"]) {
    const steps = value.jobs[`trial-${tier}`]?.steps ?? [];
    const download = steps.findIndex((entry) => entry.name === "Download duration input");
    const clear = steps.findIndex((entry) => entry.name === "Clear native test results");
    const run = steps.findIndex((entry) => entry.name === "Run balanced shard");
    expect(download).toBeGreaterThanOrEqual(0);
    expect(clear).toBeGreaterThan(download);
    expect(run).toBeGreaterThan(clear);
    expect(steps[download]?.with?.name).toBe("test-duration-input");
    expect(steps[clear]?.run).toBe("rm -rf packages/arc-framework/node_modules/.vite/vitest/");
    expect(steps[run]?.env).toMatchObject({ ARC_TEST_DURATION_SOURCE: "${{ inputs.duration_source }}",
      ARC_TEST_DURATION_FILE: `\${{ github.workspace }}/packages/arc-framework/.test-cost-runs/duration-input/${tier}.json` });
    expect(steps.find((entry) => entry.name === "Upload native durations")?.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(steps.find((entry) => entry.name === "Upload native durations")?.with?.name).toBe(`duration-results-${tier}-\${{ matrix.shard }}`);
  }
});

it("merges and saves only after all writer shards succeeded and gives unit reports distinct names", async () => {
  const value = await workflow();
  const merger = value.jobs["merge-test-durations"];
  expect(merger?.needs).toEqual(["trial-unit", "trial-integration", "trial-e2e"]);
  expect(merger?.if).toContain("github.event_name == 'workflow_dispatch'");
  expect(merger?.steps.find((entry) => entry.name === "Save duration cache")?.uses).toMatch(/^actions\/cache\/save@/u);
  expect(merger?.steps.find((entry) => entry.name === "Save duration cache")?.with?.key)
    .toContain("${{ github.run_id }}");
  expect(value.jobs["trial-unit"]?.steps.find((entry) => entry.name === "Upload unit test report")?.with?.name)
    .toBe("unit-test-report-${{ matrix.shard }}");
});
