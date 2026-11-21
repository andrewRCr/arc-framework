/** Native retirement refuses unopened archive input before landing it, then continues after the named repair. */
import { chmod, mkdir, readFile, rename, rm, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readdirSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { releaseProjectionRemoval } from "../../../../src/lib/store/projection/removal-release.js";
import { persistProjectionRemoval } from "../../../../src/lib/store/projection/removal-persist.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { checkProjectionRemoval } from "../../../../src/lib/store/projection/removal-check.js";
import { nameAsideFile, type AsideWriterInput } from "../../../../src/lib/store/projection/aside.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { withProjectionEntry } from "../../../../src/lib/store/projection/index-memory.js";
import type { ProjectionIndex } from "../../../../src/lib/store/projection/index-schema.js";

const lateAccess = vi.hoisted(() => ({ path: "", aliasObserved: false, finalStatOnce: "" }));
vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  const lstat = (async (...args: Parameters<typeof actual.lstat>) => {
    // The projection link preflight uses ordinary stats. The alias check asks for inode identities.
    if (args[0] === lateAccess.path && args[1]?.bigint === true) lateAccess.aliasObserved = true;
    return actual.lstat(...args);
  }) as typeof actual.lstat;
  return { ...actual, lstat, default: { ...actual, lstat } };
});
vi.mock("node:fs", async original => {
  const actual = await original<typeof import("node:fs")>();
  const lstatSync = ((...args: Parameters<typeof actual.lstatSync>) => {
    if (args[0] === lateAccess.finalStatOnce) {
      lateAccess.finalStatOnce = "";
      throw Object.assign(new Error("Archive removal stat refused"), { code: "EACCES" });
    }
    if (args[0] === lateAccess.path && lateAccess.aliasObserved) {
      throw Object.assign(new Error("Archive search access revoked after alias inspection"), { code: "EACCES" });
    }
    return actual.lstatSync(...args);
  }) as typeof actual.lstatSync;
  return { ...actual, lstatSync, default: { ...actual, lstatSync } };
});

afterEach(() => { lateAccess.path = ""; lateAccess.aliasObserved = false; lateAccess.finalStatOnce = ""; beginProjectionCommand(); });

it("keeps a one-shot archive swap refusal through linked release's second check", async () => {
  const h = await archiveRetirementFixture(), file = join(h.checkout, h.path);
  const companion = `${h.folder}/z-sibling.txt`;
  const reference = recordReferences["work-item/companion"](h.primary.reference.owner, "z-sibling.txt");
  await seed(h.f, reference, "An accessible sibling.\n");
  await projectionCommand(h.input, ["status"]);
  await rm(file);
  let armed = false;
  const released = await releaseProjectionRemoval(h.checkout, false, { ...h.context, ports: checkout => ({
    ...createProjectionEnginePorts(checkout), hooks: { afterRecheck: async path => {
      if (path === h.path) { armed = true; lateAccess.finalStatOnce = file; }
    } },
  }) });
  expect(armed).toBe(true);
  expect(lateAccess.finalStatOnce).toBe("");
  expect(released).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("EACCES") } });
  const { index } = await h.disk();
  expect(index.entries[h.path]).toMatchObject({ kind: "record", pending: true });
  expect(index.entries[companion]).toBeUndefined();
  await expect(readFile(join(h.checkout, companion))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await h.retire("release")).toEqual({ kind: "released" });
}, 30_000);

it.each(["persist", "release"] as const)("%s settles an accessible copy when a different archive folder denies listing", async operation => {
  const h = await archiveRetirementFixture();
  const { location, index } = await h.disk(), writer = await createProjectionEnginePorts(h.checkout).writer();
  const active = Object.keys(index.entries).find(path => path.startsWith(".arc/active/") && path.endsWith("/meta-retiring.md"));
  if (active === undefined) throw new Error("Missing accessible record");
  const blocked = await stageRetirementCopy(h.checkout, h.path, index, writer);
  const sibling = await stageRetirementCopy(h.checkout, active, blocked.index, writer);
  await writeProjectionIndex(location, sibling.index);
  const guard = (path: string) => {
    if (path === join(h.checkout, h.folder)) throw Object.assign(new Error("Directory listing refused"), { code: "EACCES" });
  };
  const context = { ...h.context, ports: (checkout: string) => ({ ...createProjectionEnginePorts(checkout), walkFs: {
    readdir: (path: string) => { guard(path); return readdirSync(path, { withFileTypes: true }); },
    readdirNames: (path: string) => { guard(path); return readdirSync(path); },
  } }) };
  const first = operation === "persist" ? await persistProjectionRemoval(h.checkout, context)
    : await releaseProjectionRemoval(h.checkout, false, context);
  expect(first).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("EACCES") } });
  const pending = (await h.disk()).index;
  expect(pending.entries[h.path]).toMatchObject({ copies: [{ name: blocked.name }] });
  expect(pending.entries[active]).toMatchObject({ copies: [] });
  await expect(readFile(join(h.checkout, blocked.name))).resolves.toBeInstanceOf(Buffer);
  await expect(readFile(join(h.checkout, sibling.name))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await h.retire(operation)).toEqual({ kind: operation === "persist" ? "persisted" : "released" });
}, 30_000);

it.each(["edited", "unmade"] as const)("finishes a healthy retirement copy when a destination of an %s copy loses access", async state => {
  const h = await archiveRetirementFixture();
  const first = state === "edited" ? h.path : `${h.folder}/a-first.txt`;
  const sibling = `${h.folder}/z-sibling.txt`;
  const siblingReference = recordReferences["work-item/companion"](h.primary.reference.owner, "z-sibling.txt");
  if (state === "unmade") await seed(h.f, recordReferences["work-item/companion"](h.primary.reference.owner, "a-first.txt"), "First file.\n");
  await seed(h.f, siblingReference, "A sibling file.\n");
  await projectionCommand(h.input, ["status"]);
  const { location, index } = await h.disk();
  const writer = await createProjectionEnginePorts(h.checkout).writer();
  const blocked = await stageRetirementCopy(h.checkout, first, index, writer,
    state === "edited" ? "An edit held in the first copy.\n" : undefined);
  const healthy = await stageRetirementCopy(h.checkout, sibling, blocked.index, writer);
  const entry = healthy.index.entries[first];
  if (entry?.kind !== "record") throw new Error("Missing planned retirement copy");
  const inProgress = state === "unmade" ? { replaces: entry.base, copy: blocked.name } : entry.inProgress;
  if (state === "unmade") await rename(join(h.checkout, blocked.name), join(h.checkout, first));
  await writeProjectionIndex(location, withProjectionEntry(healthy.index, first, { ...entry, inProgress }));
  const held = await persistProjectionRemoval(h.checkout, { ...h.context, hooks: { beforeAsideCopy: async (_checkout, path) => {
    if (path === first) lateAccess.path = join(h.checkout, path);
  } } });
  expect(lateAccess.aliasObserved).toBe(true);
  expect(held).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("EACCES") } });
  if (state === "edited") expect(await readFile(join(h.checkout, blocked.name), "utf8")).toContain("An edit held in the first copy.");
  expect((await h.disk()).index.entries[first]).toMatchObject({ opened: true, copies: [expect.objectContaining({ name: blocked.name })],
    inProgress });
  expect((await h.disk()).index.entries[sibling]).toMatchObject({ copies: [] });
  await expect(readFile(join(h.checkout, healthy.name))).rejects.toMatchObject({ code: "ENOENT" });

  lateAccess.path = "";
  expect(await h.retire("persist")).toEqual({ kind: "persisted" });
  if (state === "edited") {
    expect(success(await h.store.read({ reference: h.primary.reference })).content).toContain("An edit held in the first copy.");
  } else expect((await h.disk()).index.entries[first]).toMatchObject({ copies: [] });
}, 30_000);

async function stageRetirementCopy(checkout: string, path: string, index: ProjectionIndex, writer: AsideWriterInput, edit?: string) {
  const entry = index.entries[path];
  if (entry?.kind !== "record") throw new Error("Missing archive entry for retirement copy");
  const file = join(checkout, path), bytes = await readFile(file);
  const name = nameAsideFile({ path, base: entry.base.blob, writer, role: "aside" });
  const copy = join(checkout, name);
  await mkdir(dirname(copy), { recursive: true });
  await rename(file, copy);
  if (edit !== undefined) { await chmod(copy, 0o644); await writeFile(copy, Buffer.concat([bytes, Buffer.from(edit)])); }
  const copied = { ...entry, pending: true, opened: true as const, copies: [
    { name, moving: gitBlobId(bytes, "sha1"), linked: null, landed: null, writeBackSent: false,
      rendering: { markers: entry.markers, notices: entry.notices } },
  ] };
  return { name, index: withProjectionEntry(index, path, copied) };
}

it.each(["persist", "release"] as const)("refuses a late closed archive correction during %s", async operation => {
  const h = await archiveRetirementFixture(), absolute = join(h.checkout, h.path);
  const before = success(await h.store.read({ reference: h.primary.reference }));
  const content = h.primary.content + "\nAn archive correction saved during retirement.\n";
  let changed = false;
  const edit = async () => {
    if (changed) return;
    changed = true;
    await h.write(h.path, content);
  };
  const retired = operation === "persist"
    ? await persistProjectionRemoval(h.checkout, { ...h.context, hooks: { afterFileSelection: edit } })
    : await releaseProjectionRemoval(h.checkout, false, { ...h.context, ports: checkout => ({ ...createProjectionEnginePorts(checkout),
      hooks: { afterRecheck: path => path === h.path ? edit() : Promise.resolve() } }) });
  expect(changed).toBe(true);
  expect(retired).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining(`arc edit ${h.path} then arc save`) } });
  expect(success(await h.store.read({ reference: h.primary.reference }))).toMatchObject({ content: before.content, version: before.version });
  expect(await readFile(absolute, "utf8")).toContain(content);
  expect(await h.retire(operation)).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining(`arc edit ${h.path} then arc save`) } });
  const saved = await projectionCommand(h.input, ["save"]);
  expect(success(await h.store.read({ reference: h.primary.reference }))).toMatchObject({ content: before.content, version: before.version });
  expect(await readFile(absolute, "utf8")).toContain(content);
  expect(saved.diagnostics).toContain(`arc edit ${h.path} then arc save`);
  await h.openAndSave(h.path);
  expect(await h.retire(operation)).toEqual({ kind: operation === "persist" ? "persisted" : "released" });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
}, 30_000);

it.each(["persist", "release"] as const)("%s retains a lost-index edit until deletion and explicit reapplication", async operation => {
  const h = await archiveRetirementFixture(), file = join(h.checkout, h.path);
  expect((await projectionCommand(h.input, ["edit", file])).result).toMatchObject({ status: "ok" });
  const content = h.primary.content + "\nAn edit retained through retirement and index loss.\n";
  await h.write(h.path, content);
  const bytes = await readFile(file, "utf8");
  await rm(join((await h.disk()).location.stateDir, "index"));
  expect((await projectionCommand(h.input, ["status"])).result).toMatchObject({ kind: "ready" });
  expect((await h.disk()).index.entries[h.path]).toMatchObject({ withheld: true });
  const result = await h.retire(operation);
  expect(result).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("delete") } });
  if (result.kind !== "refused") throw new Error("No withheld-file repair");
  expect(result.remedy.text).toContain(`arc edit ${h.path}`);
  expect(await readFile(file, "utf8")).toBe(bytes);
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(h.primary.content);
  await rm(file);
  await projectionCommand(h.input, ["status"]);
  await h.openAndSave(h.path, content);
  expect(await h.retire(operation)).toEqual({ kind: operation === "persist" ? "persisted" : "released" });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
}, 30_000);

it.each(["remove", "release"] as const)("passes the %s check once a withheld archived file is deleted", async disposition => {
  const h = await archiveRetirementFixture(), file = join(h.checkout, h.path);
  expect((await projectionCommand(h.input, ["edit", file])).result).toMatchObject({ status: "ok" });
  await h.write(h.path, h.primary.content + "\nAn edit withheld through index loss.\n");
  await rm(join((await h.disk()).location.stateDir, "index"));
  expect((await projectionCommand(h.input, ["status"])).result).toMatchObject({ kind: "ready" });
  expect((await h.disk()).index.entries[h.path]).toMatchObject({ withheld: true });
  expect(await checkProjectionRemoval(h.checkout, h.context, disposition)).toMatchObject({ kind: "would-refuse",
    remedy: { text: expect.stringContaining("delete the withheld file") } });
  // Persist and release discard the entry of a withheld file that is gone, so the check that predicts them passes.
  await rm(file);
  expect(await checkProjectionRemoval(h.checkout, h.context, disposition)).toEqual({ kind: "passes" });
  expect(await h.retire(disposition === "remove" ? "persist" : "release")).toEqual({ kind: disposition === "remove" ? "persisted" : "released" });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(h.primary.content);
}, 30_000);

it("excludes every unopened archive input while reporting the first refusal", async () => {
  const h = await archiveRetirementFixture(), path = `${h.folder}/z-second-correction.md`;
  const before = success(await h.store.read({ reference: h.primary.reference }));
  await h.write(h.path, h.primary.content + "\nA forced first correction.\n");
  await h.write(path, "A new second correction.\n");
  const refused = await h.retire("persist");
  // The first selected path's refusal is the answer, naming that path and its opening remedy.
  expect(refused).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining(`arc edit ${h.path} then arc save`) } });
  if (refused.kind !== "refused") throw new Error("No archive retirement remedy");
  expect(refused.remedy.text).not.toContain(path);
  expect(success(await h.store.read({ reference: h.primary.reference }))).toMatchObject({ content: before.content, version: before.version });
  expect(await h.store.read({ reference: recordReferences["work-item/companion"](h.primary.reference.owner, "z-second-correction.md") }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(await readFile(join(h.checkout, h.path), "utf8")).toContain("A forced first correction.");
  expect(await readFile(join(h.checkout, path), "utf8")).toBe("A new second correction.\n");
}, 30_000);

const noEdit = (["persist", "release"] as const).flatMap(operation => (["absent", "empty"] as const).map(state => ({ operation, state })));
it.each(noEdit)("$operation preserves the stored version when an opened archive is left $state", async ({ operation, state }) => {
  const h = await archiveRetirementFixture(), file = join(h.checkout, h.path);
  expect((await projectionCommand(h.input, ["edit", file])).result).toMatchObject({ status: "ok" });
  const before = success(await h.store.read({ reference: h.primary.reference }));
  if (state === "absent") await rm(file);
  else { await writeFile(file, ""); await utimes(file, new Date(0), new Date(0)); }
  const result = await h.retire(operation);
  if (operation === "release" && state === "empty") {
    // Release's new empty swap copy waits for the next command even though the settled original held no edit.
    expect(result).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("Release already removed projected files") } });
    const disk = await h.disk(), entry = disk.index.entries[h.path];
    if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("No retained empty release copy");
    expect(disk.index.state).toBeNull();
    expect(await readFile(join(h.checkout, entry.copies[0].name), "utf8")).toBe("");
    expect((await projectionCommand(h.input, ["save"])).result).toMatchObject({ status: "ok" });
    expect(await h.retire(operation)).toEqual({ kind: "released" });
  } else expect(result).toEqual({ kind: operation === "persist" ? "persisted" : "released" });
  expect(success(await h.store.read({ reference: h.primary.reference }))).toMatchObject({ content: before.content, version: before.version });
}, 30_000);

it("drops a deleted opened new archive entry before linked release completes", async () => {
  const h = await archiveRetirementFixture(), path = `${h.folder}/deleted-opening.md`;
  await h.write(path, "A new file that will not be kept.\n");
  expect((await projectionCommand(h.input, ["edit", join(h.checkout, path)])).result).toMatchObject({ status: "ok" });
  expect((await h.disk()).index.entries[path]).toMatchObject({ opened: true });
  await rm(join(h.checkout, path));
  let observedDrop = false;
  const result = await releaseProjectionRemoval(h.checkout, false, { ...h.context, hooks: { beforeLastCheck: async () => {
    expect((await h.disk()).index.entries).not.toHaveProperty(path);
    observedDrop = true;
  } } });
  expect(result).toEqual({ kind: "released" });
  expect(observedDrop).toBe(true);
  expect(await h.store.read({ reference: recordReferences["work-item/companion"](h.primary.reference.owner, "deleted-opening.md") }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
}, 30_000);

const opened = (["persist", "release"] as const).flatMap(operation => (["existing", "new"] as const).map(kind => ({ operation, kind })));
it.each(opened)("$operation lands an opened $kind archive file without a preceding save", async ({ operation, kind }) => {
  const h = await archiveRetirementFixture();
  const path = kind === "existing" ? h.path : `${h.folder}/opened-correction.md`;
  const reference = kind === "existing" ? h.primary.reference : recordReferences["work-item/companion"](h.primary.reference.owner, "opened-correction.md");
  if (kind === "new") await h.write(path, "A new correction basis.\n");
  expect((await projectionCommand(h.input, ["edit", join(h.checkout, path)])).result).toMatchObject({ status: "ok" });
  const content = kind === "existing" ? h.primary.content + "\nAn opened correction.\n" : "An adopted opened correction.\n";
  await h.write(path, content);
  expect(await h.retire(operation)).toEqual({ kind: operation === "persist" ? "persisted" : "released" });
  expect(success(await h.store.read({ reference })).content).toBe(content);
  if (operation === "release") await expect(readFile(join(h.checkout, path))).rejects.toMatchObject({ code: "ENOENT" });
}, 30_000);

it("holds the primary's release over a forced archive edit until edit and save there", async () => {
  const h = await archiveRetirementFixture(), checkout = h.f.root;
  const content = h.primary.content + "\nA primary archive correction.\n";
  await h.write(h.path, content, checkout);
  const bytes = await readFile(join(checkout, h.path), "utf8");
  expect(await h.retire("release", checkout)).toMatchObject({ kind: "refused", remedy: {
    text: expect.stringContaining(`arc edit ${h.path}`),
  } });
  expect(await readFile(join(checkout, h.path), "utf8")).toBe(bytes);
  expect(success(await h.f.store.read({ reference: h.primary.reference })).content).toBe(h.primary.content);
  await h.openAndSave(h.path, undefined, checkout);
  expect(await h.retire("release", checkout)).toEqual({ kind: "released" });
  expect(success(await h.f.store.read({ reference: h.primary.reference })).content).toBe(content);
  expect(await readFile(join(checkout, h.path), "utf8")).toContain("A primary archive correction.");
}, 30_000);

const blocked = (["persist", "release"] as const).flatMap(operation => (["forced", "new"] as const)
  .flatMap(kind => (["primary", "target"] as const).map(caller => ({ operation, kind, caller }))));

it.each(blocked)("$operation keeps an unopened $kind file unchanged when called from $caller", async ({ operation, kind, caller }) => {
  const h = await archiveRetirementFixture();
  const path = kind === "forced" ? h.path : `${h.folder}/new-correction.md`;
  const reference = kind === "forced" ? h.primary.reference : recordReferences["work-item/companion"](h.primary.reference.owner, "new-correction.md");
  const content = kind === "forced" ? h.primary.content + "\nA forced correction.\n" : "A new archived correction.\n";
  const before = await h.store.read({ reference });
  await h.write(path, content);
  const bytes = await readFile(join(h.checkout, path), "utf8");
  const refused = await h.retire(operation, h.checkout, caller === "primary" ? h.f.root : h.checkout);
  expect(refused).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining(`arc edit ${path}`) } });
  if (refused.kind !== "refused") throw new Error("No archive retirement remedy");
  expect(refused.remedy.text).toContain("arc save");
  expect(refused.remedy.text).toContain(h.checkout);
  expect(await readFile(join(h.checkout, path), "utf8")).toBe(bytes);
  expect(await h.store.read({ reference })).toEqual(before);
  await h.openAndSave(path);
  expect(success(await h.store.read({ reference })).content).toBe(content);
  expect(await h.retire(operation)).toEqual({ kind: operation === "persist" ? "persisted" : "released" });
  if (operation === "release") await expect(readFile(join(h.checkout, path))).rejects.toMatchObject({ code: "ENOENT" });
}, 30_000);
