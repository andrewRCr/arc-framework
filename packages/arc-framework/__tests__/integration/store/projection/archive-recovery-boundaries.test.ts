/** Copy namespace coverage and restored destinations carry independent inventory obligations. */
import { expect, it, vi } from "vitest";
import { lstatSync, readdirSync, renameSync } from "node:fs";
import { link, lstat, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { ASIDE_FILES_ROOT, nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { PROJECTION_INDEX_FILE, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { checkProjectionRemoval } from "../../../../src/lib/store/projection/removal-check.js";

const fault = vi.hoisted(() => ({ directory: "" }));
vi.mock("node:fs", async original => {
  const fs = await original<typeof import("node:fs")>();
  const readdirSync = ((...args: Parameters<typeof fs.readdirSync>) => {
    if (args[0] === fault.directory) throw Object.assign(new Error("cannot list the copy directory"), { code: "EACCES" });
    return fs.readdirSync(...args);
  }) as typeof fs.readdirSync;
  return { ...fs, readdirSync, default: { ...fs, readdirSync } };
});

const asideEdit = "An edit in the aside copy.\n";
async function setupCopy(h: Awaited<ReturnType<typeof archiveRetirementFixture>>, path: string): Promise<string> {
  const writer = { ...await createProjectionEnginePorts(h.checkout).writer(), processInstance: "retired-writer" };
  const copy = nameAsideFile({ path, base: gitBlobId("Original.\n", "sha1"), writer, role: "aside" });
  await mkdir(dirname(join(h.checkout, copy)), { recursive: true });
  await writeFile(join(h.checkout, copy), asideEdit);
  return copy;
}

it.each(["indexed", "rebuild"] as const)("classifies a regular file that replaces an owed directory during %s inventory", async route => {
  const h = await archiveRetirementFixture(), { index, location } = await h.disk();
  const path = `${h.folder}/kind-change`, file = join(h.checkout, path);
  await mkdir(file);
  await writeFile(`${file}.next`, "An edit saved as a regular file.\n");
  await writeProjectionIndex(location, { ...index, state: null, archiveDiscoveryPending: [path], archiveDiscoveryDirectories: [path] });
  if (route === "rebuild") {
    const header = JSON.parse(await readFile(join(location.stateDir, PROJECTION_INDEX_FILE), "utf8")) as {
      groups: Record<string, { name: string }>;
    };
    const archive = Object.entries(header.groups).find(([group]) => group.startsWith(".arc/completed/"));
    if (archive === undefined) throw new Error("The fixture has no archive partition");
    await rm(join(location.stateDir, archive[1].name));
  }
  let changed = false;
  const ports = () => ({ ...createProjectionEnginePorts(h.checkout), walkFs: {
    readdir: (path: string) => readdirSync(path, { withFileTypes: true }),
    lstat: (absolute: string) => {
      const stat = lstatSync(absolute);
      if (!changed && absolute === file) {
        changed = true;
        renameSync(file, `${file}.old`);
        renameSync(`${file}.next`, file);
      }
      return stat;
    },
  } });
  await projectionCommand({ ...h.input, ports }, ["status"]);
  expect(changed).toBe(true);
  const after = (await h.disk()).index;
  expect(after.entries[path]).toMatchObject({ kind: "ownerless", withheld: true });
  expect(after.archiveDiscoveryPending).toBeUndefined();
});

it.each(["indexed", "rebuild"] as const)("retains a changed alias and inventories its independently edited destination during %s", async route => {
  const h = await archiveRetirementFixture(), { index, location } = await h.disk(), path = `${h.folder}/kept.txt`;
  const copy = await setupCopy(h, path), dest = join(h.checkout, path);
  if (route === "indexed") await writeProjectionIndex(location, { ...index, state: null, archiveRecoveryCopies: [copy] });
  else await rm(join(location.stateDir, PROJECTION_INDEX_FILE));
  await link(join(h.checkout, copy), dest);
  await writeFile(`${dest}.swap`, "A second independent edit.\n");
  await rename(`${dest}.swap`, dest);

  await projectionCommand(h.input, ["status"]);
  const after = (await h.disk()).index;
  expect(await readFile(join(h.checkout, copy), "utf8")).toBe(asideEdit);
  expect(await readFile(dest, "utf8")).toBe("A second independent edit.\n");
  expect(after.withheldCopies).toContain(copy);
  expect(after.entries[path]).toMatchObject({ kind: "ownerless", withheld: true });
});

it.each(["indexed", "rebuild"] as const)("preserves an archive return with a missing parent and settles its sibling during %s", async route => {
  const h = await archiveRetirementFixture(), { index, location } = await h.disk();
  const path = `${h.folder}/zz-missing/a.txt`, sibling = `${h.folder}/aa-returned.txt`;
  const [copy, siblingCopy] = await Promise.all([setupCopy(h, path), setupCopy(h, sibling)]);
  if (route === "indexed") await writeProjectionIndex(location, { ...index, state: null, archiveRecoveryCopies: [copy, siblingCopy] });
  else await rm(join(location.stateDir, PROJECTION_INDEX_FILE));

  const { diagnostics } = await projectionCommand(h.input, ["status"]);
  expect(diagnostics).toContain(`Restore the directory ${dirname(path)}`);
  expect(await readFile(join(h.checkout, sibling), "utf8")).toBe(asideEdit);
  await expect(lstat(join(h.checkout, siblingCopy))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(h.checkout, copy), "utf8")).toBe(asideEdit);
  expect((await h.disk()).index.archiveRecoveryCopies).toEqual([copy]);

  await mkdir(dirname(join(h.checkout, path)));
  await projectionCommand(h.input, ["status"]);
  expect(await readFile(join(h.checkout, path), "utf8")).toBe(asideEdit);
  await expect(lstat(join(h.checkout, copy))).rejects.toMatchObject({ code: "ENOENT" });
  expect((await h.disk()).index).toMatchObject({ entries: { [path]: { kind: "ownerless", withheld: true } } });
  expect((await h.disk()).index.archiveRecoveryCopies).toBeUndefined();
});

it("releases a withheld active copy only after its absence is visible behind the common scaffold", async () => {
  const h = await archiveRetirementFixture(), { index, location } = await h.disk();
  const copy = await setupCopy(h, ".arc/active/retiring/held.txt");
  await writeProjectionIndex(location, { ...index, withheldCopies: [copy] });
  await rm(join(h.checkout, copy));
  fault.directory = join(h.checkout, ASIDE_FILES_ROOT);
  try {
    await projectionCommand(h.input, ["status"]);
    expect((await h.disk()).index.withheldCopies).toContain(copy);
  } finally { fault.directory = ""; }
  await projectionCommand(h.input, ["status"]);
  expect((await h.disk()).index.withheldCopies).not.toContain(copy);
});

it("holds independently known archive copies at a linked common scaffold in every retirement route", async () => {
  const h = await archiveRetirementFixture(), { index, location } = await h.disk();
  const path = `${h.folder}/owed.txt`, copy = await setupCopy(h, path);
  await writeProjectionIndex(location, { ...index, archiveRecoveryCopies: [copy] });
  const root = join(h.checkout, ASIDE_FILES_ROOT), parked = join(h.checkout, "parked-asides");
  await rename(root, parked);
  await symlink(parked, root, "junction");

  expect(await checkProjectionRemoval(h.checkout, h.context)).toMatchObject({ kind: "unobservable" });
  for (const operation of ["persist", "release"] as const) {
    expect(await h.retire(operation), operation).toMatchObject({ kind: "refused" });
  }
  expect(await readFile(join(parked, copy.slice(ASIDE_FILES_ROOT.length + 1)), "utf8")).toBe(asideEdit);
});
