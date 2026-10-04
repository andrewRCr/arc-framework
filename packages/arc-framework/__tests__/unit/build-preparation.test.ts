/** Runtime preparation reuses a qualified full generation through its actual owned boundary. */
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { buildOwnedArtifacts, ensureOwnedRuntimeArtifacts } from "../../src/lib/build-entry.js";
import { withBuildArtifactOwnership } from "../../src/lib/build-ownership.js";
import { makeNativeBuildFixture } from "../helpers/native-build-fixture.js";
import { DEV_BUILD_STAMP_NAME } from "../../src/lib/build-evidence.js";

it("reuses full runtime output while explicit requests still generate anew", async () => {
  const { root, packageRoot } = await makeNativeBuildFixture();
  try {
    await withBuildArtifactOwnership({ packageRoot, operation: "full build and runtime preparation" }, async (lease) => {
      const full = await buildOwnedArtifacts(lease, "full");
      const prepared = await ensureOwnedRuntimeArtifacts(lease, {});
      expect(prepared).toEqual(full);
      expect(await readFile(join(packageRoot, "dist/cli.d.ts"), "utf8")).toContain("marker");
      const rebuilt = await buildOwnedArtifacts(lease, "fast");
      expect(rebuilt.generation).not.toBe(full.generation);
      expect(rebuilt.qualification.declarations).toBe(false);
      await expect(readFile(join(packageRoot, "dist/cli.d.ts"))).rejects.toMatchObject({ code: "ENOENT" });
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);

it("forbids generation for unqualified prebuilt preparation and accepts a repaired build", async () => {
  const { root, packageRoot } = await makeNativeBuildFixture();
  try {
    await withBuildArtifactOwnership({ packageRoot, operation: "prebuilt preparation" }, async (lease) => {
      await expect(ensureOwnedRuntimeArtifacts(lease, { ARC_E2E_SKIP_BUILD: "1" }))
        .rejects.toThrow("Generation is disabled by ARC_E2E_SKIP_BUILD=1");
      expect(await readFile(join(packageRoot, "dist/cli.js"), "utf8")).toContain("previous-live-runtime");
      await expect(readFile(join(packageRoot, ".config-loads"))).rejects.toMatchObject({ code: "ENOENT" });
      const built = await buildOwnedArtifacts(lease, "fast");
      expect(await ensureOwnedRuntimeArtifacts(lease, { ARC_E2E_SKIP_BUILD: "1" })).toEqual(built);
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);

it.each(["missing CLI", "missing schema", "old evidence", "edited runtime"])("repairs %s before returning preparation", async (fault) => {
  const { root, packageRoot } = await makeNativeBuildFixture();
  try {
    await withBuildArtifactOwnership({ packageRoot, operation: "runtime repair" }, async (lease) => {
      const built = await buildOwnedArtifacts(lease, "fast");
      if (fault === "missing CLI") await rm(join(packageRoot, "dist/cli.js"));
      if (fault === "missing schema") await rm(join(packageRoot, "dist/schemas/kernel.json"));
      if (fault === "old evidence") {
        await writeFile(join(packageRoot, "dist", DEV_BUILD_STAMP_NAME), JSON.stringify({ ...built, schemaVersion: 1 }));
      }
      if (fault === "edited runtime") {
        await writeFile(join(packageRoot, "src/cli.ts"), 'export const marker = "repaired-native-runtime";');
      }
      const prepared = await ensureOwnedRuntimeArtifacts(lease, {});
      expect(prepared.generation).not.toBe(built.generation);
      expect(JSON.parse(await readFile(join(packageRoot, "dist", DEV_BUILD_STAMP_NAME), "utf8"))).toEqual(prepared);
      expect(JSON.parse(await readFile(join(packageRoot, "dist/schemas/kernel.json"), "utf8"))).toHaveProperty("schemas");
      expect(await readFile(join(packageRoot, "dist/cli.js"), "utf8"))
        .toContain(fault === "edited runtime" ? "repaired-native-runtime" : "new-native-runtime");
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);

it("retains successful qualification and reuse when private staging disposal fails", async () => {
  const { root, packageRoot } = await makeNativeBuildFixture();
  let leftover = "";
  const warnings: string[] = [];
  try {
    await withBuildArtifactOwnership({ packageRoot, operation: "published build with denied disposal" }, async (lease) => {
      const built = await buildOwnedArtifacts(lease, "fast", {
        dispose: async (directory) => {
          leftover = directory;
          throw Object.assign(new Error("denied staging cleanup"), { code: "EACCES" });
        },
        warn: (message) => { warnings.push(message); },
      });
      expect(warnings.join("\n")).toContain("Build published; could not dispose owned staging");
      expect(warnings.join("\n")).toContain(leftover);
      expect((await stat(leftover)).isDirectory()).toBe(true);
      expect(await ensureOwnedRuntimeArtifacts(lease, {})).toEqual(built);
      expect(await readFile(join(packageRoot, "dist/cli.js"), "utf8")).toContain("new-native-runtime");
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);
