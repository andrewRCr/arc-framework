/** An archive path behind a folder link or a nested checkout is left untouched by every command until it is repaired. */
import { chmod, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { archiveRetirementFixture } from "../../../helpers/store/projection/archive-retirement.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { seed, success, update } from "../../../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { createProjectionFanOutDependencies } from "../../../../src/lib/store/projection/fan-out-binding.js";
import { readProjectionIndex, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { withProjectionEntry } from "../../../../src/lib/store/projection/index-memory.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";
import { checkProjectionRemoval } from "../../../../src/lib/store/projection/removal-check.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";

afterEach(() => { beginProjectionCommand(); });

type Fixture = Awaited<ReturnType<typeof archiveRetirementFixture>>;
type Blocker = "nested checkout" | "folder link";
type State = "opened" | "opened new" | "unfinished recording" | "aside copy" | "exited copy";

const BLOCKERS: readonly Blocker[] = ["nested checkout", "folder link"];
const REASON: Record<Blocker, string> = { "nested checkout": "belongs to another checkout", "folder link": "crosses a symbolic link" };

/** Place the blocker at the archived work unit's folder and return its repair. */
async function block(h: Fixture, blocker: Blocker, folder = h.folder): Promise<() => Promise<void>> {
  const at = join(h.checkout, folder);
  if (blocker === "nested checkout") {
    await mkdir(join(at, ".git"));
    await writeFile(join(at, ".git", "HEAD"), "ref: refs/heads/main\n");
    return async () => { await rm(join(at, ".git"), { recursive: true }); };
  }
  const held = join(h.checkout, "..", `held-${folder.split("/").pop() ?? "archive"}`);
  await rename(at, held);
  await symlink(held, at, "junction");
  return async () => { await rm(at, { recursive: true }); await rename(held, at); };
}

/** Reach one archived state and name the path it is at. */
async function reach(h: Fixture, state: State): Promise<string> {
  if (state === "opened") {
    expect((await projectionCommand(h.input, ["edit", join(h.checkout, h.path)])).result).toMatchObject({ status: "ok" });
    return h.path;
  }
  if (state === "opened new") {
    const path = `${h.folder}/new-companion.txt`;
    await writeFile(join(h.checkout, path), "A local archive companion.\n");
    expect((await projectionCommand(h.input, ["edit", join(h.checkout, path)])).result).toMatchObject({ status: "ok" });
    return path;
  }
  if (state === "unfinished recording") {
    expect((await projectionCommand(h.input, ["edit", join(h.checkout, h.path)])).result).toMatchObject({ status: "ok" });
    await h.write(h.path, `${h.primary.content}\nAccepted archived input.\n`);
    const fault = createRefusingStore(h.store);
    const store = { ...fault.store, batch: async (input: Parameters<typeof h.store.batch>[0]) => {
      const result = await h.store.batch(input);
      if (result.status === "ok") fault.refuse("read", { code: "state-unresolvable", class: "recoverable", historyRefs: [],
        condition: "Read-back is temporarily unavailable.", remedy: { text: "Repair read-back and retry arc save." } });
      return result;
    } };
    await projectionCommand({ ...h.input, store }, ["save"]);
    fault.refuse("read", null);
    expect((await h.disk()).index.entries[h.path]).toMatchObject({ persisted: { recording: true } });
    return h.path;
  }
  const { location, index } = await h.disk();
  const entry = index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Expected an archived file entry");
  const file = join(h.checkout, h.path), original = await readFile(file, "utf8");
  const writer = await createProjectionEnginePorts(h.checkout).writer();
  // Another instance of this process left an exited copy, which the sweep takes over; this one's copy stays running.
  const name = nameAsideFile({ path: h.path, base: entry.base.blob, role: "aside",
    writer: state === "exited copy" ? { ...writer, processInstance: "exited-writer" } : writer });
  await mkdir(dirname(join(h.checkout, name)), { recursive: true });
  await rename(file, join(h.checkout, name));
  await writeProjectionIndex(location, withProjectionEntry(index, h.path, { ...entry, pending: true,
    copies: [{ name, moving: gitBlobId(original, "sha1"), linked: null, landed: null, writeBackSent: false,
      rendering: { markers: entry.markers, notices: entry.notices } }] }));
  return h.path;
}

/** The path's entry, file bytes, and stored version, which no command may change while the path is refused. */
async function observe(h: Fixture, path: string) {
  const entry = (await h.disk()).index.entries[path];
  const copies = entry?.kind === "record" ? entry.copies.map(copy => copy.name) : [];
  const read = async (at: string) => { try { return await readFile(join(h.checkout, at)); } catch { return null; } };
  return { entry, file: await read(path), copies: await Promise.all(copies.map(read)),
    stored: success(await h.store.read({ reference: h.primary.reference })).version };
}

const STATES: readonly State[] = ["opened", "opened new", "unfinished recording", "aside copy", "exited copy"];

it.each(BLOCKERS.flatMap(blocker => STATES.map(state => [state, blocker] as const)))(
  "leaves an archive path in the %s state behind a %s untouched by every command until its repair", async (state, blocker) => {
  const h = await archiveRetirementFixture();
  const path = await reach(h, state);
  const repair = await block(h, blocker);
  const before = await observe(h, path);
  const reason = REASON[blocker];

  for (const verb of ["status", "save", "sync"] as const) {
    const { diagnostics } = await projectionCommand(h.input, [verb]);
    expect(diagnostics, verb).toContain(reason);
    // Each command reports the refused path once, whichever of its steps selects it first.
    expect(diagnostics.split("\n").filter(line => line.includes(path) && line.includes(reason)), verb).toHaveLength(1);
    // A nested checkout's own files are that checkout's: never read, named, or recorded here.
    expect(diagnostics, verb).not.toContain("/.git/");
    expect(await observe(h, path), verb).toEqual(before);
  }
  expect(await checkProjectionRemoval(h.checkout, h.context)).toMatchObject({ kind: "unobservable", detail: expect.stringContaining(reason) });
  for (const operation of ["persist", "release"] as const) {
    expect(await h.retire(operation), operation).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining(reason) } });
    expect(await observe(h, path), operation).toEqual(before);
  }

  await repair();
  expect((await projectionCommand(h.input, [state.endsWith("copy") ? "status" : "save"])).diagnostics).not.toContain(reason);
  expect(await h.check()).toEqual({ kind: "removable" });
}, 60_000);

it.each(BLOCKERS)("leaves an opened archive path behind a %s untouched by a fan-out's visit and a refresh", async blocker => {
  const h = await archiveRetirementFixture();
  const path = await reach(h, "opened");
  const repair = await block(h, blocker);
  const before = await observe(h, path);
  const current = success(await h.f.store.read({ reference: h.primary.reference }));
  const correction = "A correction from another worktree.";
  const fanned = withFanOut(h.f.store, createProjectionFanOutDependencies(h.f.root));
  expect(await fanned.write(update(h.f, current, `${current.content}\n${correction}\n`))).toMatchObject({ status: "ok" });
  expect({ ...await observe(h, path), stored: before.stored }).toEqual(before);

  expect((await projectionCommand(h.input, ["status"])).diagnostics).toContain(REASON[blocker]);
  expect({ ...await observe(h, path), stored: before.stored }).toEqual(before);

  await repair();
  expect((await projectionCommand(h.input, ["status"])).diagnostics).not.toContain(REASON[blocker]);
  expect(await readFile(join(h.checkout, path), "utf8")).toContain(correction);
}, 60_000);

it.each(BLOCKERS)("refuses a %s made after selection at that path's change while save finishes its other paths", async blocker => {
  const h = await archiveRetirementFixture();
  const quarter = ArchiveQuarterSchema.parse("2026-q4");
  await seed(h.f, recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "beta" })),
    makeMetaFixture("beta", { state: "Shipped", currentWorkflow: null, workClass: "Light", priority: "P1", owner: "andrew" }),
    { kind: "completed", quarter });
  await projectionCommand(h.input, ["status"]);
  const other = Object.keys((await h.disk()).index.entries).find(path => path.endsWith("/meta-beta.md"));
  if (other === undefined) throw new Error("The second archived record was not laid");
  for (const path of [h.path, other]) {
    expect((await projectionCommand(h.input, ["edit", join(h.checkout, path)])).result).toMatchObject({ status: "ok" });
  }
  let repair: (() => Promise<void>) | null = null;
  const store = { ...h.store, batch: async (input: Parameters<typeof h.store.batch>[0]) => {
    const result = await h.store.batch(input);
    repair ??= await block(h, blocker);
    return result;
  } };
  await h.write(h.path, `${h.primary.content}\nA correction to alpha.\n`);
  const saved = await projectionCommand({ ...h.input, store }, ["save"]);
  expect(saved.diagnostics).toContain(REASON[blocker]);
  expect(saved.result).toMatchObject({ result: { relocked: [{ path: other }] } });
  expect((await h.disk()).index.entries[h.path]).toMatchObject({ opened: true });
  expect((await h.disk()).index.entries[other]).not.toHaveProperty("opened");

  if (repair === null) throw new Error("The save sent nothing");
  await (repair as () => Promise<void>)();
  await chmod(join(h.checkout, h.path), 0o644);
  expect((await projectionCommand(h.input, ["save"])).result).toMatchObject({ status: "ok", result: { relocked: [{ path: h.path }] } });
  expect(success(await h.store.read({ reference: h.primary.reference })).content).toContain("A correction to alpha.");
}, 60_000);

it.each(BLOCKERS)("reports a %s made after a refresh selected the path at the change it refuses", async blocker => {
  const h = await archiveRetirementFixture();
  const path = await reach(h, "opened");
  const current = success(await h.f.store.read({ reference: h.primary.reference }));
  const correction = "A correction from another worktree.";
  expect(await h.f.store.write(update(h.f, current, `${current.content}\n${correction}\n`))).toMatchObject({ status: "ok" });
  const before = await readFile(join(h.checkout, path));
  let repair: (() => Promise<void>) | null = null;
  // The refresh has selected the path and re-checked its file; the blocker arrives just before the move aside.
  const ports = () => ({ ...createProjectionEnginePorts(h.checkout), hooks: { afterRecheck: async (at: string) => {
    if (at === path) repair ??= await block(h, blocker);
  } } });
  expect((await projectionCommand({ ...h.input, ports }, ["status"])).diagnostics).toContain(REASON[blocker]);
  expect(await readFile(join(h.checkout, path))).toEqual(before);

  if (repair === null) throw new Error("The refresh moved nothing");
  await (repair as () => Promise<void>)();
  await projectionCommand(h.input, ["status"]);
  expect(await readFile(join(h.checkout, path), "utf8")).toContain(correction);
}, 60_000);

it.each(BLOCKERS)("rebuilds a lost index around an archive path behind a %s without reading it, then rebuilds the path after its repair",
  async blocker => {
  const h = await archiveRetirementFixture();
  const repair = await block(h, blocker);
  const { location } = await h.disk();
  const before = await readFile(join(h.checkout, h.path));
  await rm(join(location.stateDir, "index"));
  expect((await projectionCommand(h.input, ["sync"])).diagnostics).toContain(REASON[blocker]);
  const found = await readProjectionIndex(location, true, { groups: "all" });
  if (found.kind !== "index") throw new Error("Sync left no usable index");
  expect(Object.keys(found.index.entries).filter(path => path.includes("/.git/"))).toEqual([]);
  expect(found.index.entries[h.path]).toMatchObject({ kind: "record", pending: true, stat: null,
    refused: { reason: expect.stringContaining(REASON[blocker]) } });
  expect(await readFile(join(h.checkout, h.path))).toEqual(before);

  await repair();
  expect((await projectionCommand(h.input, ["status"])).diagnostics).not.toContain(REASON[blocker]);
  expect((await h.disk()).index.entries[h.path]).toMatchObject({ kind: "record", pending: false, withheld: false, refused: null });
  expect(await readFile(join(h.checkout, h.path))).toEqual(before);
  expect(await h.check()).toEqual({ kind: "removable" });
}, 60_000);

it("answers the removal check as persist does over an unopened archived file's edit in an aside copy", async () => {
  const h = await archiveRetirementFixture();
  await reach(h, "aside copy");
  const entry = (await h.disk()).index.entries[h.path];
  if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("Expected the archived file's aside copy");
  const copy = join(h.checkout, entry.copies[0].name), original = await readFile(copy, "utf8");
  await chmod(copy, 0o644);
  await writeFile(copy, `${original}\nAn edit made without opening the file.\n`);
  // The path holds the rendering the interrupted swap linked in, so the copy is the newer edit.
  await writeFile(join(h.checkout, h.path), original);
  const { location, index } = await h.disk();
  await writeProjectionIndex(location, withProjectionEntry(index, h.path, { ...entry, copies: [{ ...entry.copies[0], linked: gitBlobId(original, "sha1") }] }));
  expect(await checkProjectionRemoval(h.checkout, h.context)).toMatchObject({ kind: "would-refuse", remedy: { text: expect.stringContaining("arc edit") } });
  expect(await h.retire("persist")).toMatchObject({ kind: "refused", remedy: { text: expect.stringContaining("arc edit") } });
}, 60_000);

it("sends only the accepted input when an unopened archived file changes while save finishes its recording", async () => {
  const h = await archiveRetirementFixture();
  await reach(h, "unfinished recording");
  const { location, index } = await h.disk();
  const entry = index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Expected an archived file entry");
  const unopened = { ...entry };
  delete unopened.opened;
  await writeProjectionIndex(location, withProjectionEntry(index, h.path, unopened));
  const racing = "A racing edit made while save runs.";
  let raced = false;
  const store = { ...h.store, read: async (input: Parameters<typeof h.store.read>[0]) => {
    if (!raced) { raced = true; await h.write(h.path, `${h.primary.content}\nAccepted archived input.\n${racing}\n`); }
    return h.store.read(input);
  } };
  const saved = await projectionCommand({ ...h.input, store }, ["save"]);
  expect(raced).toBe(true);
  const stored = success(await h.store.read({ reference: h.primary.reference })).content;
  expect(stored).toContain("Accepted archived input.");
  expect(stored).not.toContain(racing);
  expect(saved.diagnostics).toContain("arc edit");
}, 60_000);
