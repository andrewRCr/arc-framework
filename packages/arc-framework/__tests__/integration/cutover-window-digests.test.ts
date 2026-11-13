/** Digests follow native import acquisitions across a real notes save and physical checkout edits. */
import { mkdir, writeFile, realpath, symlink } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { saveImportPersonal } from "../helpers/store/import-fixture.js";
import { runWindow } from "../../src/scripts/cutover-window/main.js";
import { createWindowImportContext } from "../../src/scripts/cutover-window/import-context.js";
import { readWindowCheckouts } from "../../src/scripts/cutover-window/checkouts.js";
import { readWindowPersonalState, type WindowPersonalState } from "../../src/scripts/cutover-window/digests.js";

async function observePersonal(h: Awaited<ReturnType<typeof windowFixture>>) {
  let state: WindowPersonalState | undefined;
  let primary: string | undefined;
  const errors: string[] = [];
  const exit = await runWindow(["inspect", "--repo", h.root, "--json"], { inspect: async ({ repo }) => {
    const context = await createWindowImportContext(repo);
    const checkouts = await readWindowCheckouts({ repo, exec: context.exec });
    primary = checkouts.find(row => row.primary)?.path;
    state = await readWindowPersonalState(context, checkouts);
    return { operation: "inspect", status: "reported", findings: [], data: state.digests };
  } }, { stdout: () => {}, stderr: value => { errors.push(value); } });
  if (exit !== 0 || state === undefined || primary === undefined) throw new Error(errors.join(""));
  return { ...state, primary };
}

it("keeps every checkout's personal digest unchanged across a real user save", async () => {
  const h = await windowFixture();
  const linked = join(h.root, ".arc-fixture/linked");
  await h.git("git", ["worktree", "add", "--detach", linked]);
  await mkdir(join(linked, ".arc/user/beth"), { recursive: true });
  await writeFile(join(linked, ".arc/user/beth/WORKING-MEMORY.md"), "# Working Memory\n\nBeth's materialization.\n");
  const before = await observePersonal(h);
  expect(Object.keys(before.digests)).toHaveLength(2);
  for (const digest of Object.values(before.digests)) expect(digest).toMatch(/^[a-f0-9]{64}$/u);
  await saveImportPersonal(h.root, false);
  expect((await observePersonal(h)).digests).toEqual(before.digests);
}, 30_000);

it("changes only the owning checkout's digest when a nested registered checkout's personal file is edited", async () => {
  const h = await windowFixture();
  const linked = join(h.root, ".arc-fixture/linked");
  await h.git("git", ["worktree", "add", "--detach", linked]);
  await mkdir(join(linked, ".arc/user/beth"), { recursive: true });
  const file = join(linked, ".arc/user/beth/WORKING-MEMORY.md");
  await writeFile(file, "# Working Memory\n\nBefore.\n");
  const before = await observePersonal(h);
  await writeFile(file, "# Working Memory\n\nAfter.\n");
  const after = await observePersonal(h);
  expect(after.digests[await realpath(linked)]).not.toBe(before.digests[await realpath(linked)]);
  expect(after.digests[before.primary]).toBe(before.digests[before.primary]);
}, 30_000);

it("changes the personal digest when a nested link is created without reading its target", async () => {
  const h = await windowFixture();
  const nested = join(h.root, ".arc/user/andrew/nested");
  const target = join(h.root, ".arc-fixture/link-target");
  await mkdir(nested, { recursive: true });
  await mkdir(target, { recursive: true });
  await writeFile(join(target, "private.md"), "The import records the link without walking this target.\n");
  const before = await observePersonal(h);
  await symlink(target, join(nested, "link"), "junction");
  const after = await observePersonal(h);
  expect(after.digests[after.primary]).not.toBe(before.digests[before.primary]);
  expect(after.disk.links).toEqual([expect.objectContaining({ path: "nested/link" })]);
  expect(after.disk.files.some(file => file.path.includes("private.md"))).toBe(false);
}, 30_000);
