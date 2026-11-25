/** Personal import refuses nested Git checkouts before reading their contents and resumes after repair. */
import { mkdir, readFile, rename, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { importFixture, saveImportPersonal } from "../helpers/store/import-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

type Harness = Awaited<ReturnType<typeof importFixture>>;

function excludeSentinel(h: Harness, path: string): () => void {
  const read = h.ports.fs.readFile;
  h.ports.fs.readFile = async file => {
    if (file === path) throw new Error("Unexpected read of excluded sentinel");
    return read(file);
  };
  return () => { h.ports.fs.readFile = read; };
}

async function checkoutReport(h: Harness, path: string) {
  const result = await h.migrate();
  expect(result).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  if (result.status !== "refused" || result.refusal.code !== "import-refused") throw new Error("Expected a blocked import report");
  const report = result.refusal.report, notices = report.notices.filter(notice => /Git checkout/iu.test(notice.condition));
  expect(notices, JSON.stringify(report.notices)).toHaveLength(1);
  expect(notices[0]).toMatchObject({ condition: expect.stringContaining(path),
    remedy: { text: expect.stringMatching(/outside personal state.*remove/iu) } });
  expect(report.refused).toEqual([]);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/", "refs/arc/project/", "refs/arc/user/andrew/personal"])).stdout).toBe("");
  return report;
}

it("reports a nested Git directory once without reading it and retains its ordinary sibling", async () => {
  const h = await importFixture(), scratch = join(h.root, ".arc/user/andrew/scratch"), checkout = join(scratch, "checkout");
  await mkdir(scratch, { recursive: true });
  await h.git("git", ["init", "--initial-branch=main", checkout]);
  const sentinel = join(checkout, "sentinel.txt");
  await writeFile(sentinel, "Not personal state.\n");
  await writeFile(join(scratch, "sibling.txt"), "Ordinary personal state.\n");
  excludeSentinel(h, sentinel);
  const report = await checkoutReport(h, checkout);
  expect(report.differingNotes).toEqual([{ person: "andrew", path: "scratch/sibling.txt", kind: "disk-only" }]);
  await rename(checkout, join(h.root, "relocated-checkout"));
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "scratch/sibling.txt" });
  expect(success(await createRefStore(h.ports).read({ reference })).content).toBe("Ordinary personal state.\n");
}, 40_000);

it("keeps an unsaved link to a Git checkout as an informational skip", async () => {
  const h = await importFixture(), root = join(h.root, ".arc/user/andrew"), target = join(h.root, "unsaved-checkout");
  await mkdir(root, { recursive: true });
  await h.git("git", ["init", "--initial-branch=main", target]);
  await writeFile(join(target, "sentinel.txt"), "Not personal state.\n");
  const link = join(root, "alpha");
  await symlink(target, link, "junction");
  excludeSentinel(h, join(link, "sentinel.txt"));
  expect(await h.migrate()).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringMatching(/skipped personal link andrew\/alpha.*no selected notes path/iu) }),
  ]) } });
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "scratch/work-unit/alpha/sentinel.txt" });
  expect(await createRefStore(h.ports).read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
}, 40_000);

it("blocks a saved linked checkout once without inventing missing notes and imports after moving its entry", async () => {
  const h = await importFixture(), root = join(h.root, ".arc/user/andrew"), target = join(h.root, "linked-checkout");
  const link = join(root, "alpha"), content = "Saved personal memo.\n";
  await mkdir(root, { recursive: true });
  await mkdir(target);
  await writeFile(join(target, "memo.md"), content);
  await symlink(target, link, "junction");
  await saveImportPersonal(h.root, false);
  await h.git("git", ["init", "--initial-branch=main", target]);
  const restore = excludeSentinel(h, join(link, "memo.md"));
  const report = await checkoutReport(h, link);
  expect(report.differingNotes).toEqual([]);
  expect(report.notices.filter(notice => notice.remedy)).toHaveLength(1);
  restore();
  await rename(link, join(h.root, "relocated-personal-link"));
  await mkdir(link);
  await writeFile(join(link, "memo.md"), content);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "scratch/work-unit/alpha/memo.md" });
  expect(success(await createRefStore(h.ports).read({ reference })).content).toBe(content);
}, 40_000);

it("stops at a checkout occupying the identity root and imports after it is moved out", async () => {
  const h = await importFixture(), root = join(h.root, ".arc/user/andrew"), saved = "Saved identity memo.\n";
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "memo.md"), saved);
  await saveImportPersonal(h.root, false);
  await h.git("git", ["init", "--initial-branch=main", root]);
  const sentinel = join(root, "sentinel.txt");
  await writeFile(sentinel, "Not personal state.\n");
  excludeSentinel(h, sentinel);
  expect((await checkoutReport(h, root)).differingNotes).toEqual([]);
  await rename(root, join(h.root, "relocated-identity-checkout"));
  await mkdir(join(root, "scratch"), { recursive: true });
  await writeFile(join(root, "memo.md"), saved);
  await writeFile(join(root, "scratch/memo.txt"), "Ordinary personal state.\n");
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "scratch/memo.txt" });
  expect(success(await createRefStore(h.ports).read({ reference })).content).toBe("Ordinary personal state.\n");
}, 40_000);

it("reports a registered worktree's Git file once and resumes after git worktree move", async () => {
  const h = await importFixture(), scratch = join(h.root, ".arc/user/andrew/scratch"), checkout = join(scratch, "worktree");
  await mkdir(scratch, { recursive: true });
  await h.git("git", ["worktree", "add", "--detach", "--no-checkout", checkout, "HEAD"]);
  let current = checkout;
  try {
    expect(await readFile(join(checkout, ".git"), "utf8")).toMatch(/^gitdir: /u);
    const sentinel = join(checkout, "sentinel.txt");
    await writeFile(sentinel, "Not personal state.\n");
    await writeFile(join(scratch, "sibling.txt"), "Ordinary personal state.\n");
    excludeSentinel(h, sentinel);
    const report = await checkoutReport(h, checkout);
    expect(report.notices.find(notice => /Git checkout/iu.test(notice.condition))?.remedy?.text).toContain("git worktree move");
    expect(report.differingNotes).toEqual([{ person: "andrew", path: "scratch/sibling.txt", kind: "disk-only" }]);
    const moved = join(h.root, "relocated-worktree");
    await h.git("git", ["worktree", "move", current, moved]);
    current = moved;
    expect(await h.migrate()).toMatchObject({ status: "ok" });
  } finally { await h.git("git", ["worktree", "remove", "--force", current]); }
}, 40_000);
