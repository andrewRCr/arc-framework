/** Publication policies consume completed staging without starting a compiler or parser child. */
import { readFile, rm, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { publishStagedBuild } from "../../src/lib/build-publication.js";
import { DEV_BUILD_STAMP_NAME } from "../../src/lib/dev-check.js";
import { makeStagedBuildFixture } from "../helpers/staged-build-fixture.js";

const acceptCli = async () => {};

it("establishes required output and qualification when live dist is absent", async () => {
  const { root, packageRoot, lease, staged, evidence } = makeStagedBuildFixture();
  await rm(join(packageRoot, "dist"), { recursive: true });
  try {
    await publishStagedBuild(lease, staged, evidence, { checkCli: acceptCli });
    expect(await readFile(join(packageRoot, "dist/cli.js"), "utf8")).toContain("new-staged-runtime");
    expect(JSON.parse(await readFile(join(packageRoot, "dist/schemas/kernel.json"), "utf8"))).toHaveProperty("schemas");
    expect(JSON.parse(await readFile(join(packageRoot, "dist", DEV_BUILD_STAMP_NAME), "utf8"))).toEqual(evidence);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("refuses lost ownership before mutation and publishes after ownership repair", async () => {
  let lost = true;
  const { root, packageRoot, staged, lease, evidence } = makeStagedBuildFixture("fast", async () => {
    if (lost) throw new Error("Artifact ownership cannot be confirmed");
  });
  try {
    await expect(publishStagedBuild(lease, staged, evidence, { checkCli: acceptCli })).rejects.toThrow("npm run build:fast");
    expect(await readFile(join(packageRoot, "dist/cli.js"), "utf8")).toContain("previous-live-runtime");
    await expect(readFile(join(packageRoot, "dist", DEV_BUILD_STAMP_NAME))).rejects.toMatchObject({ code: "ENOENT" });
    lost = false;
    await publishStagedBuild(lease, staged, evidence, { checkCli: acceptCli });
    expect(JSON.parse(await readFile(join(packageRoot, "dist", DEV_BUILD_STAMP_NAME), "utf8"))).toEqual(evidence);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it.each(["missing schema", "missing metafile", "empty metafile", "empty CLI", "invalid CLI", "invalid schema"])(
  "refuses %s before changing live output", async (fault) => {
    const { root, packageRoot, lease, staged, evidence } = makeStagedBuildFixture();
    try {
      if (fault === "missing schema") await rm(join(staged.directory, "schemas/kernel.json"));
      if (fault === "missing metafile") await rm(join(staged.directory, "metafile-esm.json"));
      if (fault === "empty metafile") await writeFile(join(staged.directory, "metafile-esm.json"), "");
      if (fault === "empty CLI") await writeFile(join(staged.directory, "cli.js"), "");
      if (fault === "invalid CLI") await writeFile(join(staged.directory, "cli.js"), "export const =");
      if (fault === "invalid schema") await writeFile(join(staged.directory, "schemas/kernel.json"), "{}");
      await expect(publishStagedBuild(lease, staged, evidence, { checkCli: async () => {
        if (fault === "invalid CLI") throw new SyntaxError("Unexpected token");
      } })).rejects.toThrow("npm run build:fast");
      expect(await readFile(join(packageRoot, "dist/cli.js"), "utf8")).toContain("previous-live-runtime");
      await expect(readFile(join(packageRoot, "dist", DEV_BUILD_STAMP_NAME))).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(root, { recursive: true, force: true }); }
  },
);

it("exposes complete required output and removes obsolete output before evidence", async () => {
  const { root, packageRoot, lease, staged, evidence } = makeStagedBuildFixture();
  const live = join(packageRoot, "dist");
  await writeFile(join(live, "obsolete.js"), "old artifact");
  try {
    await publishStagedBuild(lease, staged, evidence, {
      checkCli: acceptCli,
      rename: async (source, destination) => {
        if (destination === join(live, DEV_BUILD_STAMP_NAME)) {
          expect(await readFile(join(live, "cli.js"), "utf8")).toContain("new-staged-runtime");
          expect(JSON.parse(await readFile(join(live, "schemas/kernel.json"), "utf8"))).toHaveProperty("schemas");
          await expect(readFile(join(live, "obsolete.js"))).rejects.toMatchObject({ code: "ENOENT" });
        }
        await rename(source, destination);
      },
    });
    expect(JSON.parse(await readFile(join(live, DEV_BUILD_STAMP_NAME), "utf8"))).toEqual(evidence);
  } finally { await rm(root, { recursive: true, force: true }); }
});
