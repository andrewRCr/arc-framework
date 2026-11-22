/** Removal feasibility requires explicit archive correction and keeps unreadable evidence distinct from refused edits. */
import { mkdirSync } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { createErrandAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { configureEngineCheckout, overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { seed, success, testProvenance, update } from "../../../helpers/store/suite-tools.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { formatConflictToken } from "../../../../src/lib/status/conflict-token.js";
import { HistoryRefSchema } from "../../../../src/lib/store/index.js";
import { expandStoredPath } from "../../../../src/lib/store/stored-path.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { readProjectionIndex, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { withProjectionEntry } from "../../../../src/lib/store/projection/index-memory.js";
import { checkProjectionRemoval } from "../../../../src/lib/store/projection/removal-check.js";
import { persistProjectionRemoval } from "../../../../src/lib/store/projection/removal-persist.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { createProjectionFanOutDependencies } from "../../../../src/lib/store/projection/fan-out-binding.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";
import { endProjection, startProjection } from "../../../../src/lib/store/projection/engine.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";
import { createRefStore } from "../../../../src/lib/store/create.js";
import { createDefaultRefStorePorts } from "../../../../src/lib/store/default-ports.js";
import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";

afterEach(() => { beginProjectionCommand(); });

it("leaves an opened archive adoption whose folder became a nested checkout to the repair from the next command on", async () => {
  const h = await archiveRetirementFixture();
  const path = `${h.folder}/new-companion.txt`, file = join(h.checkout, path);
  const boundary = join(dirname(file), ".git"), content = "A local archive companion.\n";
  const reference = recordReferences["work-item/companion"](h.primary.reference.owner, "new-companion.txt");
  await writeFile(file, content);
  expect((await projectionCommand(h.input, ["edit", file])).result).toMatchObject({ status: "ok" });
  // A nested checkout made after a command selected the path lets that command's reads follow it; the next one asks again.
  const store = { ...h.store, read: async (request: Parameters<typeof h.store.read>[0]) => {
    const result = await h.store.read(request);
    if (request.reference.kind === "work-item/companion") await mkdir(boundary, { recursive: true });
    return result;
  } };
  await projectionCommand({ ...h.input, store }, ["status"]);
  const before = (await h.disk()).index.entries[path];
  expect(before).toMatchObject({ opened: true });
  expect(await checkProjectionRemoval(h.checkout, h.context)).toMatchObject({
    kind: "unobservable", detail: expect.stringContaining("belongs to another checkout"),
  });
  expect((await projectionCommand(h.input, ["save"])).diagnostics).toContain("belongs to another checkout");
  expect((await h.disk()).index.entries[path]).toEqual(before);
  expect(await readFile(file, "utf8")).toBe(content);

  await rm(boundary, { recursive: true });
  expect((await projectionCommand(h.input, ["save"])).result).toMatchObject({ status: "ok" });
  expect(success(await h.store.read({ reference })).content).toBe(content);
  expect(await h.check()).toEqual({ kind: "removable" });
}, 30_000);

it("asks archive authority at persist's selection and leaves a nested checkout's path untouched", async () => {
  const h = await archiveRetirementFixture();
  const folder = join(h.checkout, h.folder), boundary = join(folder, ".git");
  const file = join(h.checkout, h.path), before = await readFile(file, "utf8");
  expect((await projectionCommand(h.input, ["edit", file])).result).toMatchObject({ status: "ok" });
  await h.write(h.path, `${h.primary.content}\nAn opened correction.\n`);
  const opened = await readFile(file, "utf8");
  mkdirSync(boundary);
  const result = await persistProjectionRemoval(h.checkout, h.context);
  expect(opened).not.toBe(before);
  expect(result).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("belongs to another checkout") } });
  expect(await readFile(file, "utf8")).toBe(opened);
  expect(success(await h.store.read({ reference: h.primary.reference })).version).toBe(h.primary.version);

  await rm(boundary, { recursive: true });
  expect(await h.retire("persist")).toEqual({ kind: "persisted" });
}, 30_000);

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

  expect(await h.check()).toMatchObject({ kind: "refused", reason: "unobservable",
    detail: expect.stringContaining("belongs to another checkout") });
  expect(await h.retire("persist")).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("belongs to another checkout") } });
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

it.each([
  ["save", true, false], ["save absent", true, false], ["persist", true, false], ["release", true, false],
  ["persist", false, false], ["release", false, false],
  ["persist", false, true], ["release", false, true],
] as const)("finishes an accepted archive recording with %s (opened=%s, link=%s)", async (operation, opened, linked) => {
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
  if (!opened) {
    const { location, index } = await h.disk();
    const entry = index.entries[h.path];
    if (entry?.kind !== "record") throw new Error("Missing accepted archive recording");
    // Refresh can accept a forced edit without opening its file.
    const unopened = { ...entry };
    delete unopened.opened;
    await writeProjectionIndex(location, withProjectionEntry(index, h.path, unopened));
  }
  fault.refuse("read", null);
  const accepted = success(await h.store.read({ reference: h.primary.reference }));
  expect(accepted.content).toBe(content);
  expect(await h.check()).toEqual({ kind: "removable" });
  const file = join(h.checkout, h.path);
  const linkTarget = join(h.f.root, "retirement-link-target.txt");
  if (operation !== "save") await rm(file);
  if (linked) {
    await writeFile(linkTarget, "Unrelated file outside the archive.\n");
    await symlink(linkTarget, file);
  }
  if (operation === "persist" || operation === "release") {
    expect(await h.retire(operation)).toEqual({ kind: operation === "persist" ? "persisted" : "released" });
  } else {
    expect((await projectionCommand(h.input, ["save"])).result).toMatchObject({ status: "ok" });
    expect((await h.disk()).index.entries[h.path]).not.toMatchObject({ persisted: { recording: true } });
  }
  expect(success(await h.store.read({ reference: h.primary.reference }))).toMatchObject({ content, version: accepted.version });
  if (linked) expect(await readFile(linkTarget, "utf8")).toBe("Unrelated file outside the archive.\n");
  if (operation === "save" || operation === "save absent") expect(await h.check()).toEqual({ kind: "removable" });
}, 30_000);

it.each(["still holds", "has moved past"] as const)("finishes an unopened accepted recording at plain save when the file %s its input", async state => {
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
  fault.refuse("read", null);
  const accepted = success(await h.store.read({ reference: h.primary.reference }));
  // A refresh's guard that takes in a forced edit reaches the same accepted state with no opening.
  const { location, index } = await h.disk();
  const entry = index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing archive entry");
  expect(entry).toMatchObject({ persisted: { recording: true } });
  const unopened = { ...entry };
  delete unopened.opened;
  await writeProjectionIndex(location, withProjectionEntry(index, h.path, unopened));
  if (state === "has moved past") await h.write(h.path, content + "\nA later unopened correction.\n");
  const saved = await projectionCommand(h.input, ["save"]);
  expect(success(await h.store.read({ reference: h.primary.reference }))).toMatchObject({ content, version: accepted.version });
  expect((await h.disk()).index.entries[h.path]).not.toMatchObject({ persisted: { recording: true } });
  if (state === "still holds") expect(saved.diagnostics).not.toContain(`arc edit ${h.path}`);
  else {
    expect(saved.diagnostics).toContain(`arc edit ${h.path}`);
    expect(await readFile(join(h.checkout, h.path), "utf8")).toContain("A later unopened correction.");
    expect((await h.disk()).index.entries[h.path]).toMatchObject({ pending: true });
  }
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

async function checkUneditedArchiveConflictRepair(shown: "notice" | "markers", interrupted: boolean | "touched" | "replaced" = false) {
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
  } else if (interrupted) {
    expect((await projectionCommand(h.input, ["edit", join(h.checkout, path)])).result).toMatchObject({ status: "ok" });
    await h.write(path, current.content);
    let submissions = 0;
    const store = { ...h.store, batch: async (input: Parameters<typeof h.store.batch>[0]) => {
      const result = await h.store.batch(input);
      if (++submissions === 1) {
        const root = projectionProcessState().roots.get(h.checkout);
        if (root === undefined) throw new Error("Missing archive projection root");
        root.checkpoint = async () => { throw new Error("Stopped after accepting the archive resolution"); };
      }
      return result;
    } };
    const command = { ...h.input, store };
    await expect(projectionCommand(command, ["save"])).rejects.toThrow("Stopped after accepting the archive resolution");
    expect((await h.disk()).index.entries[path]).toHaveProperty("archiveSubmission");
    const accepted = success(await h.store.read({ reference: base.reference }));
    expect(accepted.conflicts).toEqual([]);
    const file = join(h.checkout, path);
    if (interrupted === "touched") await utimes(file, new Date(0), new Date(0));
    if (interrupted === "replaced") {
      const replacement = `${file}.next`;
      await writeFile(replacement, await readFile(file));
      await rename(replacement, file);
    }
    expect((await projectionCommand(command, ["save"])).result).toMatchObject({ status: "ok", result: { relocked: [{ path }] } });
    expect(success(await h.store.read({ reference: base.reference })).version).toBe(accepted.version);
    expect(submissions).toBe(1);
  } else await h.openAndSave(path, current.content);
  expect(success(await h.store.read({ reference: base.reference })).conflicts).toEqual([]);
  expect(await h.check()).toEqual({ kind: "removable" });
}

// The notice case uses real repositories and three synchronization operations before verifying the repair.
it("holds an unedited archive conflict shown by notice until its named repair",
  () => checkUneditedArchiveConflictRepair("notice"), process.platform === "win32" ? 60_000 : 30_000);
it("holds an unedited archive conflict shown by markers until its named repair",
  () => checkUneditedArchiveConflictRepair("markers"), 30_000);

it.each([true, "touched", "replaced"] as const)("does not resubmit a conflict resolution accepted before interruption (%s)",
  interrupted => checkUneditedArchiveConflictRepair("markers", interrupted), 30_000);

it.each(["repeat", "interrupted", "fan-out"] as const)("preserves a partially accepted archive Markdown edit during %s", async operation => {
  const { f, folder, description, projected } = await createErrandAdoptionFixture({ completed: true });
  const path = `${folder}/errand-alpha.md`, file = join(f.root, path);
  const base = "## Description\n\n### First\n\n- _Id:_ `11111111`\n\nbase first\n\n"
    + "### Second\n\n- _Id:_ `22222222`\n\nbase second\n";
  success(await f.store.write(update(f, description, base)));
  const starting = success(await f.store.read({ reference: description.reference }));
  success(await f.store.write(update(f, starting, base.replace("base first", "stored first"))));
  success(await f.store.write(update(f, starting, base.replace("base first", "incoming first"))));
  let submissions = 0;
  const store = overrideEngineStore(f.store, { batch: async (input: Parameters<typeof f.store.batch>[0]) => {
    const result = await f.store.batch(input);
    if (++submissions === 1 && operation === "interrupted") {
      const root = projectionProcessState().roots.get(f.root);
      if (root === undefined) throw new Error("Missing archive projection root");
      root.checkpoint = async () => { throw new Error("Stopped after the partial landing"); };
    }
    return result;
  } });
  const command = { checkout: f.root, store };
  await projectionCommand(command, ["status"]);
  expect((await projectionCommand(command, ["edit", file])).result).toMatchObject({ status: "ok" });
  const rendered = await readFile(file, "utf8");
  expect(rendered).toContain("=======");
  const edited = rendered.replace(/^=======\n/mu, "").replace("stored first", "held first edit").replace("base second", "accepted second edit");
  await writeFile(file, edited);
  if (operation === "interrupted") await expect(projectionCommand(command, ["save"])).rejects.toThrow("Stopped after the partial landing");
  else expect((await projectionCommand(command, ["save"])).diagnostics).toContain("marker-malformed");
  const accepted = success(await store.read({ reference: description.reference }));
  expect(accepted.content).toContain("accepted second edit");
  expect(accepted.content).not.toContain("held first edit");
  if (operation === "fan-out") {
    await checkHeldFanOutRemoval(f, accepted, path, edited);
    return;
  }

  expect((await projectionCommand(command, ["save"])).diagnostics).toContain("marker-malformed");
  expect(await readFile(file, "utf8")).toBe(edited);
  expect(submissions).toBe(1);
  expect(success(await store.read({ reference: description.reference })).version).toBe(accepted.version);
  const index = await readProjectionIndex(projected.location, true, { groups: "all" });
  const entry = index.kind === "index" ? index.index.entries[path] : undefined;
  expect(entry).toMatchObject({ opened: true, pending: true });
  if (entry?.kind !== "record") throw new Error("Missing partially accepted file entry");
  const repaired = accepted.content.replace("stored first", "held first edit");
  await writeFile(file, renderStampedFile({ content: repaired, stamp: entry.base.blob }));
  expect((await projectionCommand(command, ["save"])).result).toMatchObject({ status: "ok", result: { relocked: [{ path }] } });
  expect(success(await store.read({ reference: description.reference })).content).toBe(repaired);
  expect(submissions).toBe(2);
}, 30_000);

async function checkHeldFanOutRemoval(f: Awaited<ReturnType<typeof createErrandAdoptionFixture>>["f"],
  accepted: StoreRecord, path: string, original: string): Promise<void> {
  const context = { store: f.store, identity: SlugSchema.parse("andrew") };
  expect(await checkProjectionRemoval(f.root, context)).toMatchObject({ kind: "would-refuse",
    remedy: { text: expect.stringContaining("Finish resolving the affected set") } });
  const holder = await seed(f, recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "partial-peer" })),
    makeMetaFixture("partial-peer", { owner: "andrew", state: "Active", currentWorkflow: "process-task-loop", workClass: "Light", priority: "P1" }),
    { kind: "active" });
  const peer = join(f.root, ".arc-fixture", "partial-peer");
  await f.ports.exec("git", ["worktree", "add", "-b", "feat/partial-peer", peer], { cwd: f.root });
  await configureEngineCheckout(peer);
  await writeWorktreeMarker(peer, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: new Date(0).toISOString(),
    createdFor: boundWorkUnitSubject(holder) });
  const native = createRefStore(createDefaultRefStorePorts({ checkoutRoot: peer, backingRepository: async () => null }));
  const store = withFanOut(native, createProjectionFanOutDependencies(peer));
  const command = { checkout: peer, store };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  try {
    success(await store.write({ action: "remove", reference: accepted.reference, expected: accepted.version, provenance: testProvenance }));
    expect(projectionProcessState().diagnostics.filter(issue => issue.path === path).map(issue => issue.mark.reason))
      .toEqual(expect.arrayContaining([expect.stringContaining("marker-malformed")]));
    expect(await readFile(join(f.root, path), "utf8")).toBe(original);
  } finally { await endProjection(command); }
  expect(await readFile(join(f.root, path), "utf8")).toBe(original);
}

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
  expect(await h.check()).toMatchObject({ kind: "refused", reason: "unobservable", detail: expect.stringContaining("symbolic link") });
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
  expect(await h.check()).toMatchObject({ kind: "refused", reason: "unobservable", detail: expect.stringContaining("symbolic link") });

  await rm(folder, { recursive: true });
  await rename(held, folder);
  expect((await projectionCommand(h.input, ["save"])).result).toMatchObject({ status: "ok", result: { relocked: [{ path }] } });
  expect(success(await h.store.read({ reference }))).toMatchObject({ content,
    ...(accepted.status === "ok" ? { version: accepted.result.version } : {}) });
}, 30_000);
