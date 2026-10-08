/** Prepared native projects share one generation through closing under artifact ownership. */
import { access, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeVitestRuntimeFixture } from "../helpers/vitest-runtime-fixture.js";
import { runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";
import { readBuildQualification } from "../../src/lib/build-qualification.js";

it.each([{ CI: "1" }])(
  "shares owned preparation and reuse with CPU bypass %j", async (bypass) => {
    const fixture = await makeVitestRuntimeFixture();
    try {
      const environment = { ...bypass, ARC_E2E_SKIP_BUILD: undefined, npm_lifecycle_event: "test:e2e" };
      const first = await runVitestControllerFixture(fixture.packageRoot, ["full"], environment);
      expect(first.code, first.stderr).toBe(0);
      const qualification = readBuildQualification(fixture.packageRoot, "runtimeMetafile");
      expect(qualification.status).toBe("qualified");
      if (qualification.status !== "qualified") throw new Error(qualification.reason);
      const events = (await readFile(fixture.events, "utf8")).split("\n")
        .filter((event) => event.startsWith("{"))
        .map((event) => JSON.parse(event) as { stage: string; generation: string; owned: boolean });
      expect(events.map((event) => event.stage).sort()).toEqual([
        "e2e:setup", "e2e:teardown", "integration:setup", "integration:teardown",
      ]);
      for (const event of events) {
        expect(event.owned).toBe(true);
        expect(event.generation).toBe(qualification.evidence.generation);
      }
      expect(qualification.evidence.qualification.declarations).toBe(false);
      await expect(access(join(fixture.packageRoot, ".arc-build.lock"))).rejects.toMatchObject({ code: "ENOENT" });
      const second = await runVitestControllerFixture(fixture.packageRoot, ["full"], environment);
      expect(second.code, second.stderr).toBe(0);
      const reused = readBuildQualification(fixture.packageRoot, "runtimeMetafile");
      expect(reused.status === "qualified" && reused.evidence.generation).toBe(qualification.evidence.generation);
    } finally { await rm(fixture.root, { recursive: true, force: true }); }
  }, 60_000,
);
