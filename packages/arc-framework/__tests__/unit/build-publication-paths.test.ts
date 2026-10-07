/** Publication consumes native Windows artifact keys without losing nested output. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";

vi.mock("node:path", async (importOriginal) => {
  const native = await importOriginal<typeof import("node:path")>();
  return { ...native, relative: native.win32.relative, sep: native.win32.sep };
});

import { publishStagedBuild } from "../../src/lib/build-publication.js";
import { DEV_BUILD_STAMP_NAME } from "../../src/lib/dev-check.js";
import { makeStagedBuildFixture } from "../helpers/staged-build-fixture.js";

it("publishes nested schemas and removes obsolete output with Windows relative keys", async () => {
  const { root, packageRoot, lease, staged, evidence } = makeStagedBuildFixture();
  const live = join(packageRoot, "dist");
  await writeFile(join(live, "obsolete.js"), "obsolete output");
  try {
    await publishStagedBuild(lease, staged, evidence, { checkCli: async () => {} });
    expect(await readFile(join(live, "cli.js"), "utf8")).toContain("new-staged-runtime");
    expect(JSON.parse(await readFile(join(live, "schemas", "kernel.json"), "utf8"))).toHaveProperty("schemas");
    expect(JSON.parse(await readFile(join(live, DEV_BUILD_STAMP_NAME), "utf8"))).toEqual(evidence);
    await expect(readFile(join(live, "obsolete.js"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
