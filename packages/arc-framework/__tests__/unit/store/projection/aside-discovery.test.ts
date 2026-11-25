/** The recovery-folder walk: which names it yields as copies, and which folders it reads for more. */
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ASIDE_FILES_ROOT, nameAsideFile, type AsideRole } from "../../../../src/lib/store/projection/aside.js";
import { walkProjectionAsideFolder, type ProjectionAsideVisit } from "../../../../src/lib/store/projection/aside-discovery.js";

const WRITER = { pid: 42, processInstance: "walk-test", processScope: "pid:[1]" };
const FILE = ".arc/backlog/planned/one/notes-one.md";
const MIRROR = `${ASIDE_FILES_ROOT}/backlog/planned/one/notes-one.md`;

let checkout: string;
beforeEach(async () => { checkout = await mkdtemp(join(tmpdir(), "arc-aside-walk-")); });
afterEach(async () => { await rm(checkout, { recursive: true, force: true }); });

/** A generated name, without the folder that mirrors its file's path. */
function generatedName(role: AsideRole): string {
  const location = nameAsideFile({ path: FILE, base: "a".repeat(40), writer: WRITER, role });
  return location.slice(location.lastIndexOf("/") + 1);
}

async function place(location: string): Promise<string> {
  await mkdir(dirname(join(checkout, location)), { recursive: true });
  await writeFile(join(checkout, location), "saved\n");
  return location;
}

async function walk(): Promise<ProjectionAsideVisit[]> {
  const visits: ProjectionAsideVisit[] = [];
  for await (const visit of walkProjectionAsideFolder(checkout)) visits.push(visit);
  return visits;
}

const copies = (visits: readonly ProjectionAsideVisit[]) => visits.filter(each => each.kind === "copy").map(each => each.location).sort();

it("yields every copy below a folder named like a staged file, and that folder after its contents", async () => {
  const folder = `${MIRROR}/${generatedName("staged")}`;
  const placed = [
    await place(`${folder}/${generatedName("aside")}`),
    await place(`${folder}/kept/${generatedName("aside")}`),
    await place(`${folder}/${generatedName("staged")}/${generatedName("aside")}`),
    await place(`${MIRROR}/${generatedName("aside")}`),
  ];
  const visits = await walk();
  expect(copies(visits)).toEqual([...placed].sort());
  const exit = visits.findIndex(each => each.kind === "directory" && each.location === folder);
  expect(visits.slice(exit + 1).filter(each => each.location.startsWith(`${folder}/`))).toEqual([]);
  expect(exit).toBeGreaterThan(0);
});

it("never yields a folder named like a staged file as a copy, so nothing deletes it as a spent one", async () => {
  const folder = `${MIRROR}/${generatedName("staged")}`;
  await mkdir(join(checkout, folder), { recursive: true });
  expect(copies(await walk())).toEqual([]);
});

it("yields a folder named like a copy as one, without reading it", async () => {
  const folder = `${MIRROR}/${generatedName("aside")}`;
  await place(`${folder}/${generatedName("aside")}`);
  const visits = await walk();
  expect(copies(visits)).toEqual([folder]);
  expect(visits).not.toContainEqual({ kind: "directory", location: folder });
});

it("yields a staged file, or a link with its name, without following the link", async () => {
  const file = await place(`${MIRROR}/${generatedName("staged")}`);
  const linked = `${MIRROR}/${generatedName("staged")}`;
  const outside = join(checkout, "outside");
  await mkdir(outside);
  await writeFile(join(outside, generatedName("aside")), "outside\n");
  await symlink(outside, join(checkout, linked), "junction");
  expect(copies(await walk())).toEqual([file, linked].sort());
});
