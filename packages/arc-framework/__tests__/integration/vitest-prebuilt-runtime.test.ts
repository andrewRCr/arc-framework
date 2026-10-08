/** Prebuilt-only execution validates every native preparation route without silent regeneration. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeVitestRuntimeFixture } from "../helpers/vitest-runtime-fixture.js";
import { runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";
import { withBuildArtifactOwnership } from "../../src/lib/build-ownership.js";
import { buildOwnedArtifacts } from "../../src/lib/build-entry.js";

it.each(["supported", "native"] as const)("enforces prebuilt qualification and permits repaired %s execution", async (entry) => {
  const fixture = await makeVitestRuntimeFixture();
  const generate = async () => await withBuildArtifactOwnership({ packageRoot: fixture.packageRoot, operation: "prebuilt repair" },
    async (lease) => await buildOwnedArtifacts(lease, "fast"));
  const args = entry === "native" ? ["run"] : ["full"];
  const env = { CI: "1", ARC_E2E_SKIP_BUILD: "1" };
  const counter = join(fixture.packageRoot, ".config-loads");
  try {
    const first = await generate();
    const priorLoads = await readFile(counter, "utf8");
    const matching = await runVitestControllerFixture(fixture.packageRoot, args, env, entry);
    expect(matching.code, matching.stderr).toBe(0);
    expect(await readFile(counter, "utf8")).toBe(priorLoads);
    const source = join(fixture.packageRoot, "src/cli.ts");
    await writeFile(source, await readFile(source, "utf8") + "\n// changed after prebuilt generation\n");
    const mismatch = await runVitestControllerFixture(fixture.packageRoot, args, env, entry);
    expect(mismatch.code, mismatch.stderr).toBe(1);
    expect(mismatch.stderr).toContain("ARC_E2E_SKIP_BUILD=1");
    expect(mismatch.stderr).toContain("download matching qualified build artifacts");
    expect(await readFile(counter, "utf8")).toBe(priorLoads);
    const unchanged = JSON.parse(await readFile(join(fixture.packageRoot, "dist/dev-build-stamp.json"), "utf8")) as { generation: string };
    expect(unchanged.generation).toBe(first.generation);
    const repair = await generate();
    const repairLoads = await readFile(counter, "utf8");
    const repaired = await runVitestControllerFixture(fixture.packageRoot, args, env, entry);
    expect(repaired.code, repaired.stderr).toBe(0);
    expect(await readFile(counter, "utf8")).toBe(repairLoads);
    const final = JSON.parse(await readFile(join(fixture.packageRoot, "dist/dev-build-stamp.json"), "utf8")) as { generation: string };
    expect(final.generation).toBe(repair.generation);
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 60_000);
