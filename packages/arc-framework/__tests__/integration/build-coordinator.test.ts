/** Native owned generation reaches live publication only after stable certification. */
import { readFile, rm, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { withBuildArtifactOwnership } from "../../src/lib/build-ownership.js";
import { buildOwnedArtifacts } from "../../src/lib/build-entry.js";
import { parseBuildEvidence } from "../../src/lib/build-evidence.js";
import { DEV_BUILD_STAMP_NAME } from "../../src/lib/dev-check.js";
import { makeNativeBuildFixture } from "../helpers/native-build-fixture.js";

it("publishes one stable native generation with its actual coordinator graph", async () => {
  const { root, packageRoot } = await makeNativeBuildFixture();
  try {
    await withBuildArtifactOwnership({ packageRoot, operation: "owned build" }, async (lease) => {
      await buildOwnedArtifacts(lease, "fast");
      expect(await readFile(join(packageRoot, "dist/cli.js"), "utf8")).toContain("new-native-runtime");
      const evidence = parseBuildEvidence(JSON.parse(await readFile(join(packageRoot, "dist", DEV_BUILD_STAMP_NAME), "utf8")));
      expect(evidence?.graphs.controls).toContain("packages/arc-framework/src/lib/build-coordinator.ts");
      expect(evidence?.graphs.controls).toContain("packages/arc-framework/src/lib/build-publication.ts");
      expect(evidence?.qualification.declarations).toBe(false);
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);

it.each(["ancillary"])("refuses failed %s publication and permits repaired generation", async (fault) => {
  const { root, packageRoot } = await makeNativeBuildFixture();
  const live = join(packageRoot, "dist");
  let executed = false;
  try {
    await withBuildArtifactOwnership({ packageRoot, operation: "previous qualified build" }, async (lease) => {
      await buildOwnedArtifacts(lease, "fast");
    });
    await writeFile(join(live, "obsolete.js"), "old output");
    await expect(withBuildArtifactOwnership({ packageRoot, operation: "failed publication" }, async (lease) => {
      await buildOwnedArtifacts(lease, "fast", { publication: {
        rename: async (source, destination) => {
          if ((fault === "ancillary" && destination.endsWith("kernel.json"))
            || (fault === "entry" && destination.endsWith("cli.js"))) {
            throw Object.assign(new Error("injected native write failure"), { code: "EIO" });
          }
          await rename(source, destination);
        },
        remove: async (file) => {
          if (fault === "obsolete cleanup" && file.endsWith("obsolete.js")) {
            throw Object.assign(new Error("injected native cleanup failure"), { code: "EIO" });
          }
          await rm(file, { force: true });
        },
      } });
      executed = true;
    })).rejects.toThrow("npm run build:fast");
    expect(executed).toBe(false);
    await expect(readFile(join(live, DEV_BUILD_STAMP_NAME))).rejects.toMatchObject({ code: "ENOENT" });
    await withBuildArtifactOwnership({ packageRoot, operation: "repaired publication" }, async (lease) => {
      const evidence = await buildOwnedArtifacts(lease, "fast");
      expect(JSON.parse(await readFile(join(live, DEV_BUILD_STAMP_NAME), "utf8"))).toEqual(evidence);
      expect(await readFile(join(live, "cli.js"), "utf8")).toContain("new-native-runtime");
      await expect(readFile(join(live, "obsolete.js"))).rejects.toMatchObject({ code: "ENOENT" });
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);

it("rejects an observed compiler input change and qualifies a stable retry", async () => {
  const { root, packageRoot } = await makeNativeBuildFixture();
  const producer = join(packageRoot, "src/scripts/build-schema.ts");
  const original = await readFile(producer, "utf8");
  await writeFile(producer, original.replace(
    'await mkdir(join(outDir, "schemas"), { recursive: true });',
    'await writeFile(join(import.meta.dirname, "../cli.ts"), \'export const marker = "changed-during-build";\');\n'
      + '  await mkdir(join(outDir, "schemas"), { recursive: true });',
  ));
  let executed = false;
  try {
    await expect(withBuildArtifactOwnership({ packageRoot, operation: "changing inputs" }, async (lease) => {
      await buildOwnedArtifacts(lease, "fast");
      executed = true;
    })).rejects.toThrow("inputs changed during generation");
    expect(executed).toBe(false);
    expect(await readFile(join(packageRoot, "dist/cli.js"), "utf8")).toContain("previous-live-runtime");
    await expect(readFile(join(packageRoot, "dist", DEV_BUILD_STAMP_NAME))).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(producer, original);
    await withBuildArtifactOwnership({ packageRoot, operation: "stable retry" }, async (lease) => {
      const evidence = await buildOwnedArtifacts(lease, "fast");
      expect(await readFile(join(packageRoot, "dist/cli.js"), "utf8")).toContain("changed-during-build");
      expect(JSON.parse(await readFile(join(packageRoot, "dist", DEV_BUILD_STAMP_NAME), "utf8"))).toEqual(evidence);
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);
