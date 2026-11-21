import { mkdir, readFile, rename, rm, symlink, writeFile, lstat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { prepareSwap } from "../../../helpers/store/projection/swap-fixture.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";

it("classifies every child of an opaque directory even when a descendant retry overlaps it", async () => {
  const h = await archiveRetirementFixture();
  const { index, location } = await h.disk();
  const scope = h.folder + "/owed", link = scope + "/children", known = link + "/known.md", extra = link + "/extra.md";
  const saved = join(h.checkout, "retained-directory"), destination = join(h.checkout, link);
  await mkdir(saved);
  await writeFile(join(saved, "known.md"), "Known edit.\n");
  await writeFile(join(saved, "extra.md"), "Other edit.\n");
  await mkdir(dirname(destination), { recursive: true });
  await symlink(saved, destination, "junction");
  await writeProjectionIndex(location, { ...index, state: null, archiveDiscoveryPending: [scope, known] });
  await projectionCommand(h.input, ["status"]);
  const waiting = (await h.disk()).index.archiveDiscoveryPending;
  await rm(destination);
  await rename(saved, destination);
  await projectionCommand(h.input, ["status"]);
  const settled = (await h.disk()).index;
  expect(settled.entries[known]).toMatchObject({ withheld: true });
  expect(settled.entries[extra], JSON.stringify({ waiting, state: settled.state })).toMatchObject({ withheld: true });
});

it("resumes a still-present recovery alias after a directory link is repaired", async () => {
  const h = await archiveRetirementFixture();
  const { location, index } = await h.disk();
  const folder = h.folder + "/later", path = folder + "/edit.md", dest = join(h.checkout, folder);
  const saved = join(h.checkout, "directory-to-restore"), edit = "An edit in the remaining alias.\n";
  const writer = { ...await createProjectionEnginePorts(h.checkout).writer(), processInstance: "exited-probe" };
  const copy = nameAsideFile({ path, base: gitBlobId("Base.\n", "sha1"), writer, role: "aside" });
  await mkdir(dirname(join(h.checkout, copy)), { recursive: true });
  await writeFile(join(h.checkout, copy), edit);
  await mkdir(saved);
  await symlink(saved, dest, "junction");
  await writeProjectionIndex(location, { ...index, state: null, archiveRecoveryCopies: [copy] });
  await projectionCommand(h.input, ["status"]);
  const waiting = (await h.disk()).index;
  await rm(dest);
  await rename(saved, dest);
  await projectionCommand(h.input, ["status"]);
  const settled = (await h.disk()).index;
  expect(settled.entries[path], JSON.stringify({ retries: waiting.archiveRecoveryCopies, withheld: waiting.withheldCopies, state: settled.state })).toMatchObject({ withheld: true });
  expect(await readFile(join(h.checkout, path), "utf8")).toBe(edit);
});

it("preserves an owed child when a directory arrives between recheck and rename", async () => {
  const h = await prepareSwap({ path: ".arc/completed/2026-q4/01_alpha/meta-alpha.md" });
  try {
    const owed = h.path + "/child.md";
    const result = await h.swap({ index: { ...h.seeded.index, state: null, archiveDiscoveryPending: [owed] },
      hooks: { afterRecheck: async () => {
        await rename(h.file, h.file + ".original");
        await mkdir(h.file);
        await writeFile(join(h.file, "child.md"), "Child edit.\n");
      } } });
    expect((await lstat(h.file)).isDirectory(), JSON.stringify({ copies: result.copies, unreplaced: result.unreplaced })).toBe(true);
    expect(await readFile(join(h.file, "child.md"), "utf8")).toBe("Child edit.\n");
  } finally { await removeGitBackedDirs([h.seeded.checkout]); }
});
