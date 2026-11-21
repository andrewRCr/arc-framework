/** Native retirement refuses unopened archive input before landing it, then continues after the named repair. */
import { chmod, lstat, mkdir, readFile, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readdirSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";
import { recordReferences, sameReference, type RecordReference } from "../../../../src/lib/store/identity.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { releaseProjectionRemoval } from "../../../../src/lib/store/projection/removal-release.js";
import { persistProjectionRemoval } from "../../../../src/lib/store/projection/removal-persist.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { checkProjectionRemoval } from "../../../../src/lib/store/projection/removal-check.js";
import { ASIDE_FILES_ROOT, nameAsideFile, type AsideWriterInput } from "../../../../src/lib/store/projection/aside.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { PROJECTION_INDEX_FILE, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { withProjectionEntry } from "../../../../src/lib/store/projection/index-memory.js";
import type { ProjectionIndex } from "../../../../src/lib/store/projection/index-schema.js";

const lateAccess = vi.hoisted(() => ({ path: "", aliasObserved: false, finalStatOnce: "", authority: "", captureProbe: "",
  copyRead: "", readsUntilDenial: 0, copyUnlink: "" }));
vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  const lstat = (async (...args: Parameters<typeof actual.lstat>) => {
    if (args[0] === lateAccess.captureProbe) {
      lateAccess.captureProbe = "";
      throw Object.assign(new Error("Archive capture link probe refused"), { code: "EACCES" });
    }
    // The projection link preflight uses ordinary stats. The alias check asks for inode identities.
    if (args[0] === lateAccess.path && args[1]?.bigint === true) lateAccess.aliasObserved = true;
    return actual.lstat(...args);
  }) as typeof actual.lstat;
  const readFile = (async (...args: Parameters<typeof actual.readFile>) => {
    if (args[0] === lateAccess.copyRead && --lateAccess.readsUntilDenial === 0) {
      lateAccess.copyRead = "";
      throw Object.assign(new Error("Archive copy read refused"), { code: "EACCES" });
    }
    return actual.readFile(...args);
  }) as typeof actual.readFile;
  const rm = async (...args: Parameters<typeof actual.rm>) => {
    if (args[0] === lateAccess.copyUnlink) {
      lateAccess.copyUnlink = "";
      throw Object.assign(new Error("Archive copy removal refused"), { code: "EACCES" });
    }
    await actual.rm(...args);
  };
  return { ...actual, lstat, readFile, rm, default: { ...actual, lstat, readFile, rm } };
});
vi.mock("node:fs", async original => {
  const actual = await original<typeof import("node:fs")>();
  const lstatSync = ((...args: Parameters<typeof actual.lstatSync>) => {
    if (args[0] === lateAccess.authority) throw Object.assign(new Error("Archive authority check refused"), { code: "EACCES" });
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

afterEach(() => {
  lateAccess.path = ""; lateAccess.aliasObserved = false; lateAccess.finalStatOnce = ""; lateAccess.authority = ""; lateAccess.captureProbe = "";
  lateAccess.copyRead = ""; lateAccess.readsUntilDenial = 0; lateAccess.copyUnlink = "";
  beginProjectionCommand();
});

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

it.each([["persist", "listing"], ["release", "listing"], ["persist", "authority"], ["release", "authority"],
  ["persist", "opened leaf"], ["release", "opened leaf"], ["persist", "capture"], ["release", "capture"],
  ["persist", "pending capture"], ["release", "pending capture"]] as const)(
  "%s settles an accessible copy when an archive folder denies %s", async (operation, denied) => {
  const h = await archiveRetirementFixture();
  const { location, index } = await h.disk(), writer = await createProjectionEnginePorts(h.checkout).writer();
  const active = Object.keys(index.entries).find(path => path.startsWith(".arc/active/") && path.endsWith("/meta-retiring.md"));
  if (active === undefined) throw new Error("Missing accessible record");
  const blocked = await stageRetirementCopy(h.checkout, h.path, index, writer);
  const sibling = await stageRetirementCopy(h.checkout, active, blocked.index, writer);
  const withheld = `${h.folder}/local-withheld.txt`;
  const blockedEntry = sibling.index.entries[h.path];
  if (blockedEntry?.kind !== "record") throw new Error("Missing blocked archive entry");
  const initial = denied === "capture" ? withProjectionEntry(sibling.index, h.path, { ...blockedEntry, pending: false })
    : denied === "listing" ? withProjectionEntry(sibling.index, withheld, {
    kind: "ownerless", stat: null, withheld: true, refused: { reason: "withheld", remedy: { text: "Recover the local edit." } },
  }) : sibling.index;
  await writeProjectionIndex(location, initial);
  const content = h.primary.content + "\nAn accessible edit until the capture probe.\n";
  const deniesCapture = denied === "capture" || denied === "pending capture";
  if (deniesCapture) {
    // Keep the previously recorded copy and supply a different live rendering for change detection to select.
    await writeFile(join(h.checkout, h.path), "");
    await h.write(h.path, content);
  }
  if (denied === "authority") lateAccess.authority = join(h.checkout, h.folder, ".git");
  const guard = (path: string) => {
    if (denied === "listing" && path === join(h.checkout, h.folder)) throw Object.assign(new Error("Directory listing refused"), { code: "EACCES" });
  };
  const context = { ...h.context, hooks: { afterFileSelection: async () => {
    if (denied === "opened leaf") lateAccess.finalStatOnce = join(h.checkout, h.path);
    if (deniesCapture) lateAccess.captureProbe = join(h.checkout, h.path);
  } }, ports: (checkout: string) => ({ ...createProjectionEnginePorts(checkout),
    linkFs: { lstat: async (path: string) => {
      if (denied === "listing" && path === join(checkout, withheld)) throw new Error("Probed a withheld file in the held folder");
      return lstat(path);
    } }, walkFs: {
      readdir: (path: string) => { guard(path); return readdirSync(path, { withFileTypes: true }); },
      readdirNames: (path: string) => { guard(path); return readdirSync(path); },
    },
  }) };
  const first = operation === "persist" ? await persistProjectionRemoval(h.checkout, context)
    : await releaseProjectionRemoval(h.checkout, false, context);
  expect(first).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("EACCES") } });
  const pending = (await h.disk()).index;
  expect(pending.entries[h.path]).toMatchObject({ copies: [{ name: blocked.name }] });
  expect(pending.entries[active]).toMatchObject({ copies: [] });
  if (denied === "listing") expect(pending.entries[withheld]).toMatchObject({ kind: "ownerless", withheld: true });
  if (deniesCapture) {
    expect(lateAccess.captureProbe).toBe("");
    expect(await readFile(join(h.checkout, h.path), "utf8")).toContain(content);
    expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(h.primary.content);
  }
  await expect(readFile(join(h.checkout, blocked.name))).resolves.toBeInstanceOf(Buffer);
  await expect(readFile(join(h.checkout, sibling.name))).rejects.toMatchObject({ code: "ENOENT" });
  lateAccess.authority = "";
  expect(await h.retire(operation)).toEqual({ kind: operation === "persist" ? "persisted" : "released" });
}, 30_000);

it.each(["status", "sync", "persist", "release"] as const)("checks nested checkout authority before %s releases a withheld entry", async operation => {
  const h = await archiveRetirementFixture(), { location, index } = await h.disk();
  const nested = `${h.folder}/nested`, foreign = `${nested}/absent.md`, sibling = `${h.folder}/absent.md`;
  await mkdir(join(h.checkout, nested, ".git"), { recursive: true });
  const held = { kind: "ownerless", stat: null, withheld: true,
    refused: { reason: "withheld", remedy: { text: "Recover the local edit." } } } as const;
  await writeProjectionIndex(location, withProjectionEntry(withProjectionEntry(index, foreign, held), sibling, held));
  if (operation === "status" || operation === "sync") {
    expect((await projectionCommand(h.input, [operation])).diagnostics).toContain("belongs to another checkout");
  } else {
    expect(await h.retire(operation)).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("nested checkout") } });
  }
  const after = (await h.disk()).index;
  expect(after.entries[foreign]).toEqual(held);
  expect(after.entries[sibling]).toBeUndefined();
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

function accessibleArchiveSibling(index: ProjectionIndex): string {
  const path = Object.keys(index.entries).find(path => path.startsWith(".arc/active/") && path.endsWith("/meta-retiring.md"));
  if (path === undefined) throw new Error("Missing accessible record");
  return path;
}

it.each([["persist", 1], ["persist", 2], ["release", 1], ["release", 2]] as const)(
  "%s retains an edited archive copy after capture read %s loses access", async (operation, read) => {
  const h = await archiveRetirementFixture(), { location, index } = await h.disk();
  const file = join(h.checkout, h.path), bytes = await readFile(file);
  const writer = await createProjectionEnginePorts(h.checkout).writer(), sibling = accessibleArchiveSibling(index);
  const extra = "\nAn edit saved into the moved archive inode.\n";
  const held = await stageRetirementCopy(h.checkout, h.path, index, writer, extra);
  const healthy = await stageRetirementCopy(h.checkout, sibling, held.index, writer);
  const entry = healthy.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing archive copy record");
  await writeFile(file, bytes);
  await writeProjectionIndex(location, withProjectionEntry(healthy.index, h.path, { ...entry, copies: entry.copies.map(copy => ({
    ...copy, linked: gitBlobId(bytes, "sha1"),
  })) }));
  const copy = join(h.checkout, held.name);
  let armed = false;
  const context = { ...h.context, hooks: { beforeAsideCopy: async (_checkout: string, path: string) => {
    if (armed || path !== h.path) return;
    armed = true;
    lateAccess.copyRead = copy;
    lateAccess.readsUntilDenial = read;
  } } };
  const retire = () => operation === "persist" ? persistProjectionRemoval(h.checkout, context)
    : releaseProjectionRemoval(h.checkout, false, context);
  expect(await retire()).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("EACCES") } });
  expect(armed).toBe(true);
  expect(lateAccess.copyRead).toBe("");
  expect(await readFile(file)).toEqual(bytes);
  expect(await readFile(copy)).toEqual(Buffer.concat([bytes, Buffer.from(extra)]));
  expect((await h.disk()).index.entries[h.path]).toMatchObject({ copies: [expect.objectContaining({ name: held.name })] });
  await expect(readFile(join(h.checkout, healthy.name))).rejects.toMatchObject({ code: "ENOENT" });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(h.primary.content);
  expect(await retire()).toEqual({ kind: operation === "persist" ? "persisted" : "released" });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toContain(extra.trim());
}, 30_000);

it.each([
  ["persist", "guard", "existing"], ["release", "guard", "existing"], ["persist", "swap", "existing"],
  ["release", "final stat", "existing"], ["persist", "guard", "adoption"], ["release", "guard", "adoption"],
  ["persist", "guard then link", "existing"],
] as const)("%s resumes accepted %s work after an %s text edit loses access", async (operation, at, kind) => {
  const h = await archiveRetirementFixture(), name = "retirement-acceptance.txt";
  const path = `${h.folder}/${name}`, file = join(h.checkout, path);
  const reference = recordReferences["work-item/companion"](h.primary.reference.owner, name);
  if (kind === "existing") {
    await seed(h.f, reference, "Original text.\n");
    await projectionCommand(h.input, ["status"]);
  } else await writeFile(file, "New local text.\n");
  expect((await projectionCommand(h.input, ["edit", file])).result).toMatchObject({ status: "ok" });
  const edit = "A distinct text correction accepted during retirement.\n";
  await chmod(file, 0o644);
  await writeFile(file, edit);
  const { location, index } = await h.disk(), writer = await createProjectionEnginePorts(h.checkout).writer();
  const healthy = await stageRetirementCopy(h.checkout, accessibleArchiveSibling(index), index, writer);
  await writeProjectionIndex(location, healthy.index);
  let sends = 0, armed = false;
  const denyOnce = () => {
    if (armed) return;
    armed = true;
    lateAccess.finalStatOnce = file;
  };
  const store = overrideEngineStore(h.store, { batch: async input => {
    const target = input.projectionAdmission?.local.path === path;
    if (target) sends += 1;
    const result = await h.store.batch(input);
    if (target && (at === "guard" || at === "guard then link") && result.status === "ok") denyOnce();
    return result;
  } });
  const context = { ...h.context, store, ports: (checkout: string) => ({ ...createProjectionEnginePorts(checkout), hooks: {
    afterSaveGuard: async (target: string) => { if (target === path && at === "swap") denyOnce(); },
    afterFirstCheck: async (target: string) => { if (target === path && at === "final stat") denyOnce(); },
  } }) };
  const retire = () => operation === "persist" ? persistProjectionRemoval(h.checkout, context)
    : releaseProjectionRemoval(h.checkout, false, context);
  expect(await retire()).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("EACCES") } });
  expect(armed).toBe(true);
  expect(lateAccess.finalStatOnce).toBe("");
  await expect(readFile(join(h.checkout, healthy.name))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(file, "utf8")).toBe(edit);
  expect(sends).toBe(1);
  expect(success(await h.store.read({ reference })).content).toBe(edit);
  if (at === "guard then link") {
    const saved = join(h.checkout, "temporarily-moved-accepted-text");
    await rename(file, saved);
    await symlink(saved, file, "file");
    await retire();
    expect((await h.disk()).index.entries[path]).toMatchObject({ pending: true, acceptedInputStat: { lay: { kind: "pending" } } });
    await rm(file);
    await rename(saved, file);
    expect((await projectionCommand({ ...h.input, store }, ["save"])).result).toMatchObject({ status: "ok" });
    expect(sends).toBe(1);
    expect(await readFile(file, "utf8")).toBe(edit);
    return;
  }
  expect(await retire()).toEqual({ kind: operation === "persist" ? "persisted" : "released" });
  expect(sends).toBe(1);
}, 30_000);

it.each(["persist", "release"] as const)("%s settles the next archive copy after an unlink denial", async operation => {
  const h = await archiveRetirementFixture(), sibling = `${h.folder}/z-accessible.txt`;
  await seed(h.f, recordReferences["work-item/companion"](h.primary.reference.owner, "z-accessible.txt"), "Accessible text.\n");
  await projectionCommand(h.input, ["status"]);
  const { location, index } = await h.disk(), writer = await createProjectionEnginePorts(h.checkout).writer();
  expect(Object.keys(index.entries).indexOf(sibling)).toBeGreaterThan(Object.keys(index.entries).indexOf(h.path));
  const blocked = await stageRetirementCopy(h.checkout, h.path, index, writer);
  const healthy = await stageRetirementCopy(h.checkout, sibling, blocked.index, writer);
  await writeProjectionIndex(location, healthy.index);
  lateAccess.copyUnlink = join(h.checkout, blocked.name);
  expect(await h.retire(operation)).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("EACCES") } });
  expect(lateAccess.copyUnlink).toBe("");
  await expect(lstat(join(h.checkout, blocked.name))).resolves.toBeDefined();
  await expect(lstat(join(h.checkout, healthy.name))).rejects.toMatchObject({ code: "ENOENT" });
  expect((await h.disk()).index.entries[h.path]).toMatchObject({ copies: [expect.objectContaining({ name: blocked.name })] });
  expect(await h.retire(operation)).toEqual({ kind: operation === "persist" ? "persisted" : "released" });
}, 30_000);

it("keeps new accepted text proof when the landed read fails after an earlier installation", async () => {
  const h = await archiveRetirementFixture(), name = "ordinary-readback.txt";
  const path = `${h.folder}/${name}`, file = join(h.checkout, path);
  const reference = recordReferences["work-item/companion"](h.primary.reference.owner, name), previous = "An earlier accepted text edit.\n";
  await seed(h.f, reference, "Original text.\n");
  await projectionCommand(h.input, ["status"]);
  expect((await projectionCommand(h.input, ["edit", file])).result).toMatchObject({ status: "ok" });
  await writeFile(file, previous);
  expect((await projectionCommand(h.input, ["save"])).result).toMatchObject({ status: "ok" });
  expect((await h.disk()).index.entries[path]).toMatchObject({ acceptedInputStat: { lay: { kind: "installed" } } });
  expect((await projectionCommand(h.input, ["edit", file])).result).toMatchObject({ status: "ok" });
  const edit = "A new ordinary text edit accepted before the read-back refusal.\n";
  await writeFile(file, edit);
  let submissions = 0, denied: RecordReference | undefined, triggered = false;
  const store = overrideEngineStore(h.store, { batch: async input => {
    const target = input.projectionAdmission?.local.path === path;
    if (target) submissions += 1;
    const sent = await h.store.batch(input);
    if (target && submissions === 1 && sent.status === "ok") denied = sent.result.writes[0]?.reference;
    return sent;
  }, read: async input => {
    if (denied === undefined || !sameReference(input.reference, denied)) return h.store.read(input);
    denied = undefined;
    triggered = true;
    return { status: "refused", refusal: { code: "lock-held", class: "recoverable", lock: "archive",
      condition: "The accepted record could not be read once.", remedy: { text: "Retry the ordinary text read-back." } } };
  } });
  expect(await persistProjectionRemoval(h.checkout, { ...h.context, store })).toMatchObject({ kind: "refused",
    remedy: { text: expect.stringContaining("Retry the ordinary text read-back") } });
  expect(triggered).toBe(true);
  expect(submissions).toBe(1);
  expect(success(await h.store.read({ reference })).content).toBe(edit);
  expect((await h.disk()).index.entries[path]).toMatchObject({ pending: true, acceptedInputStat: { lay: { kind: "pending" } },
    persisted: { recording: true, read: gitBlobId(edit, "sha1") } });
  await utimes(file, new Date(0), new Date(0));
  expect((await projectionCommand({ ...h.input, store }, ["save"])).result).toMatchObject({ status: "ok" });
  expect(submissions).toBe(1);
  const installed = (await h.disk()).index.entries[path];
  expect(installed).toMatchObject({ pending: false, acceptedInputStat: { lay: { kind: "installed" } } });
  expect(installed?.opened).toBeUndefined();
  expect(await readFile(file, "utf8")).toBe(edit);
}, 30_000);

it.each([["persist", "inventory"], ["release", "inventory"], ["release", "returned copy"]] as const)(
  "%s retains opaque %s work while settling an accessible copy", async (operation, owed) => {
  const h = await archiveRetirementFixture(), { location, index } = await h.disk();
  const scope = `${h.folder}/owed-directory`, folder = join(h.checkout, scope), saved = join(h.checkout, "saved-archive-directory");
  const writer = await createProjectionEnginePorts(h.checkout).writer(), edit = "The edit whose directory is owed.\n";
  await mkdir(saved);
  await writeFile(join(saved, "unindexed.md"), edit);
  await symlink(saved, folder, "junction");
  const healthy = await stageRetirementCopy(h.checkout, accessibleArchiveSibling(index), index, writer);
  const copy = nameAsideFile({ path: `${scope}/unindexed.md`, base: gitBlobId(edit, "sha1"), writer, role: "aside" });
  const obligation = owed === "inventory" ? { archiveDiscoveryPending: [scope] } : { archiveRecoveryCopies: [copy] };
  await writeProjectionIndex(location, { ...healthy.index, ...obligation, state: null });
  const disposition = operation === "persist" ? "remove" : "release";
  const header = join(location.stateDir, PROJECTION_INDEX_FILE), before = await readFile(header);
  expect(await checkProjectionRemoval(h.checkout, h.context, disposition)).toMatchObject({ kind: "unobservable",
    detail: expect.stringContaining(`Replace the symbolic link ${scope}`) });
  expect(await readFile(header)).toEqual(before);
  expect(await h.retire(operation)).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining(scope) } });
  expect((await h.disk()).index).toMatchObject(obligation);
  await expect(lstat(join(h.checkout, healthy.name))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(saved, "unindexed.md"), "utf8")).toBe(edit);
  // Removing the obstruction and leaving the scope absent lets retirement prove that it is covered.
  await rm(folder);
  expect(await h.retire(operation)).toEqual({ kind: operation === "persist" ? "persisted" : "released" });
}, 30_000);

it.each(["link", "nested"] as const)("rechecks owed archive coverage across a new %s before deleting linked release state", async boundary => {
  const h = await archiveRetirementFixture(), { location, index } = await h.disk();
  const directory = `${h.folder}/late-opaque`, scope = boundary === "nested" ? `${directory}/unindexed.md` : directory;
  const folder = join(h.checkout, directory), target = join(h.checkout, "late-target");
  await mkdir(target);
  if (boundary === "nested") await mkdir(folder);
  await writeProjectionIndex(location, { ...index, archiveDiscoveryPending: [scope], state: null });
  let linked = false;
  const released = await releaseProjectionRemoval(h.checkout, false, { ...h.context, ports: checkout => ({
    ...createProjectionEnginePorts(checkout), hooks: { afterRecheck: async path => {
      if (path !== h.path) return;
      if (boundary === "nested") await mkdir(join(folder, ".git"));
      else await symlink(target, folder, "junction");
      linked = true;
    } },
  }) });
  expect(linked).toBe(true);
  expect(released).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining(scope) } });
  expect((await h.disk()).index).toMatchObject({ archiveDiscoveryPending: [scope], state: null });
  await rm(folder, { recursive: boundary === "nested" });
  expect(await h.retire("release")).toEqual({ kind: "released" });
}, 30_000);

it.each([1, 2])("keeps the new rendering and the moved edit when swap's first check loses copy read %s", async read => {
  const h = await archiveRetirementFixture(), file = join(h.checkout, h.path);
  expect((await projectionCommand(h.input, ["edit", file])).result).toMatchObject({ status: "ok" });
  const accepted = h.primary.content + "\nThe first saved correction.\n";
  await h.write(h.path, accepted);
  const later = "\nA later correction through the moved inode.\n";
  const folder = join(h.checkout, ASIDE_FILES_ROOT, h.path.slice(".arc/".length));
  let moved: string | undefined;
  const persisted = await persistProjectionRemoval(h.checkout, { ...h.context, ports: checkout => ({
    ...createProjectionEnginePorts(checkout), hooks: { afterMove: async path => {
      if (path !== h.path) return;
      const aside = readdirSync(folder).find(name => name.endsWith(".aside"));
      if (aside === undefined) throw new Error("Swap did not move the original inode");
      moved = join(folder, aside);
      const original = await readFile(moved, "utf8");
      await writeFile(moved, original + later);
      lateAccess.copyRead = moved;
      lateAccess.readsUntilDenial = read;
    } },
  }) });
  expect(persisted).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("EACCES") } });
  expect(lateAccess.copyRead).toBe("");
  if (moved === undefined) throw new Error("Swap never reached the move");
  expect(await readFile(moved, "utf8")).toContain(later);
  expect(await readFile(file, "utf8")).toContain(accepted);
  expect(await readFile(file, "utf8")).not.toContain(later);
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(accepted);
}, 30_000);

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
