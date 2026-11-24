/** Sync identifies unopened archive corrections without landing or adopting their authored bytes. */
import { chmod, readFile, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { inspectArchivedProjectionFile } from "../../../../src/lib/store/projection/archive-inspection.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";

afterEach(() => { beginProjectionCommand(); });

async function fixture(owner = "andrew") {
  const h = await createAdoptionFixture({ owner, placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  const input = { store: h.f.store, checkout: h.f.root };
  expect((await projectionCommand(input, ["status"])).result).toMatchObject({ kind: "ready" });
  const path = Object.keys(h.projected.index.entries)[0]!, absolute = join(h.f.root, path);
  return { ...h, input, path, absolute };
}

it.each(["andrew", "bob"])("names a forced edit with the remedy for owner %s without taking it in", async owner => {
  const h = await fixture(owner), before = await readFile(h.absolute, "utf8");
  await chmod(h.absolute, 0o644);
  const edited = before + "\nA correction made through read-only mode.\n";
  await writeFile(h.absolute, edited);
  const report = await projectionCommand(h.input, ["sync"]);
  expect(report.exitCode).toBe(0);
  expect(report.diagnostics).toContain(h.path);
  if (owner === "andrew") {
    expect(report.diagnostics).toContain(`arc edit ${h.path}`);
    expect(report.diagnostics).toContain("arc save");
    expect(report.diagnostics).toContain(h.f.root);
  } else expect(report.diagnostics).toContain("Have bob apply the edit");
  expect(await readFile(h.absolute, "utf8")).toBe(edited);
  expect(success(await h.f.store.read({ reference: h.primary.reference })).content).toBe(h.primary.content);
}, 30_000);

it("names an indexed forced edit omitted from the restoration inventory", async () => {
  const h = await fixture();
  const content = (await readFile(h.absolute, "utf8")) + "\nA correction missing from the inventory.\n";
  await chmod(h.absolute, 0o644);
  await writeFile(h.absolute, content);
  const store = overrideEngineStore(h.f.store, { list: async request => request.family === "work-item" && request.asOf !== undefined
    ? { status: "ok", result: { status: "unreadable", condition: "The work-item inventory is unavailable.",
      remedy: { text: "Restore the inventory." } } }
    : h.f.store.list(request) });
  const report = await projectionCommand({ ...h.input, store }, ["sync"]);
  expect(report.diagnostics).toContain("The work-item inventory is unavailable.");
  expect(report.diagnostics).toContain(`arc edit ${h.path} then arc save`);
  expect(await readFile(h.absolute, "utf8")).toBe(content);
  expect(success(await h.f.store.read({ reference: h.primary.reference })).content).toBe(h.primary.content);
}, 30_000);

it("skips editor and folder side files and retains the walk's symbolic-link report", async () => {
  const h = await fixture(), link = `${h.folder}/linked.md`;
  await writeFile(join(h.f.root, `${h.folder}/meta-alpha.md~`), "Editor side file.\n");
  await writeFile(join(h.f.root, `${h.folder}/.DS_Store`), "Folder side file.\n");
  const before = await readFile(h.absolute, "utf8");
  await symlink(h.absolute, join(h.f.root, link), "file");
  const report = await projectionCommand(h.input, ["sync"]);
  expect(report.diagnostics).not.toContain("meta-alpha.md~");
  expect(report.diagnostics).not.toContain(".DS_Store");
  expect(report.diagnostics).toContain(link);
  expect(report.diagnostics).toContain("symbolic link");
  expect(report.diagnostics).not.toContain(`arc edit ${link}`);
  expect(await readFile(h.absolute, "utf8")).toBe(before);
}, 30_000);

it("restores Markdown emptied past the settle window without reporting a forced edit", async () => {
  const h = await fixture();
  await chmod(h.absolute, 0o644);
  await writeFile(h.absolute, "");
  const old = new Date(Date.now() - 1_000); await utimes(h.absolute, old, old);
  const report = await projectionCommand(h.input, ["sync"]);
  expect(report.diagnostics).not.toContain(`arc edit ${h.path}`);
  expect(report.diagnostics).not.toContain("edited without opening");
  expect(await readFile(h.absolute, "utf8")).toContain(h.primary.content);
  expect(success(await h.f.store.read({ reference: h.primary.reference })).content).toBe(h.primary.content);
}, 30_000);

it.each(["refused", "rejected", "missing"])("keeps %s ownership evidence unobservable before any archive remedy", async mode => {
  const h = await fixture();
  await chmod(h.absolute, 0o644);
  await writeFile(h.absolute, (await readFile(h.absolute, "utf8")) + "\nA forced correction.\n");
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  const root = projectionProcessState().roots.get(h.f.root);
  if (disk.kind !== "index" || root === undefined) throw new Error("Missing native projection");
  const boundary = createRefusingStore(h.f.store);
  boundary.refuse("read", mode === "missing"
    ? { code: "not-found", class: "recoverable", reference: h.primary.reference,
      condition: "Required ownership metadata is absent.", remedy: { text: "Restore ownership metadata." } }
    : { code: "lock-held", class: "recoverable", lock: "archive-owner",
      condition: "Ownership evidence is unavailable.", remedy: { text: "Release the owner writer." } });
  const store = mode === "rejected" ? overrideEngineStore(h.f.store, { read: async () => {
    throw new Error("Ownership evidence is unavailable.");
  } }) : boundary.store;
  const inspected = await inspectArchivedProjectionFile({ ...root, store }, disk.index, h.path);
  expect(inspected).toMatchObject({ kind: "unobservable", mark: { reason: expect.stringContaining(
    mode === "missing" ? "Required ownership metadata" : "Ownership evidence"),
  } });
  expect(inspected?.mark.remedy.text).not.toContain("arc edit");
  expect(await inspectArchivedProjectionFile(root, disk.index, h.path)).toMatchObject({ kind: "refused", mark: {
    remedy: { text: expect.stringContaining(`arc edit ${h.path}`) },
  } });
}, 30_000);

it.each(["companion", "misplaced"])("names an unindexed archived %s without adopting it", async kind => {
  const h = await fixture();
  const path = kind === "companion" ? `${h.folder}/correction.md` : ".arc/completed/new.md";
  const text = "A new archived note.\n";
  await writeFile(join(h.f.root, path), text);
  const report = await projectionCommand(h.input, ["sync"]);
  expect(report.diagnostics).toContain(path);
  if (kind === "companion") {
    expect(report.diagnostics).toContain(`arc edit ${path}`);
    expect(report.diagnostics).toContain("arc save");
    expect(await h.f.store.read({ reference: recordReferences["work-item/companion"](h.primary.reference.owner, "correction.md") }))
      .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  } else expect(report.diagnostics).toContain("Move the file into");
  expect(await readFile(join(h.f.root, path), "utf8")).toBe(text);
}, 30_000);

it("names the owner for a new file in another person's archived work unit without adopting it", async () => {
  const h = await fixture("bob"), path = `${h.folder}/correction.md`, text = "A note in another person's archived unit.\n";
  await writeFile(join(h.f.root, path), text);
  const report = await projectionCommand(h.input, ["sync"]);
  expect(report.exitCode).toBe(0);
  expect(report.diagnostics).toContain(path);
  expect(report.diagnostics).toContain("Have bob apply the edit");
  expect(report.diagnostics).not.toContain(`arc edit ${path}`);
  expect(await h.f.store.read({ reference: recordReferences["work-item/companion"](h.primary.reference.owner, "correction.md") }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(await readFile(join(h.f.root, path), "utf8")).toBe(text);
}, 30_000);

it.each(["owner", "record", "inventory"])("retains the first unavailable %s observation for a new archive file", async failed => {
  const h = await fixture(), path = `${h.folder}/unadopted.md`;
  await writeFile(join(h.f.root, path), "Unadopted archive content.\n");
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  const root = projectionProcessState().roots.get(h.f.root);
  if (disk.kind !== "index" || root === undefined) throw new Error("Missing native projection");
  const store = overrideEngineStore(h.f.store, { list: async input => failed === "inventory" ? { status: "refused", refusal: {
    code: "lock-held", class: "recoverable", lock: "archive-list",
    condition: "Archive inventory observation failed.", remedy: { text: "Release the inventory reader and retry." },
  } } : h.f.store.list(input), read: async input => {
    const kind = input.reference.kind;
    if (failed === "owner" && kind === "work-item/meta" || kind === "work-item/companion") return { status: "refused", refusal: {
      code: "lock-held", class: "recoverable", lock: "archive-read",
      condition: kind === "work-item/meta" ? "First ownership observation failed." : "Later record observation failed.",
      remedy: { text: "Release the named reader and retry." },
    } };
    return h.f.store.read(input);
  } });
  expect(await inspectArchivedProjectionFile({ ...root, store }, disk.index, path)).toMatchObject({ kind: "unobservable", mark: {
    reason: expect.stringContaining(failed === "owner" ? "First ownership observation"
      : failed === "inventory" ? "Archive inventory observation" : "Later record observation"),
  } });
  expect(await inspectArchivedProjectionFile(root, disk.index, path)).toMatchObject({ kind: "refused", mark: {
    remedy: { text: expect.stringContaining(`arc edit ${path}`) },
  } });
  expect(await h.f.store.read({ reference: recordReferences["work-item/companion"](h.primary.reference.owner, "unadopted.md") }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
}, 30_000);
