/** Exclusive installation is proved by destination identity and full bytes, independent of a staging pathname. */
import { link, mkdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createHandoffFixture } from "../../../helpers/store/projection/handoff-fixture.js";
import { reconcileProjectionHandoffs } from "../../../../src/lib/store/projection/ownership-handoff.js";
import { readProjectionIndex, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { releaseAbsentWithheldPaths } from "../../../../src/lib/store/projection/withheld.js";
import { reconcileProjectionLinks } from "../../../../src/lib/store/projection/discovery-links.js";
import { installProjectionHandoff } from "../../../../src/lib/store/projection/ownership-install.js";
import { projectionEntryForRecord } from "../../../../src/lib/store/projection/materialization-file.js";

/** One read of a path made to fail, or followed by a touch that moves its stat. */
const reading = vi.hoisted(() => ({ next: null as { path: string; action: "fail" | "touch" } | null }));
vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, readFile: async (...args: Parameters<typeof actual.readFile>) => {
    const result = await actual.readFile(...args);
    const next = reading.next;
    if (next === null || args[0] !== next.path) return result;
    reading.next = null;
    if (next.action === "fail") throw Object.assign(new Error("injected read failure"), { code: "EIO" });
    await actual.utimes(next.path, new Date(0), new Date(0));
    return result;
  } };
});

const fixtures: Awaited<ReturnType<typeof createHandoffFixture>>[] = [];
afterEach(async () => { reading.next = null; await Promise.all(fixtures.splice(0).map(h => h.dispose())); });

/** A journaled arrival whose bytes are installed at the path, ready to confirm. */
async function installedArrival() {
  const h = await createHandoffFixture("txt");
  fixtures.push(h);
  await writeProjectionIndex(h.location, h.journal);
  await rm(join(h.checkout, h.path));
  await link(join(h.checkout, h.staged.location), join(h.checkout, h.path));
  return { ...h, absolute: join(h.checkout, h.path) };
}

it("confirms installed bytes after the staged pathname is gone without acknowledging the whole layout", async () => {
  const h = await createHandoffFixture("txt");
  fixtures.push(h);
  const journal = { ...h.journal, reprojectionPending: true as const };
  await writeProjectionIndex(h.location, journal);
  await rm(join(h.checkout, h.path));
  await link(join(h.checkout, h.staged.location), join(h.checkout, h.path));
  await rm(join(h.checkout, h.staged.location));
  await reconcileProjectionHandoffs(h.root, journal);
  const recovered = await readProjectionIndex(h.location, true, { groups: "all" });
  expect(recovered).toMatchObject({ kind: "index", index: { reprojectionPending: true,
    entries: { [h.path]: { reference: h.arrival.reference, pending: false, withheld: false } } } });
  if (recovered.kind !== "index") throw new Error("Missing recovered index");
  const entry = recovered.index.entries[h.path];
  expect(entry?.kind === "record" ? entry.handoff : null).toBeUndefined();
});

it("clears an absent interrupted installation while retaining the leaving authority for retry", async () => {
  const h = await createHandoffFixture("txt");
  fixtures.push(h);
  await writeProjectionIndex(h.location, h.journal);
  await rm(join(h.checkout, h.path));
  const recovered = await reconcileProjectionHandoffs(h.root, h.journal);
  const entry = recovered.entries[h.path];
  expect(entry).toMatchObject({ reference: h.entry.reference, pending: true, withheld: false, refused: null });
  expect(entry?.kind === "record" ? entry.handoff : null).toBeUndefined();
  expect(await readProjectionIndex(h.location, true)).toMatchObject({ kind: "index",
    index: { entries: { [h.path]: { reference: h.entry.reference, pending: true, withheld: false } } } });
});

it.each(["empty", "read-failure", "moved-stat"] as const)("waits on an arrival with %s unreported, then confirms it once settled", async wait => {
  const h = await installedArrival();
  const bytes = await readFile(h.absolute);
  if (wait === "empty") await writeFile(h.absolute, "");
  else reading.next = { path: h.absolute, action: wait === "read-failure" ? "fail" : "touch" };
  const reported = h.reports.length;
  expect(await reconcileProjectionHandoffs(h.root, h.journal)).toBe(h.journal);
  expect(h.reports.slice(reported)).toEqual([]);
  if (wait === "empty") {
    await writeFile(h.absolute, bytes);
    await utimes(h.absolute, new Date(0), new Date(0));
  }
  const confirmed = await reconcileProjectionHandoffs(h.root, h.journal);
  expect(confirmed.entries[h.path]).toMatchObject({ reference: h.arrival.reference, pending: false, withheld: false });
});

it("holds an arrival path that is not a regular file with its own remedy, then confirms once repaired", async () => {
  const h = await installedArrival();
  await rm(h.absolute);
  await mkdir(h.absolute);
  const reported = h.reports.length;
  const held = await reconcileProjectionHandoffs(h.root, h.journal);
  expect(held.entries[h.path]).toMatchObject({ reference: h.entry.reference, pending: true, handoff: { reference: h.arrival.reference },
    refused: { reason: "not-a-file", remedy: { text: expect.stringContaining("regular file") } } });
  expect(h.reports.slice(reported)).toEqual([{ path: h.path, copy: null,
    mark: { reason: expect.stringContaining("not a regular file"), remedy: { text: expect.stringContaining("regular file") } } }]);
  await rm(h.absolute, { recursive: true });
  await link(join(h.checkout, h.staged.location), h.absolute);
  const confirmed = await reconcileProjectionHandoffs(h.root, held);
  expect(confirmed.entries[h.path]).toMatchObject({ reference: h.arrival.reference, pending: false, withheld: false });
});

it.each(["changed", "opened"] as const)("keeps a deleted arrival's %s mark for the retried installation", async mark => {
  const h = await createHandoffFixture("txt");
  fixtures.push(h);
  const journal = { ...h.index, entries: { [h.path]: { ...h.entry, pending: true, withheld: true, handoff: { ...h.arrival, [mark]: true } } } };
  await writeProjectionIndex(h.location, journal);
  await rm(join(h.checkout, h.path));
  const recovered = await reconcileProjectionHandoffs(h.root, journal);
  expect(recovered.entries[h.path]).toMatchObject({ reference: h.entry.reference, changed: false, [mark === "changed" ? "arrivingChanged" : "arrivingOpened"]: h.arrival.reference });
  const installed = await installProjectionHandoff({ root: h.root, index: recovered, path: h.path, record: h.record,
    arriving: projectionEntryForRecord(h.record, h.path, "sha1"), renderer: h.context.renderer });
  const confirmed = await reconcileProjectionHandoffs(h.root, installed);
  expect(confirmed.entries[h.path]).toMatchObject({ reference: h.arrival.reference, [mark]: true, pending: false });
});

it.each(["changed-in-place", "same-bytes-new-inode"] as const)("withholds and reports both identities for %s", async mode => {
  const h = await createHandoffFixture("txt");
  fixtures.push(h);
  await writeProjectionIndex(h.location, h.journal);
  await rm(join(h.checkout, h.path));
  if (mode === "changed-in-place") {
    await link(join(h.checkout, h.staged.location), join(h.checkout, h.path));
    await writeFile(join(h.checkout, h.path), "a late unstamped save\n");
  } else await writeFile(join(h.checkout, h.path), await readFile(join(h.checkout, h.staged.location)));
  const before = await h.file();
  const recovered = await reconcileProjectionHandoffs(h.root, h.journal);
  const entry = recovered.entries[h.path];
  expect(entry).toMatchObject({ reference: h.entry.reference, pending: true, withheld: true,
    handoff: { reference: h.arrival.reference }, refused: { reason: expect.stringContaining("Ownership handoff") } });
  expect(h.reports).toContainEqual({ path: h.path, copy: null, mark: {
    reason: expect.stringContaining(String(h.arrival.reference.key)), remedy: { text: expect.stringContaining("delete the withheld file") },
  } });
  expect(await h.file()).toBe(before);
  expect(await h.store.read({ reference: h.entry.reference })).toMatchObject({ status: "ok", result: { version: h.entry.base.version } });
  expect(await h.store.read({ reference: h.arrival.reference })).toMatchObject({ status: "ok", result: { version: h.arrival.base.version } });
});

it("keeps a journal withheld until ownership reconciliation authorizes its absence", async () => {
  const h = await createHandoffFixture("txt");
  fixtures.push(h);
  await rm(join(h.checkout, h.path));
  const released = await releaseAbsentWithheldPaths(h.root, h.journal);
  expect(released.entries[h.path]).toEqual(h.journal.entries[h.path]);
});

it("keeps a journal unchanged when its path becomes an opaque link", async () => {
  const h = await createHandoffFixture("txt");
  fixtures.push(h);
  await rm(join(h.checkout, h.path));
  await symlink(join(h.checkout, h.staged.location), join(h.checkout, h.path));
  const root = { ...h.root, blockedByLink: () => h.path, unsent: new Set<string>() };
  const recovered = await reconcileProjectionLinks(root, h.journal);
  expect(recovered.entries[h.path]).toEqual(h.journal.entries[h.path]);
  expect((await reconcileProjectionHandoffs(root, recovered)).entries[h.path]).toEqual(h.journal.entries[h.path]);
  expect((await reconcileProjectionHandoffs(h.root, recovered)).entries[h.path]).toEqual(h.journal.entries[h.path]);
});

it("keeps a proven arrival journal untouched until its root's ignore check authorizes mutation", async () => {
  const h = await createHandoffFixture("txt");
  fixtures.push(h);
  await writeProjectionIndex(h.location, h.journal);
  await rm(join(h.checkout, h.path));
  await link(join(h.checkout, h.staged.location), join(h.checkout, h.path));
  const recovered = await reconcileProjectionHandoffs({ ...h.root, writable: () => false }, h.journal);
  expect(recovered.entries[h.path]).toEqual(h.journal.entries[h.path]);
  expect(await readProjectionIndex(h.location, true)).toMatchObject({ kind: "index", index: { entries: { [h.path]: {
    reference: h.entry.reference, withheld: true, handoff: { reference: h.arrival.reference },
  } } } });
});
