/** Publication failures invalidate prior authority and retain a repaired continuation. */
import { randomUUID } from "node:crypto";
import { cp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { publishStagedBuild } from "../../src/lib/build-publication.js";
import { DEV_BUILD_STAMP_NAME } from "../../src/lib/build-evidence.js";
import { makeStagedBuildFixture } from "../helpers/staged-build-fixture.js";

it.each(["ancillary", "entry", "obsolete cleanup"])(
  "refuses failed %s publication and permits repaired publication", async (fault) => {
    const { root, packageRoot, staged, lease, evidence } = makeStagedBuildFixture();
    const live = join(packageRoot, "dist");
    const backup = join(packageRoot, ".arc-dev-build-backup");
    await cp(staged.directory, backup, { recursive: true });
    await writeFile(join(live, DEV_BUILD_STAMP_NAME), JSON.stringify({ ...evidence, generation: randomUUID() }));
    await writeFile(join(live, "obsolete.js"), "old output");
    try {
      await expect(publishStagedBuild(lease, staged, evidence, {
        checkCli: async () => {},
        rename: async (source, destination) => {
          if ((fault === "ancillary" && destination.endsWith("metafile-esm.json"))
            || (fault === "entry" && destination.endsWith("cli.js"))) {
            throw Object.assign(new Error("injected publication failure"), { code: "EIO" });
          }
          await rename(source, destination);
        },
        remove: async (file) => {
          if (fault === "obsolete cleanup" && file.endsWith("obsolete.js")) {
            throw Object.assign(new Error("injected cleanup failure"), { code: "EIO" });
          }
          await rm(file, { force: true });
        },
      })).rejects.toThrow("npm run build:fast");
      await expect(readFile(join(live, DEV_BUILD_STAMP_NAME))).rejects.toMatchObject({ code: "ENOENT" });
      await cp(backup, staged.directory, { recursive: true });
      await publishStagedBuild(lease, staged, evidence, { checkCli: async () => {} });
      expect(JSON.parse(await readFile(join(live, DEV_BUILD_STAMP_NAME), "utf8"))).toEqual(evidence);
      expect(await readFile(join(live, "cli.js"), "utf8")).toContain("new-staged-runtime");
      await expect(readFile(join(live, "obsolete.js"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(root, { recursive: true, force: true }); }
  },
);
