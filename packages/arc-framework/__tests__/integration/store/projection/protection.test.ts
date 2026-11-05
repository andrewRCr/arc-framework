/** Protection is laid with winning staged bytes and re-observed when an edit persists. */
import { chmod, lstat, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { scanRegisteredWorktrees } from "../../../../src/lib/git/worktree-roster.js";
import { resolveWorktreeMarkerPath, writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { createProjectionProtection } from "../../../../src/lib/store/projection/protection.js";
import { createRecordRenderer } from "../../../../src/lib/store/projection/record-render.js";
import { stageRecordFile } from "../../../../src/lib/store/projection/staging.js";
import { guardReplacement } from "../../../../src/lib/store/projection/replace-guard.js";
import { createWriteBackPort } from "../../../../src/lib/store/projection/write-back.js";
import { swapBatch } from "../../../../src/lib/store/projection/swap.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { startProjection } from "../../../../src/lib/store/projection/engine.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { createLifecycleHarness } from "../../../helpers/store/lifecycle-harness.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { configureEngineCheckout } from "../../../helpers/store/projection/engine-fixture.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { createClashDouble } from "../../../helpers/store/clash-double.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function fixture(extension = "md") {
  const h = createLifecycleHarness();
  const record = await h.seedMeta("subject", { owner: "alice" });
  const path = `.arc/active/in-flight/subject/meta-subject.${extension}`;
  const view = await seedProjection({ store: h.store, identity: SlugSchema.parse("alice"), files: [{ reference: record.reference, path }] });
  directories.push(view.checkout);
  const exec = await configureEngineCheckout(view.checkout);
  await exec("git", ["config", "arc.identity", "alice"], { cwd: view.checkout });
  await exec("git", ["commit", "--allow-empty", "-m", "Seed protection fixture"], { cwd: view.checkout });
  const holder = join(view.checkout, ".holders", "subject");
  await exec("git", ["worktree", "add", "-b", "feat/subject", holder], { cwd: view.checkout });
  await writeWorktreeMarker(holder, { spawnedByArc: false, spawningIdentity: "alice",
    createdAt: "2026-10-24T00:00:00Z", createdFor: boundWorkUnitSubject(record) });
  const roster = await scanRegisteredWorktrees((command, args, options) => exec(command, args, { cwd: view.checkout, ...options }));
  const nativeHolder = roster.ok ? roster.worktrees.find(row => resolve(row.path) === resolve(holder))?.path : undefined;
  if (nativeHolder === undefined) throw new Error("The native roster omitted the holder fixture");
  const writer = { pid: process.pid, processScope: "protection-fixture", processInstance: "protection-fixture" };
  const context = { store: h.store, location: view.location, format: "sha1" as const, actor: "alice@fixture", writer,
    protection: createProjectionProtection({ store: h.store, checkout: view.checkout, identity: SlugSchema.parse("alice"), exec }) };
  return { ...h, ...view, record, path, holder: nativeHolder, context, exec,
    file: () => readFile(join(view.checkout, path), "utf8") };
}

async function refresh(h: Awaited<ReturnType<typeof fixture>>) {
  const entry = h.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("The seeded entry is missing");
  const renderer = createRecordRenderer(h.context);
  const staged = success(await stageRecordFile({ ...h.context, checkout: h.checkout, path: h.path, record: h.record,
    replacing: entry.base.blob, renderer, readOnly: entry.protected }));
  const takeIn = createWriteBackPort(h.context);
  const replace = await guardReplacement({ ...h.context, checkout: h.checkout, path: h.path, entry, staged, renderer, takeIn, reference: null });
  if (replace.kind !== "replace") throw new Error("The protection refresh was not admitted");
  return swapBatch({ ...h.context, checkout: h.checkout, index: h.index, files: [{ path: h.path, replace }], readBack: false, takeIn });
}

async function saveInHolder(h: Awaited<ReturnType<typeof fixture>>, bytes: string) {
  await seedProjection({ store: h.store, identity: SlugSchema.parse("alice"), checkout: h.holder,
    files: [{ reference: h.record.reference, path: h.path }] });
  await writeFile(join(h.holder, ".gitignore"), ".arc/user/*/\n");
  await mkdir(join(h.holder, ".arc/user"), { recursive: true });
  await writeFile(join(h.holder, ".arc/user/.npmignore"), "*\n");
  await writeFile(join(h.holder, h.path), bytes);
  await startProjection({ store: h.store, checkout: h.holder });
}

it("installs a protected meta read-only with its native holding checkout named beside the stamp", async () => {
  const h = await fixture();
  const installed = await refresh(h);
  const file = await h.file();
  expect((await lstat(join(h.checkout, h.path))).mode & 0o222).toBe(0);
  expect(file).toContain("Code generated by ARC. DO NOT EDIT.");
  expect(parseStampedFile(file).notices.join("\n")).toContain(h.holder);
  expect(parseStampedFile(file).content).toBe(h.record.content);
  expect(installed.index.entries[h.path]).toMatchObject({ protected: true });
});

it("refuses a forced edit naming the live holding checkout and accepts the same edit there", async () => {
  const h = await fixture();
  await refresh(h);
  const original = parseStampedFile(await h.file());
  if (original.stamp === null) throw new Error("The protected meta lost its base stamp");
  const content = h.record.content + "\nIndependent note.\n";
  const bytes = renderStampedFile({ content, stamp: original.stamp });
  await chmod(join(h.checkout, h.path), 0o644);
  await writeFile(join(h.checkout, h.path), bytes);
  await startProjection({ store: h.store, checkout: h.checkout });
  expect(success(await h.store.read({ reference: h.record.reference })).content).toBe(h.record.content);
  expect(await h.file()).toBe(bytes);
  expect(projectionProcessState().diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: h.path, mark: expect.objectContaining({ remedy: { text: expect.stringContaining(h.holder) } }) }),
  ]));
  await saveInHolder(h, bytes);
  expect(success(await h.store.read({ reference: h.record.reference })).content).toBe(content);
});

it("names materialization when no checkout holds the record and follows a repaired holder", async () => {
  const h = await fixture();
  await rm(resolveWorktreeMarkerPath(h.holder));
  const mark = await h.context.protection(h.record);
  expect(mark).toMatchObject({ remedy: { text: expect.stringContaining("arc materialize subject"), argv: ["arc", "materialize", "subject"] } });
  await refresh(h);
  expect(parseStampedFile(await h.file()).notices.join("\n")).toContain("arc materialize subject");
  await writeWorktreeMarker(h.holder, { spawnedByArc: false, spawningIdentity: "alice",
    createdAt: "2026-10-24T00:00:00Z", createdFor: boundWorkUnitSubject(h.record) });
  expect(await h.context.protection(h.record)).toMatchObject({ remedy: { text: expect.stringContaining(h.holder) } });
});

it("offers materialization in the native markerless checkout on the exact owner's linked branch", async () => {
  const h = await fixture();
  const project = await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project" })), "{}");
  if (!("uid" in project.reference.owner) || project.reference.owner.uid === undefined) throw new Error("No project UID");
  success(await h.store.write({ action: "put", reference: h.record.reference, expected: h.record.version, content: h.record.content,
    placement: { kind: "active" }, links: { branches: [{ repository: project.reference.owner.uid, ref: "feat/subject", linkedAs: "adopted", excluded: [] }] },
    provenance: { verb: "link", lifecycleAction: "edit" } }));
  await rm(resolveWorktreeMarkerPath(h.holder));
  expect(await h.context.protection(h.record)).toMatchObject({ remedy: {
    text: expect.stringContaining(h.holder), argv: ["arc", "materialize", "subject", "--here"],
  } });
  await refresh(h);
  expect(parseStampedFile(await h.file()).notices.join("\n")).toContain("arc materialize subject --here");
  await writeWorktreeMarker(h.holder, { spawnedByArc: false, spawningIdentity: "alice",
    createdAt: "2026-10-24T00:00:00Z", createdFor: boundWorkUnitSubject(h.record) });
  expect(await h.context.protection(h.record)).toMatchObject({ remedy: { text: expect.stringContaining("arc save there") } });
});

it("keeps an unbound holder's recovery exits in its protection notice and follows its repaired marker", async () => {
  const h = await fixture();
  await writeWorktreeMarker(h.holder, { spawnedByArc: false, spawningIdentity: "alice",
    createdAt: "2026-10-24T00:00:00Z", createdFor: { kind: "work-unit", name: "subject" } });
  expect(await h.context.protection(h.record)).toMatchObject({ reason: expect.stringContaining("unbound"), remedy: {
    text: expect.stringContaining("arc materialize subject --here"), argv: ["arc", "materialize", "subject", "--here"],
  } });
  await refresh(h);
  const notice = parseStampedFile(await h.file()).notices.join("\n");
  expect(notice).toContain(h.holder);
  expect(notice).toContain("arc materialize subject --here");
  await writeWorktreeMarker(h.holder, { spawnedByArc: false, spawningIdentity: "alice",
    createdAt: "2026-10-24T00:00:00Z", createdFor: boundWorkUnitSubject(h.record) });
  expect(await h.context.protection(h.record)).toMatchObject({ remedy: { text: expect.stringContaining("arc save there") } });
});

it.each(["duplicate", "malformed"] as const)("keeps %s holder repair evidence in the notice until repaired", async defect => {
  const h = await fixture();
  const extra = join(h.checkout, ".holders", "duplicate");
  if (defect === "duplicate") {
    await h.exec("git", ["worktree", "add", "-b", "feat/duplicate", extra], { cwd: h.checkout });
    await writeWorktreeMarker(extra, { spawnedByArc: false, spawningIdentity: "alice",
      createdAt: "2026-10-24T00:00:00Z", createdFor: boundWorkUnitSubject(h.record) });
  } else await writeFile(resolveWorktreeMarkerPath(h.holder), "broken marker JSON");
  const condition = defect === "duplicate" ? "multiple marker holders" : "Cannot read checkout";
  const mark = await h.context.protection(h.record);
  expect(mark).toMatchObject({ reason: expect.stringContaining(condition), remedy: { text: expect.stringContaining("repair") } });
  expect(mark?.reason).toContain(h.holder);
  await refresh(h);
  expect(parseStampedFile(await h.file()).notices.join("\n")).toContain(condition);
  expect((await lstat(join(h.checkout, h.path))).mode & 0o222).toBe(0);
  if (defect === "duplicate") await rm(resolveWorktreeMarkerPath(extra));
  else await writeWorktreeMarker(h.holder, { spawnedByArc: false, spawningIdentity: "alice",
    createdAt: "2026-10-24T00:00:00Z", createdFor: boundWorkUnitSubject(h.record) });
  expect(await h.context.protection(h.record)).toMatchObject({ remedy: { text: expect.stringContaining("arc save there") } });
});

it("names a present holder for another identity and otherwise names the person owner", async () => {
  const h = await fixture();
  const protection = createProjectionProtection({ store: h.store, checkout: h.checkout, identity: SlugSchema.parse("bob"), exec: h.exec });
  expect(await protection(h.record)).toMatchObject({ reason: expect.stringContaining("alice"),
    remedy: { text: expect.stringContaining(h.holder) } });
  await rm(resolveWorktreeMarkerPath(h.holder));
  const mark = await protection(h.record);
  expect(mark).toMatchObject({ reason: expect.stringContaining("alice"), remedy: { text: expect.stringContaining("alice") } });
  expect(mark?.remedy.text).not.toContain("arc materialize");
});

it("protects a stampless file by mode and live persist refusal without adding a notice", async () => {
  const h = await fixture("txt");
  const installed = await refresh(h);
  expect((await lstat(join(h.checkout, h.path))).mode & 0o222).toBe(0);
  expect(await h.file()).toBe(h.record.content);
  expect(installed.index.entries[h.path]).toMatchObject({ protected: true });
  const content = h.record.content + "\nStampless correction.\n";
  await chmod(join(h.checkout, h.path), 0o644);
  await writeFile(join(h.checkout, h.path), content);
  await startProjection({ store: h.store, checkout: h.checkout });
  expect(success(await h.store.read({ reference: h.record.reference })).content).toBe(h.record.content);
  expect(await h.file()).toBe(content);
  expect(projectionProcessState().diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: h.path, mark: expect.objectContaining({ remedy: { text: expect.stringContaining(h.holder) } }) }),
  ]));
  await saveInHolder(h, content);
  expect(success(await h.store.read({ reference: h.record.reference })).content).toBe(content);
  expect(await readFile(join(h.holder, h.path), "utf8")).toBe(content);
});

it("restages writable bytes and clears protection after checkout ownership is repaired during the guard", async () => {
  const h = await fixture();
  const installed = await refresh(h);
  const entry = installed.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("The protected entry disappeared");
  const renderer = createRecordRenderer(h.context);
  const staged = success(await stageRecordFile({ ...h.context, checkout: h.checkout, path: h.path, record: h.record,
    replacing: entry.base.blob, renderer, readOnly: entry.protected }));
  expect(staged.rendering?.protected).toBe(true);
  await rm(resolveWorktreeMarkerPath(h.holder));
  await writeWorktreeMarker(h.checkout, { spawnedByArc: false, spawningIdentity: "alice",
    createdAt: "2026-10-24T00:00:00Z", createdFor: boundWorkUnitSubject(h.record) });
  const parsed = parseStampedFile(await h.file());
  if (parsed.stamp === null) throw new Error("The protected file lost its stamp");
  const content = h.record.content + "\nCorrection during guard.\n";
  await chmod(join(h.checkout, h.path), 0o644);
  await writeFile(join(h.checkout, h.path), renderStampedFile({ content, stamp: parsed.stamp }));
  const takeIn = createWriteBackPort(h.context);
  const replace = await guardReplacement({ ...h.context, checkout: h.checkout, path: h.path, entry, staged, renderer, takeIn, reference: null });
  if (replace.kind !== "replace") throw new Error("The repaired checkout could not replace its file");
  const updated = await swapBatch({ ...h.context, checkout: h.checkout, index: installed.index,
    files: [{ path: h.path, replace }], readBack: false, takeIn });
  expect(updated.index.entries[h.path]).toMatchObject({ protected: false });
  expect((await lstat(join(h.checkout, h.path))).mode & 0o222).not.toBe(0);
  expect(parseStampedFile(await h.file())).toMatchObject({ content, notices: [] });
  expect(success(await h.store.read({ reference: h.record.reference })).content).toBe(content);
});

it("does not borrow a same-named generation's markerless branch", async () => {
  const h = await fixture();
  const project = await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project" })), "{}");
  if (!("uid" in project.reference.owner) || project.reference.owner.uid === undefined) throw new Error("No project UID");
  const sibling = await h.seedMeta("sibling", { owner: "alice" }, { kind: "active" }, { branches: [{
    repository: project.reference.owner.uid, ref: "feat/subject", linkedAs: "adopted", excluded: [],
  }] });
  const store = createClashDouble(h.store, { slug: "shared", holders: [h.record.reference, sibling.reference] });
  const first = success(await store.read({ reference: h.record.reference }));
  const second = success(await store.read({ reference: sibling.reference }));
  await rm(resolveWorktreeMarkerPath(h.holder));
  const protection = createProjectionProtection({ store, checkout: h.checkout, identity: SlugSchema.parse("alice"), exec: h.exec });
  expect(await protection(first)).toMatchObject({ remedy: { argv: ["arc", "materialize", "shared"] } });
  expect(await protection(second)).toMatchObject({ remedy: {
    argv: ["arc", "materialize", "shared", "--here"], text: expect.stringContaining(h.holder),
  } });
});

it.each(["failed", "incomplete"] as const)("keeps a %s roster's repair instead of inventing a destination", async defect => {
  const h = await fixture();
  let broken = true;
  const protection = createProjectionProtection({ store: h.store, checkout: h.checkout, identity: SlugSchema.parse("alice"),
    exec: async (command, args, options) => {
      if (broken && args[0] === "worktree" && args[1] === "list") {
        if (defect === "failed") throw new Error("Worktree listing unavailable");
        return { stdout: "", stderr: "" };
      }
      return h.exec(command, args, options);
    } });
  const mark = await protection(h.record);
  expect(mark).toMatchObject({ reason: expect.stringContaining(defect === "failed" ? "Worktree listing unavailable" : "listing is incomplete"),
    remedy: { text: expect.stringContaining("repair") } });
  expect(mark?.remedy.text).not.toContain("arc materialize");
  broken = false;
  expect(await protection(h.record)).toMatchObject({ remedy: { text: expect.stringContaining(h.holder) } });
});

it("refuses two registrations for one canonical markerless checkout and succeeds after roster repair", async () => {
  const h = await fixture();
  const project = await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project" })), "{}");
  if (!("uid" in project.reference.owner) || project.reference.owner.uid === undefined) throw new Error("No project UID");
  success(await h.store.write({ action: "put", reference: h.record.reference, expected: h.record.version, content: h.record.content,
    placement: { kind: "active" }, links: { branches: [{ repository: project.reference.owner.uid, ref: "feat/subject", linkedAs: "adopted", excluded: [] }] },
    provenance: { verb: "link", lifecycleAction: "edit" } }));
  await rm(resolveWorktreeMarkerPath(h.holder));
  const alias = join(h.checkout, ".holders", "alias");
  await symlink(h.holder, alias, "junction");
  let duplicate = true;
  const protection = createProjectionProtection({ store: h.store, checkout: h.checkout, identity: SlugSchema.parse("alice"),
    exec: async (command, args, options) => {
      const result = await h.exec(command, args, options);
      if (!duplicate || args[0] !== "worktree" || args[1] !== "list") return result;
      const stanza = result.stdout.split("\0\0").find(part => part.startsWith("worktree ")
        && resolve(part.slice("worktree ".length).split("\0")[0] ?? "") === resolve(h.holder));
      if (stanza === undefined) throw new Error("The real roster omitted its linked checkout");
      const protocolAlias = process.platform === "win32" ? alias.replaceAll("\\", "/") : alias;
      return { ...result, stdout: result.stdout + stanza.replace(/^worktree [^\0]+/u, `worktree ${protocolAlias}`) + "\0\0" };
    } });
  expect(await protection(h.record)).toMatchObject({ reason: expect.stringContaining("Duplicate registrations"),
    remedy: { text: expect.stringContaining("repair") } });
  duplicate = false;
  expect(await protection(h.record)).toMatchObject({ remedy: { argv: ["arc", "materialize", "subject", "--here"] } });
});

it.each([
  { protected: false, rebuild: false }, { protected: true, rebuild: false },
  { protected: false, rebuild: true }, { protected: true, rebuild: true },
])("keeps the original protection when an editor wins a swap (%j)", async scenario => {
  const h = await fixture();
  const index = scenario.protected ? (await refresh(h)).index : h.index;
  const entry = index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("The original entry disappeared");
  if (scenario.protected) {
    await rm(resolveWorktreeMarkerPath(h.holder));
    await writeWorktreeMarker(h.checkout, { spawnedByArc: false, spawningIdentity: "alice",
      createdAt: "2026-10-24T00:00:00Z", createdFor: boundWorkUnitSubject(h.record) });
  }
  const renderer = createRecordRenderer(h.context);
  const staged = success(await stageRecordFile({ ...h.context, checkout: h.checkout, path: h.path, record: h.record,
    replacing: entry.base.blob, renderer, readOnly: entry.protected }));
  expect(staged.rendering?.protected).toBe(!scenario.protected);
  if (scenario.rebuild) await rm(join(h.checkout, h.path));
  const takeIn = createWriteBackPort(h.context);
  const replace = await guardReplacement({ ...h.context, checkout: h.checkout, path: h.path, entry, staged, renderer, takeIn, reference: null });
  if (replace.kind !== "replace") throw new Error("The staged replacement was not admitted");
  const bytes = renderStampedFile({ content: h.record.content + "\nEditor wins.\n", stamp: entry.base.blob });
  const save = async () => { await writeFile(join(h.checkout, h.path), bytes); };
  const swapped = await swapBatch({ ...h.context, checkout: h.checkout, index,
    files: [{ path: h.path, replace }], readBack: false, takeIn,
    hooks: scenario.rebuild ? { beforeRebuildLink: save } : { afterMove: save } });
  expect(await h.file()).toBe(bytes);
  expect(swapped.index.entries[h.path]).toMatchObject({ protected: scenario.protected, pending: true,
    base: entry.base, written: entry.written });
});
