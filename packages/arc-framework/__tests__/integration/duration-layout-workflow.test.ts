/** Duration-balanced jobs share one handed input and restrict persisted results to writer runs. */
import { readFile } from "node:fs/promises";
import { load } from "js-yaml";
import { expect, it } from "vitest";
import { z } from "zod";

const step = z.object({ id: z.string().optional(), name: z.string().optional(), if: z.string().optional(),
  uses: z.string().optional(), run: z.string().optional(), env: z.record(z.string(), z.string()).optional(),
  with: z.record(z.string(), z.unknown()).optional() });
const job = z.object({ name: z.string().optional(), if: z.string().optional(), needs: z.union([z.string(), z.array(z.string())]).optional(),
  strategy: z.object({ matrix: z.record(z.string(), z.unknown()) }).optional(), steps: z.array(step) });
async function workflow() {
  return z.object({ on: z.object({ workflow_dispatch: z.object({ inputs: z.record(z.string(), z.unknown()) }) }),
    jobs: z.record(z.string(), job) }).parse(load(await readFile(
    new URL("../../../../.github/workflows/ci.yml", import.meta.url), "utf8")));
}

it("uses only the adopted literal matrices and admits scheduled writer runs", async () => {
  const value = await workflow();
  expect(Object.keys(value.on.workflow_dispatch.inputs))
    .toEqual(["run_portability_pair", "portability_timing_only", "store_per_change"]);
  for (const [tier, indices] of [["unit", [1,2]], ["integration", [1,2,3,4]], ["store", [1,2,3,4]],
    ["e2e", [1,2,3,4]]] as const) {
    const adopted = value.jobs[tier];
    expect(adopted?.strategy?.matrix.shard).toEqual(indices);
    expect(adopted?.if).toContain("outputs.weight");
    expect(adopted?.if).toContain("github.event_name == 'schedule'");
    expect(value.jobs[`trial-${tier}`]).toBeUndefined();
  }
});

it("runs every unit shard on the Node floor and rolling LTS", async () => {
  const unit = (await workflow()).jobs.unit;
  const nodes = z.array(z.object({ label: z.string(), version: z.string() })).parse(unit?.strategy?.matrix.node);
  expect(nodes.map(({ version }) => version).sort()).toEqual(["24", "lts/*"]);
  expect(new Set(nodes.map(({ label }) => label)).size).toBe(nodes.length);
  for (const { label } of nodes) expect(label).toMatch(/^[a-z0-9-]+$/u);
  expect(unit?.name).toContain("${{ matrix.node.label }}");
  expect(unit?.name).toContain("${{ matrix.shard }}");
  const setup = unit?.steps.find(({ uses }) => uses?.startsWith("actions/setup-node@"));
  expect(setup?.with?.["node-version"]).toBe("${{ matrix.node.version }}");
  expect(unit?.steps.find(({ name }) => name === "Run balanced shard")?.if).toBeUndefined();
});

it("keys unit dependencies by the resolved Node runtime before restoring them", async () => {
  const steps = (await workflow()).jobs.unit?.steps ?? [];
  const setup = steps.findIndex(({ uses }) => uses?.startsWith("actions/setup-node@"));
  const cache = steps.findIndex(({ id }) => id === "nm-cache");
  expect(steps[setup]?.id).toBe("node");
  expect(cache).toBeGreaterThan(setup);
  expect(steps[cache]?.with?.key).toContain("${{ steps.node.outputs.node-version }}");
});

it("takes unit timing and budget observations only from the rolling LTS", async () => {
  const steps = (await workflow()).jobs.unit?.steps ?? [];
  const writer = steps.find(({ name }) => name === "Upload native durations");
  expect(writer?.if).toContain("matrix.node.version == 'lts/*'");
  expect(writer?.with?.name).toBe("duration-results-unit-${{ matrix.shard }}");
  expect(steps.find(({ name }) => name === "Report test budget")?.if)
    .toBe("${{ matrix.node.version == 'lts/*' }}");
});

it("hands the same setup artifact to every adopted job and clears native results before execution", async () => {
  const value = await workflow();
  const setup = value.jobs.setup;
  expect(setup?.steps.find((entry) => entry.id === "duration-cache")?.uses).toMatch(/^actions\/cache\/restore@/u);
  expect(setup?.steps.find((entry) => entry.id === "duration-cache")?.with?.["restore-keys"])
    .toBe("arc-test-durations-Linux-");
  expect(setup?.steps.some((entry) => entry.run?.includes("prepare-duration-input.ts"))).toBe(true);
  expect(setup?.steps.find((entry) => entry.name === "Upload duration input")?.with?.name).toBe("test-duration-input");
  for (const tier of ["unit", "integration", "e2e"]) {
    const steps = value.jobs[tier]?.steps ?? [];
    const download = steps.findIndex((entry) => entry.name === "Download duration input");
    const clear = steps.findIndex((entry) => entry.name === "Clear native test results");
    const run = steps.findIndex((entry) => entry.name === "Run balanced shard");
    expect(download).toBeGreaterThanOrEqual(0);
    expect(clear).toBeGreaterThan(download);
    expect(run).toBeGreaterThan(clear);
    expect(steps[download]?.with?.name).toBe("test-duration-input");
    expect(steps[clear]?.run).toBe("rm -rf packages/arc-framework/node_modules/.vite/vitest/");
    expect(steps[run]?.env).toMatchObject({
      ARC_TEST_DURATION_FILE: `\${{ github.workspace }}/packages/arc-framework/.test-cost-runs/duration-input/${tier}.json` });
    expect(steps.find((entry) => entry.name === "Upload native durations")?.if)
      .toContain("github.event_name == 'workflow_dispatch' || github.event_name == 'schedule'");
    expect(steps.find((entry) => entry.name === "Upload native durations")?.with?.name).toBe(`duration-results-${tier}-\${{ matrix.shard }}`);
  }
});

it("runs the store shards on the integration tier's handed durations and writes theirs beside its shards", async () => {
  const steps = (await workflow()).jobs.store?.steps ?? [];
  const download = steps.findIndex((entry) => entry.name === "Download duration input");
  const clear = steps.findIndex((entry) => entry.name === "Clear native test results");
  const run = steps.findIndex((entry) => entry.name === "Run store suites");
  expect(download).toBeGreaterThanOrEqual(0);
  expect(clear).toBeGreaterThan(download);
  expect(run).toBeGreaterThan(clear);
  expect(steps[run]?.run).toBe("node --import tsx scripts/run-ci-checks.mjs run store test --shard ${{ matrix.shard }}");
  expect(steps[run]?.env).toMatchObject({
    ARC_TEST_DURATION_FILE: "${{ github.workspace }}/packages/arc-framework/.test-cost-runs/duration-input/integration.json" });
  const upload = steps.find((entry) => entry.name === "Upload native durations");
  expect(upload?.with?.name).toBe("duration-results-integration-store-${{ matrix.shard }}");
  expect(upload?.if).toContain("github.event_name == 'push'");
  expect(steps.find((entry) => entry.name === "Report test budget")?.run).toContain('--ci-job "store-${{ matrix.shard }}"');
});

it("runs every store suite in full off pull requests, or in its per-change form when a dispatch asks", async () => {
  const value = await workflow();
  expect(value.on.workflow_dispatch.inputs.store_per_change).toMatchObject({ type: "boolean", default: false });
  const run = value.jobs.store?.steps.find((entry) => entry.name === "Run store suites");
  expect(run?.env?.ARC_STORE_CHECK)
    .toBe("${{ github.event_name != 'pull_request' && (inputs.store_per_change && 'every' || 'full') || '' }}");
  expect(value.jobs["merge-test-durations"]?.if).toContain("!inputs.store_per_change");
});

it("merges and saves after the writer shards succeeded, a push updating the input it was handed", async () => {
  const value = await workflow();
  const merger = value.jobs["merge-test-durations"];
  expect(merger?.needs).toEqual(["unit", "integration", "store", "e2e"]);
  expect(merger?.if).toContain("needs.store.result == 'success'");
  expect(merger?.if).toContain("github.event_name == 'workflow_dispatch' || github.event_name == 'schedule'");
  expect(merger?.steps.find((entry) => entry.name === "Save duration cache")?.uses).toMatch(/^actions\/cache\/save@/u);
  const handed = merger?.steps.find((entry) => entry.name === "Download handed duration input");
  expect(handed?.if).toBe("${{ github.event_name == 'push' }}");
  expect(handed?.with).toMatchObject({ name: "test-duration-input", path: "duration-base" });
  expect(merger?.steps.find((entry) => entry.name === "Merge disjoint duration memberships")?.run)
    .toContain("${{ github.event_name == 'push' && 'duration-base' || '' }}");
  expect(merger?.steps.find((entry) => entry.name === "Save duration cache")?.with?.key)
    .toContain("${{ github.run_id }}");
  expect(value.jobs.unit?.steps.find((entry) => entry.name === "Upload unit test report")?.with?.name)
    .toBe("unit-test-report-${{ matrix.node.label }}-${{ matrix.shard }}");
});
