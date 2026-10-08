/** Real uploaded evidence is reused or repaired in every CI artifact consumer. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { readBuildQualification } from "../../src/lib/build-qualification.js";
import { ciBuildSteps, downloadCiBuild, runCiPreflight, runCiProducer } from "../helpers/ci-build-fixture.js";
import { makeVitestRuntimeFixture } from "../helpers/vitest-runtime-fixture.js";
import { runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";

let producer: Awaited<ReturnType<typeof makeVitestRuntimeFixture>>;
let generation: string;
beforeAll(async () => {
  producer = await makeVitestRuntimeFixture();
  const built = await runCiProducer(producer.root);
  expect(built.code, built.stderr).toBe(0);
  const qualification = readBuildQualification(producer.packageRoot, "full");
  expect(qualification.status).toBe("qualified");
  if (qualification.status !== "qualified") throw new Error(qualification.reason);
  generation = qualification.evidence.generation;
}, 30_000);
afterAll(async () => { await rm(producer.root, { recursive: true, force: true }); });

it.each(["lint-typecheck", "integration", "e2e", "portability"])(
  "qualifies transferred output and its preflight contract for %s", async (job) => {
    const consumer = await downloadCiBuild(producer.packageRoot, job);
    try {
      expect(readBuildQualification(consumer.packageRoot, "full")).toMatchObject({
        status: "qualified", evidence: { generation, qualification: { declarations: true } },
      });
      const preflight = (await ciBuildSteps(job)).find((step) => step.id === "runtime-preflight");
      expect(preflight).toMatchObject({
        run: "node --import tsx packages/arc-framework/src/scripts/run-build.ts prepare",
        env: { ARC_E2E_SKIP_BUILD: "" },
      });
      const cli = join(consumer.packageRoot, "src/cli.ts");
      const original = await readFile(cli, "utf8");
      await writeFile(cli, original + "\n// consumer source changed\n");
      expect(readBuildQualification(consumer.packageRoot, "runtimeMetafile")).toMatchObject({ status: "unqualified" });
      await expect(readFile(join(consumer.packageRoot, ".config-loads"))).rejects.toMatchObject({ code: "ENOENT" });
      await writeFile(cli, original);
      expect(readBuildQualification(consumer.packageRoot, "full")).toMatchObject({
        status: "qualified", evidence: { generation, qualification: { declarations: true } },
      });
    } finally { await rm(consumer.root, { recursive: true, force: true }); }
  }, 60_000,
);

it.each(["integration"])(
  "repairs transferred output before %s consumes it with generation disabled", async (job) => {
    const consumer = await downloadCiBuild(producer.packageRoot, job);
    try {
      expect(readBuildQualification(consumer.packageRoot, "full")).toMatchObject({
        status: "qualified", evidence: { generation, qualification: { declarations: true } },
      });
      const reused = await runCiPreflight(consumer, job);
      expect(reused.code, reused.stderr).toBe(0);
      expect(readBuildQualification(consumer.packageRoot, "runtimeMetafile")).toMatchObject({
        status: "qualified", evidence: { generation },
      });
      await expect(readFile(join(consumer.packageRoot, ".config-loads"))).rejects.toMatchObject({ code: "ENOENT" });
      const cli = join(consumer.packageRoot, "src/cli.ts");
      await writeFile(cli, await readFile(cli, "utf8") + "\n// consumer source changed\n");
      const prepared = await runCiPreflight(consumer, job);
      expect(prepared.code, prepared.stderr).toBe(0);
      const result = await runVitestControllerFixture(consumer.packageRoot, ["full"],
        { CI: "1", ARC_E2E_SKIP_BUILD: "1" });
      expect(result.code, result.stderr).toBe(0);
      const repaired = readBuildQualification(consumer.packageRoot, "runtimeMetafile");
      expect(repaired.status).toBe("qualified");
      if (repaired.status !== "qualified") throw new Error(repaired.reason);
      expect(repaired.evidence.generation).not.toBe(generation);
      const events = await readFile(consumer.events, "utf8");
      const consumed = events.split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line) as {
        stage: string; owned: boolean; generation: string;
      });
      expect(consumed.map((event) => event.stage)).toEqual(expect.arrayContaining([
        "integration:setup", "integration:teardown", "e2e:setup", "e2e:teardown",
      ]));
      expect(consumed.every((event) => event.owned && event.generation === repaired.evidence.generation)).toBe(true);
      const loads = await readFile(join(consumer.packageRoot, ".config-loads"), "utf8");
      expect((await runVitestControllerFixture(consumer.packageRoot, ["full"],
        { CI: "1", ARC_E2E_SKIP_BUILD: "1" })).code).toBe(0);
      expect(await readFile(join(consumer.packageRoot, ".config-loads"), "utf8")).toBe(loads);
      await expect(readFile(join(consumer.packageRoot, ".arc-build.lock")))
        .rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(consumer.root, { recursive: true, force: true }); }
  }, 60_000,
);

it("retains full producer and platform-local declaration gates before preparation", async () => {
  expect(await readFile(join(producer.packageRoot, "dist/cli.d.ts"), "utf8")).toContain("marker");
  const steps = await ciBuildSteps("portability-cross-platform");
  const install = steps.findIndex((step) => step.run === "npm ci");
  const full = steps.findIndex((step) => step.run === "npm run build");
  const prepared = steps.findIndex((step) => step.id === "runtime-preflight");
  const consume = steps.findIndex((step) => step.run === "npm run test:portability");
  expect(install).toBeGreaterThanOrEqual(0);
  expect(full).toBeGreaterThan(install);
  expect(prepared).toBeGreaterThan(full);
  expect(consume).toBeGreaterThan(prepared);
  const reused = await runCiPreflight(producer, "portability-cross-platform");
  expect(reused.code, reused.stderr).toBe(0);
  expect(readBuildQualification(producer.packageRoot, "full")).toMatchObject({
    status: "qualified", evidence: { generation, qualification: { declarations: true } },
  });
  expect((await runVitestControllerFixture(producer.packageRoot, ["full"],
    { CI: "1", ARC_E2E_SKIP_BUILD: "1" })).code).toBe(0);
}, 30_000);
