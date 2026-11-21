import { mkdir, writeFile, lstat, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { it, expect, vi } from "vitest";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { PROJECTION_INDEX_FILE, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
const failure = vi.hoisted(() => ({ directory: "", removedCopy: "", visits: 0 }));
vi.mock("node:fs", async original => {
  const fs = await original<typeof import("node:fs")>();
  const readdirSync = ((...args: Parameters<typeof fs.readdirSync>) => {
    if (failure.directory && args[0] === failure.directory) {
      failure.visits++;
      throw Object.assign(new Error("Cannot list one copy directory"), { code: "EACCES" });
    }
    return fs.readdirSync(...args);
  }) as typeof fs.readdirSync;
  const rmSync: typeof fs.rmSync = (path, options) => {
    fs.rmSync(path, options);
    if (path === failure.removedCopy) throw new Error("Stopped after returning an unnamed archive copy");
  };
  return { ...fs, readdirSync, rmSync, default: { ...fs, readdirSync, rmSync } };
});

it("settles accessible recovery copies when enumeration of a sibling copy directory is refused", async () => {
  const h = await archiveRetirementFixture(), { index, location } = await h.disk();
  const writer = { ...await createProjectionEnginePorts(h.checkout).writer(), processInstance: "exited-probe" };
  const content = "Edit from copy.\n";
  const copyName = (name: string) => nameAsideFile({ path: `${h.folder}/${name}`,
    base: gitBlobId("Base.\n", "sha1"), writer, role: "aside" });
  const copies = [copyName("held.md"), copyName("sibling.md")] as const;
  for (const copy of copies) {
    await mkdir(dirname(join(h.checkout, copy)), { recursive: true });
    await writeFile(join(h.checkout, copy), content);
  }
  await writeProjectionIndex(location, { ...index, state: null, archiveRecoveryCopies: [...copies] });
  failure.directory = dirname(join(h.checkout, copies[0]));
  try {
    const { diagnostics } = await projectionCommand(h.input, ["status"]);
    expect(failure.visits).toBeGreaterThan(0);
    expect(await lstat(join(h.checkout, copies[0]))).toBeDefined();
    expect(diagnostics).toContain("Repair access");
    await expect(lstat(join(h.checkout, copies[1]))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await h.disk()).index.archiveRecoveryCopies).toEqual([copies[0]]);
  } finally { failure.directory = ""; }
  await projectionCommand(h.input, ["status"]);
  expect(await readFile(join(h.checkout, h.folder, "held.md"), "utf8")).toBe(content);
  expect((await h.disk()).index.archiveRecoveryCopies).toBeUndefined();
});

it("resumes an unnamed archive copy after rebuild and a second damaged index", async () => {
  const h = await archiveRetirementFixture(), { location } = await h.disk();
  const path = `${h.folder}/unseen.txt`, content = "An edit behind an unreadable copy directory.\n";
  const writer = { ...await createProjectionEnginePorts(h.checkout).writer(), processInstance: "exited-unseen-copy" };
  const copy = nameAsideFile({ path, base: gitBlobId("Original.\n", "sha1"), writer, role: "aside" });
  const absolute = join(h.checkout, copy), header = join(location.stateDir, PROJECTION_INDEX_FILE);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
  await rm(header);
  failure.directory = dirname(absolute);
  try {
    await projectionCommand(h.input, ["status"]);
    expect((await h.disk()).index).toMatchObject({ archiveCopyPending: [{ path, unindexed: true }], state: null });
    const { groups } = JSON.parse(await readFile(header, "utf8")) as { groups: Record<string, { name: string }> };
    const archived = Object.entries(groups).find(([key]) => key.startsWith(".arc/completed/"));
    expect(archived).toBeDefined();
    await rm(join(location.stateDir, archived![1].name));
    await projectionCommand(h.input, ["status"]);
    expect((await h.disk()).index).toMatchObject({ archiveCopyPending: [{ path, unindexed: true }], state: null });
  } finally { failure.directory = ""; }
  failure.removedCopy = absolute;
  try { await projectionCommand(h.input, ["status"]).catch(() => undefined); }
  finally { failure.removedCopy = ""; }
  await expect(lstat(absolute)).rejects.toMatchObject({ code: "ENOENT" });
  expect((await h.disk()).index).toMatchObject({ archiveRecoveryCopies: [copy], state: null });
  const { diagnostics } = await projectionCommand(h.input, ["status"]);
  expect(diagnostics).toContain(`${path}: withheld`);
  expect(await readFile(join(h.checkout, path), "utf8")).toBe(content);
  await expect(lstat(absolute)).rejects.toMatchObject({ code: "ENOENT" });
  expect((await h.disk()).index).toMatchObject({ entries: { [path]: { kind: "ownerless", withheld: true } } });
  expect((await h.disk()).index.archiveCopyPending).toBeUndefined();
}, 30_000);

it("keeps an indexed-only unrecorded edit aside after its directory becomes readable", async () => {
  const h = await archiveRetirementFixture(), path = `${h.folder}/indexed-only.txt`;
  const writer = { ...await createProjectionEnginePorts(h.checkout).writer(), processInstance: "exited-indexed-only-copy" };
  const copy = nameAsideFile({ path, base: gitBlobId("Original.\n", "sha1"), writer, role: "aside" });
  const absolute = join(h.checkout, copy), content = "An unrecorded edit.\n";
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
  failure.directory = dirname(absolute);
  try {
    await projectionCommand(h.input, ["status"]);
    expect((await h.disk()).index.archiveCopyPending).toEqual([{ path }]);
  } finally { failure.directory = ""; }
  await projectionCommand(h.input, ["status"]);
  expect(await readFile(absolute, "utf8")).toBe(content);
  await expect(lstat(join(h.checkout, path))).rejects.toMatchObject({ code: "ENOENT" });
  expect((await h.disk()).index.archiveCopyPending).toBeUndefined();
});
