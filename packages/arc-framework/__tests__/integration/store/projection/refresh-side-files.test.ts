/**
 * Side files never lay through a refresh; a side file occupying a laid path's folder, or something other than a regular
 * file at a laid or removed path, leaves only that path unlaid, reported.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createEngineFixture, overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { seed, success, update } from "../../../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

const SIDE_FILE = ".arc/user/andrew/scratch/.DS_Store";
const LOCAL_BYTES = "Finder's own bytes.\n";
const SIDE_FILE_TIMEOUT_MS = 120_000;

const expired = StoreRefusalSchema.parse({ code: "state-unresolvable", class: "recoverable", historyRefs: [],
  condition: "The saved projection anchor expired.", remedy: { text: "Rebuild from current state." } });

async function fixture() {
  const h = await createEngineFixture(directories);
  const cycle = async (store: Store = h.store) => {
    const command = { store, checkout: h.checkout, ports: h.ports };
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    await endProjection(command);
  };
  const storeSideFile = () => seed(h, RecordReferenceSchema.parse({ kind: "personal/document",
    owner: { type: "person", name: "andrew" }, key: "scratch/.DS_Store" }), "Stored side file.\n");
  return { ...h, cycle, storeSideFile };
}

async function expectUnlaid(h: Awaited<ReturnType<typeof fixture>>, local: boolean) {
  if (local) expect(await readFile(join(h.checkout, SIDE_FILE), "utf8")).toBe(LOCAL_BYTES);
  else await expect(readFile(join(h.checkout, SIDE_FILE))).rejects.toMatchObject({ code: "ENOENT" });
  const index = await h.disk();
  expect(index.entries[SIDE_FILE]).toBeUndefined();
  expect(index.state).toBe(success(await h.store.version()));
  expect(index.reprojectionPending).toBeUndefined();
}

async function placeLocalBytes(h: Awaited<ReturnType<typeof fixture>>) {
  await mkdir(join(h.checkout, ".arc/user/andrew/scratch"), { recursive: true });
  await writeFile(join(h.checkout, SIDE_FILE), LOCAL_BYTES);
}

for (const local of [false, true]) {
  const bytes = local ? "with local bytes there" : "with nothing there";
  it(`leaves a stored side-file record unlaid through a changed-record refresh, ${bytes}`, async () => {
    const h = await fixture();
    await h.cycle();
    await h.storeSideFile();
    if (local) await placeLocalBytes(h);
    await h.cycle();
    await expectUnlaid(h, local);
  }, SIDE_FILE_TIMEOUT_MS);

  it(`leaves a stored side-file record unlaid through a rebuild over an expired anchor, ${bytes}`, async () => {
    const h = await fixture();
    await h.cycle();
    await h.storeSideFile();
    if (local) await placeLocalBytes(h);
    await h.cycle(overrideEngineStore(h.store, { changes: () => Promise.resolve({ status: "refused", refusal: expired }) }));
    await expectUnlaid(h, local);
  }, SIDE_FILE_TIMEOUT_MS);

  it(`leaves a stored side-file record unlaid through a reprojection, ${bytes}`, async () => {
    const h = await fixture();
    await h.storeSideFile();
    await h.cycle();
    if (local) await placeLocalBytes(h);
    await mkdir(join(h.checkout, ".arc/system"), { recursive: true });
    await writeFile(join(h.checkout, ".arc/system/arc-config.yml"), "layout.active: flat\n");
    await h.cycle();
    expect((await h.disk()).projectedUnder.layoutActive).toBe("flat");
    await expectUnlaid(h, local);
  }, SIDE_FILE_TIMEOUT_MS);
}

it("leaves an arrival unlaid while a regular file occupies its folder, refreshes the rest, and lays it once the file moves", async () => {
  const h = await fixture();
  await h.cycle();
  const occupying = join(h.checkout, ".arc/user/andrew/scratch/notes.md~");
  const arrival = ".arc/user/andrew/scratch/notes.md~/arrival.md";
  await seed(h, RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" },
    key: "scratch/notes.md~/arrival.md" }), "An arrival under an occupied folder.\n");
  await writeFile(occupying, "An editor's side file where a folder belongs.\n");
  // A second arrival in the same window, planned after the occupied one, still lands.
  const later = ".arc/user/andrew/scratch/later.md";
  await seed(h, RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" },
    key: "scratch/later.md" }), "A later arrival in the same window.\n");
  const anchor = (await h.disk()).state;
  await h.cycle();
  const held = await h.disk();
  expect(held.state).toBe(anchor);
  expect(held.entries[arrival]).toMatchObject({ kind: "record", pending: true });
  expect(await readFile(join(h.checkout, later), "utf8")).toContain("A later arrival in the same window.");
  expect(held.entries[later]).toMatchObject({ kind: "record", pending: false });
  await rm(occupying);
  await h.cycle();
  expect(await readFile(join(h.checkout, arrival), "utf8")).toContain("An arrival under an occupied folder.");
  expect((await h.disk()).state).toBe(success(await h.store.version()));
}, SIDE_FILE_TIMEOUT_MS);

it("holds the anchor while a regular file replaces a bound path's folder, and lays the path's change once the file moves", async () => {
  const h = await fixture();
  const bound = ".arc/user/andrew/scratch/sub/bound.md", folder = join(h.checkout, ".arc/user/andrew/scratch/sub");
  const record = await seed(h, RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" },
    key: "scratch/sub/bound.md" }), "A bound file.\n");
  await h.cycle();
  expect((await h.disk()).entries[bound]).toMatchObject({ kind: "record", pending: false });
  success(await h.store.write(update(h, record, "The bound file's stored change.\n")));
  await rm(folder, { recursive: true });
  await writeFile(folder, "An editor's side file where a folder belongs.\n");
  const anchor = (await h.disk()).state;
  await h.cycle();
  const held = await h.disk();
  expect(held.state).toBe(anchor);
  expect(held.entries[bound]).toMatchObject({ kind: "record", reference: record.reference, pending: true });
  await rm(folder);
  await h.cycle();
  expect(await readFile(join(h.checkout, bound), "utf8")).toContain("The bound file's stored change.");
  expect((await h.disk()).state).toBe(success(await h.store.version()));
}, SIDE_FILE_TIMEOUT_MS);

/** Start a command, returning this command's not-a-file reports for one path, then end it. */
async function notAFileCycle(h: Awaited<ReturnType<typeof fixture>>, path: string): Promise<unknown[]> {
  const command = { store: h.store, checkout: h.checkout, ports: h.ports };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  const reports = projectionProcessState().diagnostics.filter(each => each.path === path && each.mark.reason.includes("not a regular file"));
  await endProjection(command);
  return reports;
}

it("holds a directory at a laid path in a rebuild with no index pending as not a file, reported, and lays the path once it moves", async () => {
  const h = await fixture();
  await h.cycle();
  await rm(join(h.location.stateDir, "index"));
  await rm(join(h.checkout, h.path));
  await mkdir(join(h.checkout, h.path));
  expect(await notAFileCycle(h, h.path)).toHaveLength(1);
  expect((await h.disk()).entries[h.path]).toMatchObject({ kind: "record", pending: true, withheld: false, refused: { reason: "not-a-file" } });
  await rm(join(h.checkout, h.path), { recursive: true });
  await h.cycle();
  expect(await h.file()).toContain("base");
  expect((await h.disk()).entries[h.path]).toMatchObject({ kind: "record", pending: false, refused: null });
}, SIDE_FILE_TIMEOUT_MS);

it.each(["lays", "removes"] as const)("reports a directory at a path the refresh %s, holds it pending, and settles once it moves", async step => {
  const h = await fixture();
  await h.cycle();
  const current = await h.stored();
  success(await h.store.write(step === "lays" ? update(h, current, "opening\nchanged\nclosing\n")
    : { action: "remove", reference: current.reference, expected: current.version, provenance: { verb: "fixture", lifecycleAction: "remove" } }));
  await rm(join(h.checkout, h.path));
  await mkdir(join(h.checkout, h.path));
  expect(await notAFileCycle(h, h.path)).toHaveLength(1);
  expect((await h.disk()).entries[h.path]).toMatchObject({ kind: "record", pending: true, refused: { reason: "not-a-file" } });
  await rm(join(h.checkout, h.path), { recursive: true });
  await h.cycle();
  if (step === "lays") {
    expect(await h.file()).toContain("changed");
    expect((await h.disk()).entries[h.path]).toMatchObject({ kind: "record", pending: false, refused: null });
  }
  else expect((await h.disk()).entries[h.path]).toBeUndefined();
  expect((await h.disk()).state).toBe(success(await h.store.version()));
}, SIDE_FILE_TIMEOUT_MS);
