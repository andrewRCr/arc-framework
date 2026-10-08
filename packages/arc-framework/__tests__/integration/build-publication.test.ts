/** Qualified publication consumes actual native staging and retains a repaired continuation. */
import { readFile, rm, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { BUILD_ARTIFACT_LOCK_NAME, withBuildArtifactOwnership } from "../../src/lib/build-ownership.js";
import { generateOwnedBuildStaging } from "../../src/lib/build-entry.js";
import { captureBuildBaseline, certifyBuildGeneration } from "../../src/lib/build-baseline.js";
import { publishStagedBuild } from "../../src/lib/build-publication.js";
import { DEV_BUILD_STAMP_NAME } from "../../src/lib/dev-check.js";
import { makeNativeBuildFixture } from "../helpers/native-build-fixture.js";

it("establishes required output and qualification when live dist is absent", async () => {
  const { root, packageRoot } = await makeNativeBuildFixture();
  await rm(join(packageRoot, "dist"), { recursive: true });
  try {
    await withBuildArtifactOwnership({ packageRoot, operation: "initial publication" }, async (lease) => {
      const staged = await generateOwnedBuildStaging(lease, "fast");
      const evidence = certifyBuildGeneration(staged.before, captureBuildBaseline(packageRoot), staged.graphs, false);
      await publishStagedBuild(lease, staged, evidence);
      expect(await readFile(join(packageRoot, "dist/cli.js"), "utf8")).toContain("new-native-runtime");
      expect(JSON.parse(await readFile(join(packageRoot, "dist/schemas/kernel.json"), "utf8"))).toHaveProperty("schemas");
      expect(JSON.parse(await readFile(join(packageRoot, "dist", DEV_BUILD_STAMP_NAME), "utf8"))).toEqual(evidence);
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);

it("refuses a lost native owner before any live mutation and permits a repaired build", async () => {
  const { root, packageRoot } = await makeNativeBuildFixture();
  const lockPath = join(packageRoot, BUILD_ARTIFACT_LOCK_NAME);
  let stopped = false;
  try {
    await expect(withBuildArtifactOwnership({ packageRoot, operation: "lost publication" }, async (lease) => {
      const staged = await generateOwnedBuildStaging(lease, "fast");
      const evidence = certifyBuildGeneration(staged.before, captureBuildBaseline(packageRoot), staged.graphs, false);
      await publishStagedBuild(lease, staged, evidence, {
        readFile: async (file) => {
          const contents = await readFile(file, "utf8");
          await writeFile(lockPath, JSON.stringify({ pid: process.pid, acquiredAt: Date.now(), token: "replacement" }));
          return contents;
        },
      });
    }, { terminateProcess: () => { stopped = true; }, writeLine: () => {} })).rejects.toThrow("npm run build:fast");
    expect(stopped).toBe(true);
    expect(await readFile(join(packageRoot, "dist/cli.js"), "utf8")).toContain("previous-live-runtime");
    await expect(readFile(join(packageRoot, "dist", DEV_BUILD_STAMP_NAME))).rejects.toMatchObject({ code: "ENOENT" });
    await rm(lockPath);
    await withBuildArtifactOwnership({ packageRoot, operation: "repaired publication" }, async (lease) => {
      const staged = await generateOwnedBuildStaging(lease, "fast");
      const evidence = certifyBuildGeneration(staged.before, captureBuildBaseline(packageRoot), staged.graphs, false);
      await publishStagedBuild(lease, staged, evidence);
      expect(JSON.parse(await readFile(join(packageRoot, "dist", DEV_BUILD_STAMP_NAME), "utf8"))).toEqual(evidence);
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);

it.each(["missing schema", "invalid CLI"])(
  "refuses %s before changing live output", async (fault) => {
    const { root, packageRoot } = await makeNativeBuildFixture();
    try {
      await withBuildArtifactOwnership({ packageRoot, operation: "invalid output" }, async (lease) => {
        const staged = await generateOwnedBuildStaging(lease, "fast");
        const evidence = certifyBuildGeneration(staged.before, captureBuildBaseline(packageRoot), staged.graphs, false);
        if (fault === "missing schema") await rm(join(staged.directory, "schemas/kernel.json"));
        if (fault === "missing metafile") await rm(join(staged.directory, "metafile-esm.json"));
        if (fault === "empty metafile") await writeFile(join(staged.directory, "metafile-esm.json"), "");
        if (fault === "empty CLI") await writeFile(join(staged.directory, "cli.js"), "");
        if (fault === "invalid CLI") await writeFile(join(staged.directory, "cli.js"), "export const =");
        if (fault === "invalid schema") await writeFile(join(staged.directory, "schemas/kernel.json"), "{}");
        await expect(publishStagedBuild(lease, staged, evidence)).rejects.toThrow("npm run build:fast");
        expect(await readFile(join(packageRoot, "dist/cli.js"), "utf8")).toContain("previous-live-runtime");
        await expect(readFile(join(packageRoot, "dist", DEV_BUILD_STAMP_NAME))).rejects.toMatchObject({ code: "ENOENT" });
      });
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000,
);

it("exposes complete required output and removes obsolete output before evidence", async () => {
  const { root, packageRoot } = await makeNativeBuildFixture();
  const live = join(packageRoot, "dist");
  await writeFile(join(live, "obsolete.js"), "old artifact");
  try {
    await withBuildArtifactOwnership({ packageRoot, operation: "ordered publication" }, async (lease) => {
      const staged = await generateOwnedBuildStaging(lease, "fast");
      const evidence = certifyBuildGeneration(staged.before, captureBuildBaseline(packageRoot), staged.graphs, false);
      await publishStagedBuild(lease, staged, evidence, {
        rename: async (source, destination) => {
          if (destination === join(live, DEV_BUILD_STAMP_NAME)) {
            expect(await readFile(join(live, "cli.js"), "utf8")).toContain("new-native-runtime");
            expect(JSON.parse(await readFile(join(live, "schemas/kernel.json"), "utf8"))).toHaveProperty("schemas");
            await expect(readFile(join(live, "obsolete.js"))).rejects.toMatchObject({ code: "ENOENT" });
          }
          await rename(source, destination);
        },
      });
      expect(JSON.parse(await readFile(join(live, DEV_BUILD_STAMP_NAME), "utf8"))).toEqual(evidence);
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);
