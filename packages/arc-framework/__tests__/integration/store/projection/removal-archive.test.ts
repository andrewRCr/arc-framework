/** Removal feasibility requires explicit archive correction and keeps unreadable evidence distinct from refused edits. */
import { chmod, mkdir, readFile, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";
import { seed, success, update } from "../../../helpers/store/suite-tools.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { formatConflictToken } from "../../../../src/lib/status/conflict-token.js";
import { HistoryRefSchema } from "../../../../src/lib/store/index.js";
import { expandStoredPath } from "../../../../src/lib/store/stored-path.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { withProjectionEntry } from "../../../../src/lib/store/projection/index-memory.js";

afterEach(() => { beginProjectionCommand(); });

it.each([false, true])("reports the same nested archive destination blocker before and during retirement (edited=%s)", async edited => {
  const h = await archiveRetirementFixture(), file = join(h.checkout, h.path);
  const { location, index } = await h.disk();
  const entry = index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Expected an archived file entry");
  const original = await readFile(file, "utf8");
  const name = nameAsideFile({ path: h.path, base: entry.base.blob, writer: await createProjectionEnginePorts(h.checkout).writer(), role: "aside" });
  const copy = join(h.checkout, name), bytes = edited ? `${original}\nAn edit in the displaced copy.\n` : original;
  await mkdir(dirname(copy), { recursive: true });
  await rename(file, copy);
  if (edited) { await chmod(copy, 0o644); await writeFile(copy, bytes); }
  await mkdir(join(dirname(file), ".git"));
  await writeProjectionIndex(location, withProjectionEntry(index, h.path, { ...entry, pending: true,
    copies: [{ name, moving: gitBlobId(original, "sha1"), linked: null, landed: null, writeBackSent: false,
      rendering: { markers: entry.markers, notices: entry.notices } }] }));

  const checked = await h.check();
  expect(checked).toMatchObject({ kind: "refused", reason: "persist-would-refuse", remedy: {
    text: expect.stringContaining("belongs to another checkout"),
  } });
  if (checked.kind !== "refused" || checked.reason !== "persist-would-refuse") throw new Error("Expected the feasibility refusal");
  expect(await h.retire("persist")).toEqual({ kind: "refused", remedy: checked.remedy });
  expect(await readFile(copy, "utf8")).toBe(bytes);
  expect(success(await h.store.read({ reference: h.primary.reference })).version).toBe(h.primary.version);
}, 30_000);

it("holds a withheld archive edit after index loss until deletion, reopening and reapplication", async () => {
  const h = await archiveRetirementFixture(), file = join(h.checkout, h.path);
  expect((await projectionCommand(h.input, ["edit", file])).result).toMatchObject({ status: "ok" });
  const content = h.primary.content + "\nCorrection retained across index loss.\n";
  await h.write(h.path, content);
  const bytes = await readFile(file, "utf8");
  await rm(join((await h.disk()).location.stateDir, "index"));
  expect((await projectionCommand(h.input, ["status"])).result).toMatchObject({ kind: "ready" });
  expect((await h.disk()).index.entries[h.path]).toMatchObject({ withheld: true });
  expect(await h.check()).toMatchObject({ kind: "refused", reason: "persist-would-refuse", remedy: {
    text: expect.stringContaining(`arc edit ${h.path}`),
  } });
  expect(await readFile(file, "utf8")).toBe(bytes);
  await rm(file);
  await projectionCommand(h.input, ["status"]);
  await h.openAndSave(h.path, content);
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toBe(content);
  expect(await h.check()).toEqual({ kind: "removable" });
}, 30_000);

it("holds an unfinished archived recording until save finishes the accepted input", async () => {
  const h = await archiveRetirementFixture();
  expect((await projectionCommand(h.input, ["edit", join(h.checkout, h.path)])).result).toMatchObject({ status: "ok" });
  const content = h.primary.content + "\nAccepted archived input.\n";
  await h.write(h.path, content);
  const fault = createRefusingStore(h.store);
  const store = { ...fault.store, batch: async (input: Parameters<typeof h.store.batch>[0]) => {
    const result = await h.store.batch(input);
    if (result.status === "ok") fault.refuse("read", { code: "state-unresolvable", class: "recoverable", historyRefs: [],
      condition: "Read-back is temporarily unavailable.", remedy: { text: "Repair read-back and retry arc save." } });
    return result;
  } };
  await projectionCommand({ ...h.input, store }, ["save"]);
  expect((await h.disk()).index.entries[h.path]).toMatchObject({ persisted: { recording: true } });
  fault.refuse("read", null);
  const accepted = success(await h.store.read({ reference: h.primary.reference }));
  expect(accepted.content).toBe(content);
  expect(await h.check()).toMatchObject({ kind: "refused", reason: "persist-would-refuse", remedy: {
    text: expect.stringContaining("arc save"),
  } });
  expect((await projectionCommand(h.input, ["save"])).result).toMatchObject({ status: "ok" });
  expect(success(await h.store.read({ reference: h.primary.reference }))).toMatchObject({ content, version: accepted.version });
  expect(await h.check()).toEqual({ kind: "removable" });
}, 30_000);

it.each(["absent", "empty"])("allows an opened archived file left %s without changing its stored version", async state => {
  const h = await archiveRetirementFixture();
  expect((await projectionCommand(h.input, ["edit", join(h.checkout, h.path)])).result).toMatchObject({ status: "ok" });
  const before = success(await h.store.read({ reference: h.primary.reference }));
  if (state === "absent") await rm(join(h.checkout, h.path));
  else { await writeFile(join(h.checkout, h.path), ""); await utimes(join(h.checkout, h.path), new Date(0), new Date(0)); }
  expect(await h.check()).toEqual({ kind: "removable" });
  expect(success(await h.store.read({ reference: h.primary.reference }))).toMatchObject({ content: before.content, version: before.version });
}, 30_000);

it("names the owner of a forced foreign archive edit and clears after restoring its stored bytes", async () => {
  const h = await archiveRetirementFixture("bob");
  const original = await readFile(join(h.checkout, h.path));
  await h.write(h.path, h.primary.content + "\nA foreign correction.\n");
  const checked = await h.check();
  expect(checked).toMatchObject({ kind: "refused", reason: "persist-would-refuse", remedy: {
    text: expect.stringContaining("bob"),
  } });
  if (checked.kind !== "refused" || checked.reason !== "persist-would-refuse") throw new Error("No owner remedy");
  expect(checked.remedy.text).not.toContain("Run arc edit");
  await writeFile(join(h.checkout, h.path), original);
  expect(await h.check()).toEqual({ kind: "removable" });
}, 30_000);

it.each(["forced", "malformed", "new"])("holds an unopened %s archive file from either checkout until edit and save", async kind => {
  const h = await archiveRetirementFixture();
  const path = kind === "new" ? `${h.folder}/new-note.md` : h.path;
  const repaired = kind === "new" ? "A new archived correction.\n" : h.primary.content + "\nAn archived correction.\n";
  await h.write(path, kind === "malformed" ? "Malformed metadata.\n" : repaired);
  const bytes = await readFile(join(h.checkout, path), "utf8");
  for (const from of [h.f.root, h.checkout]) {
    const checked = await h.check(from);
    expect(checked).toMatchObject({ kind: "refused", reason: "persist-would-refuse", remedy: {
      text: expect.stringContaining(`arc edit ${path}`),
    } });
    if (checked.kind !== "refused" || checked.reason !== "persist-would-refuse") throw new Error("No archive remedy");
    expect(checked.remedy.text).toContain("arc save");
    expect(checked.remedy.text).toContain(h.checkout);
  }
  expect(await readFile(join(h.checkout, path), "utf8")).toBe(bytes);
  await h.openAndSave(path, repaired);
  expect(await h.check()).toEqual({ kind: "removable" });
}, 30_000);

async function checkUneditedArchiveConflictRepair(shown: "notice" | "markers") {
  const h = await archiveRetirementFixture("andrew", shown === "notice" ? "separate" : "default");
  const base = shown === "notice" ? h.primary : await seed(h.f,
    recordReferences["work-item/companion"](h.primary.reference.owner, "conflicted.md"), "opening\nbase\nclosing\n");
  const path = shown === "notice" ? h.path : `${h.folder}/conflicted.md`;
  if (shown === "notice") {
    const remote = h.f.remote(true);
    if (remote === undefined) throw new Error("No native reference peer");
    success(await h.f.store.push());
    success(await remote.pull({ history: [HistoryRefSchema.parse(expandStoredPath(base.reference, { history: true }).ref)] }));
    const peerBase = success(await remote.read({ reference: base.reference }));
    success(await h.f.store.write({ ...update(h.f, base, base.content), links: { changeRequest: { repository: "project", number: 8 } } }));
    success(await remote.write({ ...update(h.f, peerBase, base.content), links: { changeRequest: { repository: "project", number: 9 } } }));
    success(await h.f.store.push());
  } else for (const content of ["opening\ncurrent\nclosing\n", "opening\nincoming\nclosing\n"]) {
    success(await h.store.write(update(h.f, base, content)));
  }
  const current = success(await h.store.read({ reference: base.reference })), conflict = current.conflicts[0];
  if (conflict === undefined) throw new Error("Native writes did not produce the requested conflict");
  expect((await projectionCommand(h.input, ["status"])).result).toMatchObject({ kind: "ready" });
  const entry = (await h.disk()).index.entries[path];
  expect(entry).not.toHaveProperty("opened");
  expect(entry).toMatchObject(shown === "notice" ? { notices: [conflict] } : { markers: expect.any(Object) });
  const checked = await h.check();
  expect(checked).toMatchObject({ kind: "refused", reason: "persist-would-refuse", remedy: {
    text: expect.stringContaining(shown === "notice" ? `arc save --resolve ${formatConflictToken(conflict)}` : `arc edit ${path}`),
  } });
  if (shown === "notice") {
    expect((await projectionCommand(h.input, ["edit", join(h.checkout, path)])).result).toMatchObject({ status: "ok" });
    expect((await projectionCommand(h.input, ["save"])).result).toMatchObject({ status: "ok", result: { relocked: [{ path }] } });
    expect((await h.disk()).index.entries[path]).not.toHaveProperty("opened");
    expect(success(await h.store.read({ reference: base.reference }))).toMatchObject({ version: current.version, conflicts: [conflict] });
    expect((await projectionCommand(h.input, ["save", "--resolve", formatConflictToken(conflict)])).result).toMatchObject({ status: "ok" });
  } else await h.openAndSave(path, current.content);
  expect(success(await h.store.read({ reference: base.reference })).conflicts).toEqual([]);
  expect(await h.check()).toEqual({ kind: "removable" });
}

// The notice case uses real repositories and three synchronization operations before verifying the repair.
it("holds an unedited archive conflict shown by notice until its named repair",
  () => checkUneditedArchiveConflictRepair("notice"), process.platform === "win32" ? 60_000 : 30_000);
it("holds an unedited archive conflict shown by markers until its named repair",
  () => checkUneditedArchiveConflictRepair("markers"), 30_000);

it.each([["persist", "present"], ["release", "present"], ["persist", "absent"]] as const)(
  "lets %s finish after recovering an interrupted archive adoption with the path %s", async (operation, presence) => {
  const h = await archiveRetirementFixture(), path = `${h.folder}/after-missed-response.txt`;
  const file = join(h.checkout, path), content = "Adopted before the response was lost.\n";
  const reference = recordReferences["work-item/companion"](h.primary.reference.owner, "after-missed-response.txt");
  await writeFile(file, content);
  expect((await projectionCommand(h.input, ["edit", file])).result).toMatchObject({ status: "ok" });
  const store = { ...h.store, batch: async (input: Parameters<typeof h.store.batch>[0]) => {
    const result = await h.store.batch(input);
    if (result.status === "ok") throw new Error("Stopped after the adopted record was stored");
    return result;
  } };
  await expect(projectionCommand({ ...h.input, store }, ["save"])).rejects.toThrow("Stopped after the adopted record was stored");
  const accepted = success(await h.store.read({ reference }));
  if (presence === "absent") await rm(file);
  expect(await h.check()).toMatchObject({ kind: "refused", reason: "persist-would-refuse", remedy: {
    text: expect.stringContaining("arc save"),
  } });
  expect(await h.retire(operation)).toMatchObject({ kind: operation === "persist" ? "persisted" : "released" });
  expect(success(await h.store.read({ reference }))).toMatchObject({ content, version: accepted.version });
}, 30_000);

it.each([["save", "ownerless"], ["save", "indexed"], ["persist", "ownerless"], ["persist", "indexed"], ["persist", "unaccepted"]] as const)(
  "checks a linked %s archive receipt before permitting installation (%s)", async (operation, kind) => {
  const h = await archiveRetirementFixture();
  const path = kind === "indexed" ? h.path : `${h.folder}/linked-receipt.txt`;
  const reference = kind === "indexed" ? h.primary.reference : recordReferences["work-item/companion"](h.primary.reference.owner, "linked-receipt.txt");
  const content = kind === "indexed" ? `${h.primary.content}\nAn accepted archive correction.\n` : "An interrupted archive creation.\n";
  const file = join(h.checkout, path);
  if (kind !== "indexed") await writeFile(file, content);
  expect((await projectionCommand(h.input, ["edit", file])).result).toMatchObject({ status: "ok" });
  await h.write(path, content);
  const store = { ...h.store, batch: async (input: Parameters<typeof h.store.batch>[0]) => {
    if (kind !== "unaccepted") await h.store.batch(input);
    throw new Error("Stopped while receiving the archive response");
  } };
  await expect(projectionCommand({ ...h.input, store }, ["save"])).rejects.toThrow("Stopped while receiving the archive response");
  const staged = (await h.disk()).index.entries[path];
  expect(staged).toHaveProperty("archiveSubmission");
  const accepted = await h.store.read({ reference });
  const folder = join(h.checkout, h.folder), held = join(h.checkout, "..", "linked-archive");
  const bytes = await readFile(file);
  await rename(folder, held);
  await symlink(held, folder, "junction");
  expect(await h.check()).toMatchObject({ kind: "refused", reason: "persist-would-refuse" });
  if (operation === "save") {
    expect((await projectionCommand(h.input, ["save"])).diagnostics).toContain("symbolic link");
  } else expect(await h.retire(operation)).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("symbolic link") } });
  expect(await readFile(file)).toEqual(bytes);
  expect(await h.store.read({ reference })).toEqual(accepted);
  const recovery = (await h.disk()).index.entries[path];
  if (accepted.status === "ok") {
    expect(recovery).not.toHaveProperty("archiveSubmission");
    expect(recovery).toMatchObject({ kind: "record", opened: true,
      persisted: { recording: true, takenIn: { version: accepted.result.version } } });
  } else expect(recovery).toMatchObject({ archiveSubmission: staged?.archiveSubmission });
  expect(await h.check()).toMatchObject({ kind: "refused", reason: "persist-would-refuse" });

  await rm(folder, { recursive: true });
  await rename(held, folder);
  expect((await projectionCommand(h.input, ["save"])).result).toMatchObject({ status: "ok", result: { relocked: [{ path }] } });
  expect(success(await h.store.read({ reference }))).toMatchObject({ content,
    ...(accepted.status === "ok" ? { version: accepted.result.version } : {}) });
}, 30_000);
