/** Own-key setup routing refuses invalid provided evidence without a nested repair build. */
import { randomUUID } from "node:crypto";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeVitestRuntimeFixture } from "../helpers/vitest-runtime-fixture.js";
import { runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";
import { withBuildArtifactOwnership } from "../../src/lib/build-ownership.js";
import { buildOwnedArtifacts } from "../../src/lib/build-entry.js";

it.each(["undefined", "mismatched"])(
  "refuses present %s context without generating nested output", async (fault) => {
    const fixture = await makeVitestRuntimeFixture();
    try {
      let supplied = fault === "missing fields" ? "{}" : fault;
      let generation: string | undefined;
      if (fault === "mismatched") {
        const evidence = await withBuildArtifactOwnership({ packageRoot: fixture.packageRoot, operation: "fixture preparation" },
          async (lease) => await buildOwnedArtifacts(lease, "fast"));
        generation = evidence.generation;
        supplied = JSON.stringify({ ...evidence, generation: randomUUID() });
      }
      const configuration = join(fixture.packageRoot, "vitest.config.mjs");
      await writeFile(configuration, (await readFile(configuration, "utf8")).replace(
        'globalSetup: ["tests/integration-setup.mjs"] } }',
        `globalSetup: ["tests/integration-setup.mjs"], provide: { arcRuntimeBuild: ${supplied} } } }`));
      const counter = join(fixture.packageRoot, ".config-loads");
      const priorLoads = generation === undefined ? "" : await readFile(counter, "utf8");
      const result = await runVitestControllerFixture(fixture.packageRoot, ["run", "--project", "integration"],
        { CI: "1", ARC_E2E_SKIP_BUILD: undefined }, "native");
      expect(result.code, result.stderr).toBe(1);
      expect(result.stderr).toContain(fault === "mismatched" ? "does not match" : "evidence is malformed");
      expect(await readFile(counter, "utf8").catch(() => "")).toBe(priorLoads);
      if (generation === undefined) {
        expect(await readFile(join(fixture.packageRoot, "dist/cli.js"), "utf8")).toContain("previous-live-runtime");
        await expect(access(join(fixture.packageRoot, "dist/dev-build-stamp.json"))).rejects.toMatchObject({ code: "ENOENT" });
      } else {
        const current = JSON.parse(await readFile(join(fixture.packageRoot, "dist/dev-build-stamp.json"), "utf8")) as { generation: string };
        expect(current.generation).toBe(generation);
      }
    } finally { await rm(fixture.root, { recursive: true, force: true }); }
  }, 30_000,
);
