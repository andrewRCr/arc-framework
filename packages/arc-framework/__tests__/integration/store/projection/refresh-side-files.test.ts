/** Side files never lay through a refresh, and a side file occupying a laid path's folder leaves only that path unlaid. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createEngineFixture, overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";

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
  const anchor = (await h.disk()).state;
  await h.cycle();
  const held = await h.disk();
  expect(held.state).toBe(anchor);
  expect(held.entries[arrival]).toMatchObject({ kind: "record", pending: true });
  await rm(occupying);
  await h.cycle();
  expect(await readFile(join(h.checkout, arrival), "utf8")).toContain("An arrival under an occupied folder.");
  expect((await h.disk()).state).toBe(success(await h.store.version()));
}, SIDE_FILE_TIMEOUT_MS);
