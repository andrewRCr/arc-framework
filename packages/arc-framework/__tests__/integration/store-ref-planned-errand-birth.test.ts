import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { BatchCreationReceiptSchema, createKindRegistry, RecordReferenceSchema, type RecordReference } from "../../src/lib/store/index.js";
import { writeLineageRecord } from "../../src/lib/store/kinds/lineage/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { transientContent } from "../helpers/store/in-repo-substrates.js";
import { createRefFixture, type RefConformanceFixture } from "../helpers/store/ref-fixture.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { seed, success } from "../helpers/store/suite-tools.js";

const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
function errand(uid: string) {
  return RecordReferenceSchema.parse({ kind: "work-item/record", owner: { type: "work-item", name: "new-errand", uid } });
}

async function putErrand(f: RefConformanceFixture, reference: RecordReference) {
  const result = await f.store.write({ action: "put", expected: null, reference, content: transientContent(reference),
    placement: { kind: "active" }, provenance: { verb: "errand-open", lifecycleAction: "open" } });
  if (result.status === "refused") return result;
  const { stdout } = await f.ports.exec("git", ["show", "-s", "--format=%(trailers:key=Arc-Creation-Receipt,valueonly)",
    expandStoredPath(result.result.reference, { registry }).ref], { cwd: f.root });
  const { createdOwners } = BatchCreationReceiptSchema.parse(JSON.parse(stdout));
  return { status: result.status, createdOwners } as const;
}

it.each(["lineage and history", "lineage only"])("refuses an abandoned work unit's UID retained in %s", async (retained) => {
  const f = await createRefFixture(registry);
  const meta = f.reference("work-item/meta");
  const work = await seed(f, meta, makeMetaFixture(meta.owner.name));
  const owner = work.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected a minted work-unit UID");
  const firstBirth = success(await f.store.history({ reference: work.reference }))[0]?.creationReceipt;
  expect(firstBirth?.createdOwners).toEqual([work.reference]);
  const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner });
  const content = writeLineageRecord({ schemaVersion: 2, kind: "abandon", origin: { name: owner.name, uid: owner.uid },
    successors: [], incoming: [] });
  success(await f.store.batch({ writes: [
    { action: "put", expected: null, reference: lineage, content },
    { action: "remove", expected: work.version, reference: work.reference },
  ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
  expect(success(await f.store.read({ reference: lineage })).content).toBe(content);
  const live = expandStoredPath(work.reference, { registry }).ref;
  const history = expandStoredPath(work.reference, { registry, history: true }).ref;
  const refs = await f.ports.exec("git", ["for-each-ref", "--format=%(refname)", live, history], { cwd: f.root });
  expect(refs.stdout.trim()).toBe(history);
  if (retained === "lineage only") await f.ports.exec("git", ["update-ref", "-d", history], { cwd: f.root });
  expect(await putErrand(f, errand(owner.uid))).toMatchObject({ status: "refused",
    refusal: { condition: expect.stringContaining(owner.uid), remedy: { text: expect.stringContaining("fresh UID") } } });
  expect(success(await f.store.read({ reference: lineage })).content).toBe(content);
  const fresh = errand(randomUUID());
  expect(await putErrand(f, fresh)).toEqual({ status: "ok", createdOwners: [fresh] });
});

it("does not credit a new birth for a UID already present in the name of a record-free ref", async () => {
  const f = await createRefFixture(registry), reference = errand(randomUUID());
  await plantRef(f.root, expandStoredPath(reference, { registry }).ref, []);
  expect(await putErrand(f, reference)).toMatchObject({ status: "refused",
    refusal: { condition: expect.stringContaining(expandStoredPath(reference, { registry }).ref),
      remedy: { text: expect.stringContaining("fresh UID") } } });
  const fresh = errand(randomUUID());
  expect(await putErrand(f, fresh)).toEqual({ status: "ok", createdOwners: [fresh] });
});

it("credits the birth of a planned Errand with an unused UID", async () => {
  const f = await createRefFixture(registry), reference = errand(randomUUID());
  expect(await putErrand(f, reference)).toEqual({ status: "ok", createdOwners: [reference] });
});
