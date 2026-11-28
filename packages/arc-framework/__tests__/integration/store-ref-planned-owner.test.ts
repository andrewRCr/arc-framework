import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { readWorkItemByUid } from "../../src/lib/store/work-item-uid.js";
import { transientContent } from "../helpers/store/in-repo-substrates.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");

function errandPut(name: string, uid: string) {
  const reference = RecordReferenceSchema.parse({ kind: "work-item/record", owner: { type: "work-item", name, uid } });
  return { action: "put" as const, reference, expected: null, content: transientContent(reference), placement: { kind: "active" as const } };
}

it.each(["record first", "cohort first"])("refuses a cohort claiming the Errand's planned UID (%s)", async (order) => {
  const { store } = await createRefReadFixture();
  const uid = "abcdef01-2345-4678-9abc-def012345678";
  const cohort = RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: "shared", uid } });
  // A completed record and a live cohort may share a slug, so only the UID collides.
  const recordPut = { ...errandPut("shared", uid), placement: { kind: "completed" as const, quarter } };
  const cohortPut = { action: "put" as const, reference: cohort, expected: null, content: "# Shared cohort\n\n**Purpose:** Track members.\n" };
  const writes = order === "record first" ? [recordPut, cohortPut] : [cohortPut, recordPut];
  const result = await store.batch({ provenance: testProvenance, writes });
  expect(result.status).toBe("refused");
  expect(result).toMatchObject({ refusal: { condition: expect.stringContaining(uid), remedy: { text: expect.stringContaining("without a UID") } } });
  const corrected = RecordReferenceSchema.parse({ ...cohort, owner: { type: "cohort", name: "shared" } });
  const retry = success(await store.batch({ provenance: testProvenance, writes: [recordPut, { ...cohortPut, reference: corrected }] }));
  expect(retry.writes[0]?.reference).toEqual(recordPut.reference);
  const newCohort = retry.writes[1]?.reference.owner;
  expect(newCohort).toMatchObject({ type: "cohort", uid: expect.any(String) });
  expect(newCohort).not.toMatchObject({ uid });
});

it.each(["archive", "history"])("refuses a cohort UID held only in %s", async (retained) => {
  const f = await createRefReadFixture();
  const reference = RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: "ended" } });
  const ended = success(await f.store.write({ action: "put", reference, expected: null,
    content: "# Ended cohort\n\n**Purpose:** Track members.\n", placement: { kind: "completed", quarter }, provenance: testProvenance }));
  if (ended.reference.owner.type !== "cohort" || !ended.reference.owner.uid) throw new Error("Expected a minted cohort UID");
  const uid = ended.reference.owner.uid;
  const archive = `refs/arc/archive/${quarter}`;
  const history = expandStoredPath(ended.reference, { history: true }).ref;
  await f.exec("git", ["update-ref", "-d", retained === "archive" ? history : archive]);
  const write = await f.store.write({ ...errandPut("new-errand", uid), provenance: testProvenance });
  expect(write).toMatchObject({ status: "refused", refusal: {
    condition: expect.stringContaining(retained === "archive" ? archive : history), remedy: { text: expect.stringContaining("fresh UID") },
  } });
  const corrected = errandPut("new-errand", randomUUID());
  expect(success(await f.store.write({ ...corrected, provenance: testProvenance })).reference).toEqual(corrected.reference);
});

it("preserves a live cohort's unique UID when a new Errand with a free slug requests it", async () => {
  const { store } = await createRefReadFixture();
  const reference = RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: "existing" } });
  const cohort = success(await store.write({ action: "put", reference, expected: null,
    content: "# Existing cohort\n\n**Purpose:** Track members.\n", provenance: testProvenance })).reference;
  if (cohort.owner.type !== "cohort" || !cohort.owner.uid) throw new Error("Expected a minted cohort UID");
  const uid = cohort.owner.uid;
  const write = await store.write({ ...errandPut("new-errand", uid), provenance: testProvenance });
  const lookup = await readWorkItemByUid(store, uid, ["work-item/meta", "work-item/record", "cohort/document"]);
  expect({ write: write.status, selection: lookup.status === "refused" ? lookup.refusal.code : lookup.status })
    .toEqual({ write: "refused", selection: "ok" });
  expect(lookup).toMatchObject({ result: { reference: cohort } });
  expect(write).toMatchObject({ refusal: { condition: expect.stringContaining(uid), remedy: { text: expect.stringContaining("fresh UID") } } });
  const corrected = errandPut("new-errand", randomUUID());
  expect(success(await store.write({ ...corrected, provenance: testProvenance })).reference).toEqual(corrected.reference);
});

it("rechecks the planned UID when ownership changes before locking", async () => {
  const f = await createRefFixture();
  const cohort = f.reference("cohort/document");
  const held = success(await f.store.write({ action: "put", reference: cohort, expected: null,
    content: f.content(cohort), provenance: testProvenance })).reference;
  if (held.owner.type !== "cohort" || !held.owner.uid) throw new Error("Expected a minted cohort UID");
  const uid = held.owner.uid;
  const ref = `refs/arc/cohort/${uid}`;
  const { stdout: original } = await f.ports.exec("git", ["rev-parse", ref], { cwd: f.root });
  await f.ports.exec("git", ["update-ref", "-d", ref], { cwd: f.root });
  let arrived = false;
  const store = createRefStore({ ...f.ports, async lock(name, wait) {
    if (!arrived) {
      arrived = true;
      await f.ports.exec("git", ["update-ref", ref, original.trim()], { cwd: f.root });
    }
    return f.ports.lock(name, wait);
  } });
  const write = await store.write({ ...errandPut("new-errand", uid), provenance: testProvenance });
  expect(arrived).toBe(true);
  expect(write.status).toBe("refused");
});
