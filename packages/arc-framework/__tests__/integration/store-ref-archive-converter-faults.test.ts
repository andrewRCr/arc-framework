/** Archive diagnostic conversions preserve object restoration across public operations. */

import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { parseCohortDocument } from "../../src/lib/store/kinds/cohort/parser.js";
import type { StoreRecord } from "../../src/lib/store/index.js";
import { createRefFixture, type RefConformanceFixture } from "../helpers/store/ref-fixture.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { mutationOf, seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");

it.each((["default", "separate"] as const).flatMap(layout =>
  (["write", "read", "saved-read"] as const).map(mode => ({ layout, mode }))))("restores missing archived metadata before retrying $mode in $layout", async ({ layout, mode }) => {
  const f = await createRefFixture({}, layout);
  const primary = await seed(f, f.reference("work-item/meta"));
  success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
  const record = success(await f.store.read({ reference: primary.reference }));
  const { before, restore } = await removeArchivedMetadata(f, record);
  if (record.reference.owner.type !== "work-item" || !record.reference.owner.uid) throw new Error("Expected a stored work-item UID");
  const history = `refs/arc/history/work/${record.reference.owner.uid}`;
  const write = update(f, record);
  const invoke = () => mode === "write" ? f.store.write(write)
    : f.store.read({ reference: record.reference, ...mode === "saved-read" ? { asOf: before } : {} });
  expect(await invoke()).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", historyRefs: mode === "saved-read" ? [history] : [],
    remedy: { text: expect.stringMatching(/restore|fetch/iu) },
  } });
  expect(await f.settle()).toBe(before);
  await restore();
  success(await invoke());
  expect(success(await f.store.read({ reference: record.reference })).content).toBe(mode === "write" ? write.content : record.content);
});


it.each(["default", "separate"] as const)("restores an archived parent's missing metadata before closing another cohort in %s", async layout => {
  const f = await createRefFixture({ "cohort/document": { parser: parseCohortDocument } }, layout);
  const closing = await seed(f, f.reference("cohort/document", "closing"), "# Closing\n");
  const parent = await seed(f, f.reference("cohort/document", "parent"), "# Parent\n");
  success(await f.store.write({ ...update(f, parent, parent.content), placement: { kind: "completed", quarter } }));
  const archived = success(await f.store.read({ reference: parent.reference }));
  const { before, restore } = await removeArchivedMetadata(f, archived);
  const write = { ...update(f, closing, closing.content), placement: { kind: "completed" as const, quarter } };
  expect(await f.store.write(write)).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", historyRefs: [],
    remedy: { text: expect.stringMatching(/restore|fetch/iu) },
  } });
  expect(await f.settle()).toBe(before);
  await restore();
  success(await f.store.write(write));
  expect(success(await f.store.read({ reference: closing.reference })).placement).toMatchObject({ kind: "completed", quarter });
});

async function removeArchivedMetadata(f: RefConformanceFixture, record: StoreRecord) {
  const home = expandStoredPath(record.reference, { placement: record.placement });
  const scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
  const oid = (await f.ports.exec("git", [...scope, "rev-parse", `${home.ref}:${home.metadataPath}`])).stdout.trim();
  const bytes = (await f.ports.rawExec([...scope, "cat-file", "blob", oid])).stdout;
  const before = await f.settle();
  await removeLooseObject(f.root, oid, f.gitDir);
  return { before, restore: async () => {
    const restored = await f.ports.rawExec([...scope, "hash-object", "-w", "--stdin"], { input: bytes });
    expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
  } };
}

it("restores archived metadata before accepting an observation in an independent write", async () => {
  const f = await createRefFixture();
  const primary = await seed(f, f.reference("work-item/meta"));
  success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
  const archived = success(await f.store.read({ reference: primary.reference }));
  const target = await seed(f, f.reference("personal/document"), "Before observation.\n");
  const { before, restore } = await removeArchivedMetadata(f, archived);
  const input = { writes: [mutationOf(update(f, target, "Accepted observation.\n"))], provenance: testProvenance,
    observations: [{ reference: archived.reference, expected: { version: archived.version, conflicts: [] } }] };
  expect(await f.store.batch(input)).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", historyRefs: [],
    remedy: { text: expect.stringMatching(/restore|fetch/iu) },
  } });
  expect(await f.settle()).toBe(before);
  await restore();
  success(await f.store.batch(input));
  expect(success(await f.store.read({ reference: target.reference })).content).toBe("Accepted observation.\n");
});

it("restores missing archive metadata before comparing a saved ending", async () => {
  const f = await createRefFixture();
  const primary = await seed(f, f.reference("work-item/meta"));
  const from = await f.settle();
  success(await f.store.write({ ...update(f, primary), placement: { kind: "completed", quarter } }));
  const archived = success(await f.store.read({ reference: primary.reference }));
  const { before: to, restore } = await removeArchivedMetadata(f, archived);
  const input = { from, to, references: [archived.reference] };
  expect(await f.store.changes(input)).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", historyRefs: [],
    remedy: { text: expect.stringMatching(/restore|fetch/iu) },
  } });
  await restore();
  expect(success(await f.store.changes(input))).toEqual(expect.arrayContaining([expect.objectContaining({ reference: archived.reference })]));
});
