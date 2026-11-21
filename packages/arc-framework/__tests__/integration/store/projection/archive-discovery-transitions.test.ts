import { lstatSync, readdirSync, renameSync } from "node:fs";
import { mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";

it.each([false, true])("reclassifies an owed file found to be a directory at final inventory (indexed=%s)", async indexed => {
  const h = await archiveRetirementFixture(), { index, location } = await h.disk();
  const path = indexed ? h.path : `${h.folder}/owed`;
  const absolute = join(h.checkout, path), replacement = join(h.checkout, "replacement-directory");
  const oldFile = join(h.checkout, "original-file");
  await mkdir(replacement);
  await writeFile(join(replacement, "child.md"), "An unindexed edit.\n");
  if (!indexed) await writeFile(absolute, "First physical kind.\n");
  await writeProjectionIndex(location, { ...index, state: null, archiveDiscoveryPending: [path] });
  let transitioned = false;
  const input = { ...h.input, ports: () => ({ ...createProjectionEnginePorts(h.checkout), walkFs: {
    readdir: (path: string) => readdirSync(path, { withFileTypes: true }),
    lstat: (path: string) => {
      const observed = lstatSync(path);
      if (path === absolute && !transitioned) {
        transitioned = true;
        renameSync(absolute, oldFile);
        renameSync(replacement, absolute);
      }
      return observed;
    },
  } }) };
  await projectionCommand(input, ["status"]);
  expect(transitioned).toBe(true);
  expect((await h.disk()).index).toMatchObject({ archiveDiscoveryPending: [path], archiveDiscoveryDirectories: [path], state: null });
  if (indexed) {
    await rename(absolute, replacement);
    await symlink(replacement, absolute, "junction");
    await projectionCommand(h.input, ["status"]);
    expect(lstatSync(absolute).isSymbolicLink()).toBe(true);
    expect((await h.disk()).index).toMatchObject({ archiveDiscoveryPending: [path], archiveDiscoveryDirectories: [path], state: null });
    await rm(absolute);
    await rename(replacement, absolute);
  }
  await projectionCommand(h.input, ["status"]);
  const settled = (await h.disk()).index;
  expect(settled.entries[`${path}/child.md`]).toMatchObject({ withheld: true });
  expect(settled.archiveDiscoveryDirectories).toBeUndefined();
}, 30_000);

it("keeps an alias retry when its scaffold was skipped and restores the file after repair", async () => {
  const h = await archiveRetirementFixture(), { index, location } = await h.disk();
  const path = h.folder + "/hidden-return.txt", content = "Recovery copy holding the edit.\n";
  const writer = { ...await createProjectionEnginePorts(h.checkout).writer(), processInstance: "old-writer" };
  const copy = nameAsideFile({ path, base: gitBlobId("Earlier.\n", "sha1"), writer, role: "aside" });
  const aside = join(h.checkout, copy), folder = dirname(aside), saved = join(h.checkout, "temporarily-unavailable-directory");
  await mkdir(folder, { recursive: true });
  await writeFile(aside, content);
  await rename(folder, saved);
  await symlink(saved, folder, "junction");
  await writeProjectionIndex(location, { ...index, state: null, archiveRecoveryCopies: [copy] });
  await projectionCommand(h.input, ["status"]);
  const during = (await h.disk()).index;
  expect(during).toMatchObject({ archiveRecoveryCopies: [copy], state: null });
  await rm(folder);
  await rename(saved, folder);
  await projectionCommand(h.input, ["status"]);
  const settled = (await h.disk()).index;
  expect(settled.entries[path]).toMatchObject({ withheld: true });
  expect(await readFile(join(h.checkout, path), "utf8")).toBe(content);
});
