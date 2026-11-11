/** Ownership remains journaled across interruptions and saves around an exclusive arrival link. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHandoffFixture } from "../../../helpers/store/projection/handoff-fixture.js";
import { installProjectionHandoff } from "../../../../src/lib/store/projection/ownership-install.js";
import { reconcileProjectionHandoffs } from "../../../../src/lib/store/projection/ownership-handoff.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { readStat } from "../../../../src/lib/store/projection/change-detection.js";
import { createWriteBackPort } from "../../../../src/lib/store/projection/write-back.js";
import { guardReplacement } from "../../../../src/lib/store/projection/replace-guard.js";
import { swapBatch } from "../../../../src/lib/store/projection/swap.js";

const fixtures: Awaited<ReturnType<typeof createHandoffFixture>>[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(h => h.dispose())); });

async function fixture() {
  const h = await createHandoffFixture("txt");
  fixtures.push(h);
  const old = await h.file();
  await rm(join(h.checkout, h.path));
  return { ...h, old };
}

it.each(["before-link", "after-link", "late-save"] as const)("retains both identities when interrupted %s", async moment => {
  const h = await fixture();
  const context = { ...h.context, hooks: { beforeRebuildLink: async () => {
    if (moment === "before-link") throw new Error("interrupted installation");
  } }, checkpoint: async () => {
    if (moment === "before-link" || await readStat(join(h.checkout, h.path)) === null) return;
    if (moment === "late-save") await writeFile(join(h.checkout, h.path), h.old);
    throw new Error("interrupted installation");
  } };
  await expect(installProjectionHandoff({ root: { ...h.root, context }, index: h.index,
    path: h.path, record: h.record, arriving: h.arrival, renderer: h.context.renderer })).rejects.toThrow("interrupted installation");
  const disk = await readProjectionIndex(h.location, true, { groups: "all" });
  expect(disk).toMatchObject({ kind: "index", index: { entries: { [h.path]: {
    reference: h.entry.reference, pending: true, withheld: true, handoff: { reference: h.arrival.reference },
  } } } });
  if (disk.kind !== "index") throw new Error("Missing interrupted journal");
  const recovered = await reconcileProjectionHandoffs(h.root, disk.index);
  const entry = recovered.entries[h.path];
  if (moment === "after-link") expect(entry).toMatchObject({ reference: h.arrival.reference, pending: false, withheld: false });
  else if (moment === "before-link") expect(entry).toMatchObject({ reference: h.entry.reference, pending: true, withheld: false });
  else {
    expect(entry).toMatchObject({ reference: h.entry.reference, withheld: true, handoff: { reference: h.arrival.reference } });
    if (entry?.kind !== "record") throw new Error("Missing held record");
    expect(await createWriteBackPort(h.context)({ ...h.request, entry })).toMatchObject({ answer: "refused" });
    expect(await h.file()).toBe(h.old);
  }
  expect(await h.store.read({ reference: h.entry.reference })).toMatchObject({ status: "ok", result: { version: h.entry.base.version } });
  expect(await h.store.read({ reference: h.arrival.reference })).toMatchObject({ status: "ok", result: { version: h.arrival.base.version } });
});

it("yields to a recreated leaving save and restores its authority before staged cleanup", async () => {
  const h = await fixture();
  const context = { ...h.context, hooks: { beforeRebuildLink: async () => {
    expect(await readProjectionIndex(h.location, true)).toMatchObject({ kind: "index", index: { entries: { [h.path]: {
      reference: h.entry.reference, handoff: { reference: h.arrival.reference }, withheld: true,
    } } } });
    await writeFile(join(h.checkout, h.path), h.old);
  } } };
  const index = await installProjectionHandoff({ root: { ...h.root, context }, index: h.index,
    path: h.path, record: h.record, arriving: h.arrival, renderer: h.context.renderer });
  const entry = index.entries[h.path];
  expect(entry).toMatchObject({ reference: h.entry.reference, pending: true, withheld: false });
  expect(entry?.kind === "record" ? entry.handoff : null).toBeUndefined();
  expect(await readFile(join(h.checkout, h.path), "utf8")).toBe(h.old);
  expect(await readProjectionIndex(h.location, true)).toMatchObject({ kind: "index", index: { entries: { [h.path]: {
    reference: h.entry.reference, withheld: false,
  } } } });
});

it("waits for the leaving record's last aside copy even though its pathname is absent", async () => {
  const h = await createHandoffFixture("txt");
  fixtures.push(h);
  const takeIn = createWriteBackPort(h.context);
  const guarded = await guardReplacement({ ...h.context, checkout: h.checkout, path: h.path, entry: h.entry,
    staged: null, reference: null, takeIn });
  if (guarded.kind !== "replace") throw new Error("Removal not admitted");
  const removed = await swapBatch({ ...h.context, checkout: h.checkout, index: h.index,
    files: [{ path: h.path, replace: guarded, relaid: true }], readBack: false, takeIn });
  expect(removed.copies).toHaveLength(1);
  expect(await readStat(join(h.checkout, h.path))).toBeNull();
  const held = await installProjectionHandoff({ root: h.root, index: removed.index,
    path: h.path, record: h.record, arriving: h.arrival, renderer: h.context.renderer });
  expect(await readStat(join(h.checkout, h.path))).toBeNull();
  expect(held.entries[h.path]).toMatchObject({ reference: h.entry.reference, copies: [{ name: removed.copies[0]?.copy }] });
});
