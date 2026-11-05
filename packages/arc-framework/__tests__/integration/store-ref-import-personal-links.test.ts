/** Personal import follows only links represented in its selected notes snapshot. */
import { mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createRefStore, OwnerIdentitySchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { importFixture, saveImportPersonal } from "../helpers/store/import-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

it("imports a saved linked file and reports its followed link without blocking landing", async context => {
  const h = await importFixture(), root = join(h.root, ".arc/user/andrew"), target = join(h.root, "linked-memo.md");
  await mkdir(root, { recursive: true });
  await writeFile(target, "Saved through the link.\n");
  try { await symlink(target, join(root, "memo.md"), "file"); }
  catch (error) {
    if (error instanceof Error && "code" in error && ["EPERM", "EACCES", "ENOSYS"].includes(String(error.code))) {
      context.skip("File links are unavailable on this platform"); return;
    }
    throw error;
  }
  await saveImportPersonal(h.root, false);
  const imported = await h.migrate();
  expect(imported).toMatchObject({ status: "ok", result: { differingNotes: [], notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringMatching(/followed personal link andrew\/memo\.md/iu) }),
  ]) } });
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "scratch/memo.md" });
  expect(success(await createRefStore(h.ports).read({ reference })).content).toBe("Saved through the link.\n");
}, 30_000);

it("refuses a linked workspace whose disk bytes differ and imports after repair", async () => {
  const h = await importFixture(), root = join(h.root, ".arc/user/andrew"), target = join(h.root, "changed-workspace");
  await mkdir(root, { recursive: true });
  await mkdir(target);
  await writeFile(join(target, "memo.md"), "Selected notes bytes.\n");
  await symlink(target, join(root, "alpha"), "junction");
  await saveImportPersonal(h.root, false);
  await writeFile(join(target, "memo.md"), "Different disk bytes.\n");
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused", report: {
    differingNotes: [{ person: "andrew", path: "alpha/memo.md", kind: "differs" }],
  } } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/user/andrew/"])).stdout).toBe("");
  await writeFile(join(target, "memo.md"), "Selected notes bytes.\n");
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" },
    key: "scratch/work-unit/alpha/memo.md" });
  expect(success(await createRefStore(h.ports).read({ reference })).content).toBe("Selected notes bytes.\n");
}, 30_000);

it("imports a saved linked identity directory and reports its followed root", async () => {
  const h = await importFixture(), root = join(h.root, ".arc/user/andrew"), target = join(h.root, "linked-identity");
  await mkdir(root, { recursive: true });
  await rename(root, target);
  await writeFile(join(target, "memo.md"), "Saved linked identity.\n");
  await symlink(target, root, "junction");
  await saveImportPersonal(h.root, false);
  expect(await h.migrate()).toMatchObject({ status: "ok", result: { differingNotes: [], notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringMatching(/followed personal link andrew\/ at/iu) }),
  ]) } });
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "scratch/memo.md" });
  expect(success(await createRefStore(h.ports).read({ reference })).content).toBe("Saved linked identity.\n");
}, 30_000);

it("skips an unsaved linked identity directory and reports its root without reading descendants", async () => {
  const h = await importFixture(), root = join(h.root, ".arc/user"), target = join(h.root, "unsaved-identity");
  await mkdir(root, { recursive: true });
  await mkdir(target);
  await writeFile(join(target, "memo.md"), "Unsaved linked identity.\n");
  await symlink(target, join(root, "beth"), "junction");
  expect(await h.migrate()).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringMatching(/skipped personal link beth\/ at/iu) }),
  ]) } });
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "beth" }, key: "scratch/memo.md" });
  expect(await createRefStore(h.ports).read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
}, 30_000);

it("walks a linked directory cycle once and reports the skipped repeated target", async () => {
  const h = await importFixture(), root = join(h.root, ".arc/user/andrew"), target = join(h.root, "cyclic-workspace");
  await mkdir(root, { recursive: true });
  await mkdir(join(target, "loop"), { recursive: true });
  await writeFile(join(target, "memo.md"), "One imported copy.\n");
  await writeFile(join(target, "loop/old.md"), "Saved before the cycle.\n");
  await symlink(target, join(root, "alpha"), "junction");
  await saveImportPersonal(h.root, false);
  await rm(join(target, "loop"), { recursive: true });
  await symlink(target, join(target, "loop"), "junction");
  expect(await h.migrate()).toMatchObject({ status: "ok", result: { differingNotes: [], notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringMatching(/skipped personal link andrew\/alpha\/loop.*already visited/iu) }),
  ]) } });
  const store = createRefStore(h.ports), owner = OwnerIdentitySchema.parse({ type: "person", name: "andrew" });
  const listing = success(await store.list({ family: "personal", kind: "personal/document", owner }));
  expect(listing).toMatchObject({ status: "complete", records: [expect.objectContaining({ content: "One imported copy.\n" })] });
}, 30_000);

it("skips an unreadable saved link target with a nonblocking notice", async () => {
  const h = await importFixture(), root = join(h.root, ".arc/user/andrew"), target = join(h.root, "departed-workspace");
  await mkdir(root, { recursive: true });
  await mkdir(target);
  await writeFile(join(target, "memo.md"), "Saved before target removal.\n");
  await symlink(target, join(root, "alpha"), "junction");
  await saveImportPersonal(h.root, false);
  await rm(target, { recursive: true });
  expect(await h.migrate()).toMatchObject({ status: "ok", result: { differingNotes: [], notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringMatching(/skipped personal link andrew\/alpha.*cannot read/iu) }),
  ]) } });
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" },
    key: "scratch/work-unit/alpha/memo.md" });
  expect(await createRefStore(h.ports).read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
}, 30_000);

it("skips an unsaved linked tree with a notice and imports no descendants", async () => {
  const h = await importFixture(), root = join(h.root, ".arc/user/andrew"), target = join(h.root, "unsaved-tree");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "kept.md"), "Saved regular file.\n");
  await saveImportPersonal(h.root, false);
  await mkdir(target);
  await writeFile(join(target, "secret.md"), "Never saved.\n");
  await symlink(target, join(root, "node_modules"), "junction");
  expect(await h.migrate()).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringMatching(/skipped personal link andrew\/node_modules/iu) }),
  ]) } });
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" },
    key: "scratch/node_modules/secret.md" });
  expect(await createRefStore(h.ports).read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
}, 30_000);

it("imports a saved file below a linked workspace and compares its original path", async () => {
  const h = await importFixture(), root = join(h.root, ".arc/user/andrew"), target = join(h.root, "linked-workspace");
  await mkdir(root, { recursive: true });
  await mkdir(target);
  await writeFile(join(target, "memo.md"), "Saved linked workspace.\n");
  await symlink(target, join(root, "alpha"), "junction");
  await saveImportPersonal(h.root, false);
  expect(await h.migrate()).toMatchObject({ status: "ok", result: { differingNotes: [], notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringMatching(/followed personal link andrew\/alpha/iu) }),
  ]) } });
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" },
    key: "scratch/work-unit/alpha/memo.md" });
  expect(success(await createRefStore(h.ports).read({ reference })).content).toBe("Saved linked workspace.\n");
}, 30_000);
