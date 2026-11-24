/** Removal feasibility requires explicit archive correction and keeps unreadable evidence distinct from refused edits. */
import { readFile, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";
import { seed, success, update } from "../../../helpers/store/suite-tools.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { recordReferences, sameReference } from "../../../../src/lib/store/identity.js";
import { formatConflictToken } from "../../../../src/lib/status/conflict-token.js";
import { HistoryRefSchema } from "../../../../src/lib/store/index.js";
import { expandStoredPath } from "../../../../src/lib/store/stored-path.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { checkProjectionRemoval } from "../../../../src/lib/store/projection/removal-check.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";

afterEach(() => { beginProjectionCommand(); });

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

it.each(["present", "absent"] as const)("holds an unfinished archived recording with the file %s until save finishes it", async presence => {
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
  if (presence === "absent") await rm(join(h.checkout, h.path));
  expect(await h.check()).toMatchObject({ kind: "refused", reason: "persist-would-refuse", remedy: {
    text: expect.stringContaining("arc save"),
  } });
  expect((await projectionCommand(h.input, ["save"])).result).toMatchObject({ status: "ok" });
  expect((await h.disk()).index.entries[h.path]).not.toHaveProperty("persisted.recording");
  expect(success(await h.store.read({ reference: h.primary.reference }))).toMatchObject({ content, version: accepted.version });
  expect(await h.check()).toEqual({ kind: "removable" });
}, 30_000);

it.each(["not-found", "state-unresolvable"] as const)("classifies an indexed archive owner read returning %s", async code => {
  const h = await archiveRetirementFixture();
  const path = `${h.folder}/new-correction.md`;
  await h.write(path, "A new correction whose owner must be read.\n");
  const store = overrideEngineStore(h.store, { read: async input => sameReference(input.reference, h.primary.reference)
    ? { status: "refused", refusal: { code, class: "recoverable", historyRefs: [],
      condition: "The indexed archive owner is unavailable.", remedy: { text: "Restore the archive owner, then retry." } } }
    : h.store.read(input) });
  const result = await checkProjectionRemoval(h.checkout, { ...h.context, store });
  const detail = expect.stringContaining("Restore the archive owner");
  expect(result).toMatchObject(code === "not-found"
    ? { kind: "would-refuse", remedy: { text: detail } } : { kind: "unobservable", detail });
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

it("names the owner for a new file in another person's archived work unit and clears once it is removed", async () => {
  const h = await archiveRetirementFixture("bob"), path = `${h.folder}/new-note.md`, file = join(h.checkout, path);
  await writeFile(file, "A note in another person's archived unit.\n");
  const checked = await h.check();
  expect(checked).toMatchObject({ kind: "refused", reason: "persist-would-refuse", remedy: { text: expect.stringContaining("bob") } });
  if (checked.kind !== "refused" || checked.reason !== "persist-would-refuse") throw new Error("No owner remedy");
  expect(checked.remedy.text).not.toContain("Run arc edit");
  expect(await h.retire("persist")).toMatchObject({ kind: "refused" });
  expect(await h.store.read({ reference: recordReferences["work-item/companion"](h.primary.reference.owner, "new-note.md") }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  await rm(file);
  expect(await h.check()).toEqual({ kind: "removable" });
}, 30_000);

it("keeps a text companion saved with only its line endings changed out of sync's report and the removal check", async () => {
  const h = await archiveRetirementFixture(), content = "First line.\nSecond line.\n";
  const path = `${h.folder}/endings.txt`, file = join(h.checkout, path);
  await seed(h.f, recordReferences["work-item/companion"](h.primary.reference.owner, "endings.txt"), content);
  expect((await projectionCommand(h.input, ["status"])).result).toMatchObject({ kind: "ready" });
  expect((await projectionCommand(h.input, ["edit", file])).result).toMatchObject({ status: "ok" });
  // The file keeps the time its editor wrote it, so the index's next write cannot trust its recorded stat.
  await writeFile(file, content.replaceAll("\n", "\r\n"));
  expect((await projectionCommand(h.input, ["save"])).result).toMatchObject({ status: "ok", result: { relocked: [{ path }] } });
  expect((await h.disk()).index.entries[path]).not.toHaveProperty("opened");
  expect((await projectionCommand(h.input, ["sync"])).diagnostics).not.toContain(path);
  expect(await h.check(h.checkout)).toEqual({ kind: "removable" });
  expect(await readFile(file, "utf8")).toBe(content.replaceAll("\n", "\r\n"));
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
    text: expect.stringContaining(shown === "notice" ? `arc save --resolve ${formatConflictToken(conflict)}` : `arc edit ${path} from ${h.checkout}`),
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

it("holds an unedited archive conflict shown by notice until its named repair",
  () => checkUneditedArchiveConflictRepair("notice"), process.platform === "win32" ? 60_000 : 30_000);
it("holds an unedited archive conflict shown by markers until its named repair",
  () => checkUneditedArchiveConflictRepair("markers"), 30_000);
