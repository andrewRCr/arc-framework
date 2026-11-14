/** Digests follow native import acquisitions across a real notes save and physical checkout edits. */
import { mkdir, writeFile, realpath, symlink, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { expect, it } from "vitest";
import { checkFixture } from "../helpers/cutover-window/check.js";
import { readWindowHold } from "../../src/scripts/cutover-window/hold.js";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { saveImportPersonal } from "../helpers/store/import-fixture.js";
import { runWindow } from "../../src/scripts/cutover-window/main.js";
import { createWindowImportContext } from "../../src/scripts/cutover-window/import-context.js";
import { readWindowCheckouts } from "../../src/scripts/cutover-window/checkouts.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { resolveRepositoryIdentity } from "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import { resolveGitCommonDir } from "../../src/lib/git/exec.js";
import { readWindowPersonalState, readWindowReviewDigest, type WindowPersonalState } from "../../src/scripts/cutover-window/digests.js";

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

async function observeReview(h: Awaited<ReturnType<typeof windowFixture>>) {
  let digest: string | undefined;
  const stdout: string[] = [], stderr: string[] = [];
  const exit = await runWindow(["inspect", "--repo", h.root, "--json"], { inspect: async ({ repo }) => {
    digest = await readWindowReviewDigest(await createWindowImportContext(repo));
    return { operation: "inspect", status: "reported", findings: [], data: { digest } };
  } }, { stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); } });
  return { exit, digest, result: JSON.parse(stdout.join("")) as unknown, report: stderr.join("") };
}

it("changes the review digest when a review-gate file arrives or its raw bytes change", async () => {
  const h = await windowFixture();
  const before = await observeReview(h);
  expect(before, before.report).toMatchObject({ exit: 0, digest: expect.stringMatching(/^[a-f0-9]{64}$/u) });
  const gate = join(await resolveGitCommonDir(h.git, h.root), "arc/review-gate/materializations");
  await mkdir(gate, { recursive: true });
  const path = join(gate, "source.bin");
  await writeFile(path, Buffer.from([0, 255, 1]));
  const added = await observeReview(h);
  expect(added.exit, added.report).toBe(0);
  expect(added.digest).not.toBe(before.digest);
  await writeFile(path, Buffer.from([0, 254, 1]));
  const edited = await observeReview(h);
  expect(edited.exit, edited.report).toBe(0);
  expect(edited.digest).not.toBe(added.digest);
}, 30_000);

it("keeps the review digest unchanged when the repository identity is minted", async () => {
  const h = await windowFixture();
  const before = await observeReview(h);
  expect(before.exit, before.report).toBe(0);
  await resolveRepositoryIdentity(new RepositoryGitCommonStatePublisher(h.git, h.root));
  const after = await observeReview(h);
  expect(after.exit, after.report).toBe(0);
  expect(after.digest).toBe(before.digest);
}, 30_000);

it("refuses an unreadable review gate and reads it after access is repaired", async () => {
  const h = await windowFixture();
  const gate = join(await resolveGitCommonDir(h.git, h.root), "arc/review-gate");
  await mkdir(dirname(gate), { recursive: true });
  await writeFile(gate, "A file prevents inventorying the gate directory.\n");
  const failed = await observeReview(h);
  expect(failed, failed.report).toMatchObject({ exit: 1, digest: undefined, result: { status: "refused", findings: [
    expect.objectContaining({ subject: "review gate", condition: expect.stringContaining("Cannot inventory"),
      remedy: "Restore access to the review gate's files, then retry." }),
  ] } });
  await rm(gate);
  await mkdir(gate);
  const repaired = await observeReview(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, digest: expect.stringMatching(/^[a-f0-9]{64}$/u) });
}, 30_000);

it("stores the acquired personal and review-gate digests in the completed window record", async () => {
  const h = await windowFixture();
  const personal = await observePersonal(h);
  const review = await observeReview(h);
  expect(review.exit, review.report).toBe(0);
  const checked = await checkFixture(h);
  expect(checked, checked.report).toMatchObject({ exit: 0, result: { status: "passed" } });
  const held = await readWindowHold({ repo: h.root, exec: h.git, execInput: h.ports.execInput });
  expect(held.record).toMatchObject({ reviewGateDigest: review.digest,
    worktrees: [{ path: personal.primary, personalDigest: personal.digests[personal.primary] }],
  });
}, 30_000);
