/** Failed target observations never become local edit refusals during retirement feasibility. */
import { mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from "vitest";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { resolveWorktreeMarkerPath } from "../../../../src/lib/git/worktree-marker.js";
import { checkProjectionRemoval } from "../../../../src/lib/store/projection/removal-check.js";
import { PROJECTION_INDEX_FILE, readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { createWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { initializeEngineCheckout, overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { stageRecordFile } from "../../../../src/lib/store/projection/staging.js";
import { guardReplacement } from "../../../../src/lib/store/projection/replace-guard.js";
import { readReference } from "../../../../src/lib/store/projection/change-detection.js";
import { swapBatch } from "../../../../src/lib/store/projection/swap.js";
import { ASIDE_FILES_ROOT, parseAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import type { TakeInPort } from "../../../../src/lib/store/projection/take-in-port.js";

const access = vi.hoisted(() => ({ path: "", denied: false }));
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const readFile = (async (...args: Parameters<typeof actual.readFile>) => {
    if (access.denied && args[0] === access.path) throw Object.assign(new Error(`EACCES: permission denied, open '${access.path}'`),
      { code: "EACCES", path: access.path, syscall: "open" });
    return actual.readFile(...args);
  }) as typeof actual.readFile;
  return { ...actual, readFile, default: { ...actual, readFile } };
});
function resetMockDefaults(): void { vi.resetAllMocks(); access.path = ""; access.denied = false; }
beforeEach(resetMockDefaults);
afterEach(resetMockDefaults);

async function interruptedCopy() {
  const h = await createWriteBackFixture({ identity: "andrew" });
  onTestFinished(h.dispose);
  await initializeEngineCheckout(h.checkout);
  const takeIn: TakeInPort = async request => ({ answer: "deferred", entry: request.entry });
  const staged = success(await stageRecordFile({ ...h.context, checkout: h.checkout, path: h.path,
    record: success(await h.store.read({ reference: h.entry.reference })), replacing: h.entry.base.blob }));
  const replace = await guardReplacement({ ...h.context, checkout: h.checkout, path: h.path, entry: h.entry,
    staged, reference: await readReference(h.checkout), takeIn });
  if (replace.kind !== "replace") throw new Error("Read-failure copy replacement refused");
  const stop = new Error("stop before link");
  await expect(swapBatch({ ...h.context, checkout: h.checkout, index: h.index, files: [{ path: h.path, replace }],
    readBack: false, takeIn, hooks: { afterMove: async () => { throw stop; } } })).rejects.toBe(stop);
  const disk = await readProjectionIndex(h.location, true, { groups: "all" });
  const entry = disk.kind === "index" ? disk.index.entries[h.path] : undefined;
  const copy = entry?.kind === "record" ? entry.copies[0] : undefined;
  if (copy === undefined) throw new Error("No recorded read-failure copy");
  return { h, copy };
}

it.each(["file", "index", "marker"] as const)("keeps an unreadable projected %s unobservable until the read is repaired", async source => {
  const { f, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const path = Object.keys(projected.index.entries)[0];
  if (path === undefined) throw new Error("No projected metadata");
  access.path = source === "file" ? join(f.root, path) : source === "index"
    ? join(projected.location.stateDir, PROJECTION_INDEX_FILE) : resolveWorktreeMarkerPath(f.root);
  const original = await readFile(access.path);
  access.denied = true;
  expect(await checkProjectionRemoval(f.root, { store: f.store, identity: SlugSchema.parse("andrew") })).toMatchObject({
    kind: "unobservable", detail: expect.stringContaining(f.root),
  });
  access.denied = false;
  expect(await checkProjectionRemoval(f.root, { store: f.store, identity: SlugSchema.parse("andrew") })).toEqual({ kind: "passes" });
  expect(await readFile(access.path)).toEqual(original);
});

it("keeps a failed target configuration read unobservable until Git can read it again", async () => {
  const { f } = await createAdoptionFixture();
  let denied = true;
  const native = createProjectionEnginePorts(f.root);
  const context = { store: f.store, identity: SlugSchema.parse("andrew"), ports: () => ({ ...native,
    exec: (...args: Parameters<typeof native.exec>) => {
      if (denied && args[1][0] === "config") throw new Error("Target configuration cannot be read");
      return native.exec(...args);
    } }) };
  expect(await checkProjectionRemoval(f.root, context)).toMatchObject({ kind: "unobservable",
    detail: expect.stringContaining("Target configuration cannot be read") });
  denied = false;
  expect(await checkProjectionRemoval(f.root, context)).toEqual({ kind: "passes" });
});

it("requires repairing an index from another format before checking its projected files", async () => {
  const { f, projected } = await createAdoptionFixture();
  const path = join(projected.location.stateDir, PROJECTION_INDEX_FILE), original = await readFile(path, "utf8");
  const index = JSON.parse(original) as { format: number };
  await writeFile(path, JSON.stringify({ ...index, format: index.format + 1 }));
  expect(await checkProjectionRemoval(f.root, { store: f.store, identity: SlugSchema.parse("andrew") })).toMatchObject({
    kind: "unobservable", detail: expect.stringContaining(f.root),
  });
  await writeFile(path, original);
  expect(await checkProjectionRemoval(f.root, { store: f.store, identity: SlugSchema.parse("andrew") })).toEqual({ kind: "passes" });
});

it("keeps a marker corrupted after binding unobservable at admission capture", async () => {
  const { f, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const path = Object.keys(projected.index.entries)[0];
  if (path === undefined) throw new Error("No projected metadata");
  const before = parseStampedFile(await readFile(join(f.root, path), "utf8"));
  if (before.stamp === null) throw new Error("The projected metadata has no base stamp");
  await writeFile(join(f.root, path), renderStampedFile({ content: `${before.content}\nA valid hand edit.\n`, stamp: before.stamp }));
  const marker = resolveWorktreeMarkerPath(f.root), original = await readFile(marker);
  const native = createProjectionEnginePorts(f.root);
  let configurations = 0;
  const context = { store: f.store, identity: SlugSchema.parse("andrew"), ports: () => ({ ...native,
    exec: (...args: Parameters<typeof native.exec>) => {
      if (args[1][0] === "config" && ++configurations === 2) writeFileSync(marker, "Malformed marker during capture\n");
      return native.exec(...args);
    } }) };
  expect(await checkProjectionRemoval(f.root, context)).toMatchObject({ kind: "unobservable" });
  await writeFile(marker, original);
  expect(await checkProjectionRemoval(f.root, context)).toEqual({ kind: "passes" });
});

it("never reads a recorded copy through a linked aside ancestor", async () => {
  const { h, copy } = await interruptedCopy();
  const folder = join(h.checkout, ASIDE_FILES_ROOT), saved = join(h.checkout, "saved-asides");
  await rename(folder, saved);
  await symlink(saved, folder, "junction");
  access.path = join(h.checkout, copy.name); access.denied = true;
  const context = { store: h.store, identity: SlugSchema.parse("andrew") };
  expect(await checkProjectionRemoval(h.checkout, context)).toEqual({ kind: "passes" });
  access.denied = false;
  await rm(folder);
  await rename(saved, folder);
  expect(await checkProjectionRemoval(h.checkout, context)).toEqual({ kind: "passes" });
});

it("holds an edited regular copy outside a linked destination without reading that destination", async () => {
  const { h, copy } = await interruptedCopy();
  const base = parseAsideFile(copy.name)?.base;
  if (base === undefined) throw new Error("No destination-link copy base");
  await writeFile(join(h.checkout, copy.name), renderStampedFile({ content: "A saved aside edit.\n", stamp: base }));
  const folder = dirname(join(h.checkout, h.path)), saved = join(h.checkout, "saved-destination");
  await rename(folder, saved);
  const externalFile = join(saved, basename(h.path)), bytes = "External destination bytes.\n";
  await writeFile(externalFile, bytes);
  await symlink(saved, folder, "junction");
  access.path = join(h.checkout, h.path); access.denied = true;
  const context = { store: h.store, identity: SlugSchema.parse("andrew") };
  expect(await checkProjectionRemoval(h.checkout, context)).toMatchObject({ kind: "would-refuse",
    remedy: { text: expect.stringContaining(copy.name) } });
  access.denied = false;
  expect(await readFile(externalFile, "utf8")).toBe(bytes);
  await rm(folder);
  await rm(externalFile);
  await rename(saved, folder);
  expect(await checkProjectionRemoval(h.checkout, context)).toEqual({ kind: "passes" });
});

it.each([true, false])("ignores a symbolic link at indexed=%s without reading its target", async indexed => {
  const { f, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const metadata = Object.keys(projected.index.entries)[0];
  if (metadata === undefined) throw new Error("No projected metadata");
  const path = indexed ? metadata : ".arc/user/andrew/scratch/linked.md";
  const original = indexed ? await readFile(join(f.root, path)) : null;
  if (indexed) await rm(join(f.root, path));
  const target = join(f.root, "external-editor-buffer.md"), bytes = "External editor bytes.\n";
  await writeFile(target, bytes);
  await mkdir(dirname(join(f.root, path)), { recursive: true });
  await symlink(target, join(f.root, path), "file");
  access.path = join(f.root, path); access.denied = true;
  const context = { store: f.store, identity: SlugSchema.parse("andrew") };
  expect(await checkProjectionRemoval(f.root, context)).toEqual({ kind: "passes" });
  access.denied = false;
  expect(await readFile(target, "utf8")).toBe(bytes);
  await rm(join(f.root, path));
  if (original !== null) await writeFile(join(f.root, path), original);
  expect(await checkProjectionRemoval(f.root, context)).toEqual({ kind: "passes" });
});

it("keeps unreadable prospective metadata unobservable until it can be read", async () => {
  const { f } = await createAdoptionFixture();
  const folder = join(f.root, ".arc/backlog/planned/prospective");
  await mkdir(folder, { recursive: true });
  access.path = join(folder, "meta-prospective.md");
  await writeFile(access.path, makeMetaFixture("prospective", { owner: "andrew", state: "Planning", workClass: "Light", priority: "P1",
    currentWorkflow: null }));
  await writeFile(join(folder, "notes-prospective.md"), "New owner's prose.\n");
  const context = { store: f.store, identity: SlugSchema.parse("andrew") };
  access.denied = true;
  expect(await checkProjectionRemoval(f.root, context)).toMatchObject({ kind: "unobservable",
    detail: expect.stringContaining("Restore readable metadata") });
  access.denied = false;
  expect(await checkProjectionRemoval(f.root, context)).toEqual({ kind: "passes" });
});

it("keeps an unreadable or incomplete archive listing unobservable until the inventory is restored", async () => {
  const { f } = await createAdoptionFixture();
  const path = ".arc/completed/2026-q4/01_gone/notes-gone.md";
  await mkdir(join(f.root, dirname(path)), { recursive: true });
  await writeFile(join(f.root, path), "Archived prose with no record.\n");
  let listing: "unreadable" | "incomplete" | "restored" = "unreadable";
  const store = overrideEngineStore(f.store, { list: async input => {
    const listed = await f.store.list(input);
    if (listing === "restored" || input.filter?.locations?.includes("completed") !== true || listed.status !== "ok") return listed;
    return listing === "unreadable" ? { status: "ok", result: { status: "unreadable", condition: "The archive inventory cannot be read.",
      remedy: { text: "Restore the archive inventory, then retry." } } }
      : { status: "ok", result: { status: "complete", records: listed.result.status === "complete" ? listed.result.records : [],
        diagnostics: [], missed: true } };
  } });
  const context = { store, identity: SlugSchema.parse("andrew") };
  expect(await checkProjectionRemoval(f.root, context)).toMatchObject({ kind: "unobservable" });
  listing = "incomplete";
  expect(await checkProjectionRemoval(f.root, context)).toMatchObject({ kind: "unobservable" });
  listing = "restored";
  expect(await checkProjectionRemoval(f.root, context)).toMatchObject({ kind: "would-refuse", remedy: { text: expect.stringContaining("Move the file") } });
});

it.each(["unreadable", "incomplete"] as const)("keeps a project inbox unobservable while the project identity listing is %s", async failure => {
  const { f } = await createAdoptionFixture();
  await seed(f, f.reference("project-registry/identity"));
  const path = ".arc/backlog/ATOMIC-INBOX.md";
  await mkdir(join(f.root, dirname(path)), { recursive: true });
  await writeFile(join(f.root, path), "Shared capture with no record.\n");
  let restored = false;
  const store = overrideEngineStore(f.store, { list: async input => {
    const listed = await f.store.list(input);
    if (restored || input.family !== "project-registry" || listed.status !== "ok") return listed;
    return failure === "unreadable" ? { status: "ok", result: { status: "unreadable", condition: "The project registry cannot be read.",
      remedy: { text: "Restore the project registry, then retry." } } }
      : { status: "ok", result: { status: "complete", records: listed.result.status === "complete" ? listed.result.records : [],
        diagnostics: [], missed: true } };
  } });
  const context = { store, identity: SlugSchema.parse("andrew") };
  expect(await checkProjectionRemoval(f.root, context)).toMatchObject({ kind: "unobservable" });
  restored = true;
  expect(await checkProjectionRemoval(f.root, context)).toEqual({ kind: "passes" });
});
