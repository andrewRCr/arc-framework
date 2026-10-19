/** Conflict inventory retains typed records, person scope and completeness evidence. */
import { expect, it } from "vitest";
import { RecordReferenceSchema } from "../../../src/lib/store/identity.js";
import type { Store } from "../../../src/lib/store/contract.js";
import { readStoreConflicts } from "../../../src/lib/status/store-conflicts.js";
import { seedStatusConflict } from "../../helpers/store/status-conflicts.js";
import { createReferenceFixture } from "../../helpers/store/reference-fixture.js";

async function readView(options: Parameters<typeof readStoreConflicts>[0]) {
  const result = await readStoreConflicts(options);
  expect(result.status).toBe("ok");
  if (result.status === "refused") throw new Error(result.refusal.condition);
  return result.result;
}


it("lists hunk, entry and whole-record conflicts across project, work-item and personal families", async () => {
  const f = createReferenceFixture(); f.identity("alice");
  const project = await seedStatusConflict(f, f.reference("project-machinery/conflict-record"), "hunk");
  const work = await seedStatusConflict(f, f.reference("work-item/conflict-record"));
  const personal = await seedStatusConflict(f, RecordReferenceSchema.parse({ kind: "personal/conflict-record", owner: { type: "person", name: "alice" }, key: "entry" }), "entry");
  const result = await readView({ store: f.store, identity: "alice" });
  expect(result.conflicts.map(row => row.reference)).toEqual(expect.arrayContaining([project.reference, work.reference, personal.reference]));
  expect(result.conflicts.map(row => JSON.parse(row.content).location.kind).sort()).toEqual(["entry", "hunk", "record"]);
  expect(result.conflicts.map(row => row.token)).toEqual(expect.arrayContaining(["personal/person/alice/entry", "project-machinery/project/project-one/one", "work-item/work-item/work-item-one/one"]));
  expect(result.warnings).toEqual([]);
});

it("discloses that personal and claims families were not read without an identity", async () => {
  const f = createReferenceFixture(); f.identity(undefined);
  const result = await readView({ store: f.store, identity: null });
  expect(result.conflicts).toEqual([]);
  expect(result.warnings.join(" ")).toMatch(/personal[\s\S]*claims[\s\S]*git config arc.identity <name>/u);
});

it("lists only the resolved person's personal and claims conflicts among two persons", async () => {
  const f = createReferenceFixture(); f.identity("alice");
  for (const name of ["alice", "bob"]) for (const family of ["personal", "claims"]) {
    await seedStatusConflict(f, RecordReferenceSchema.parse({ kind: `${family}/conflict-record`, owner: { type: "person", name }, key: "same" }));
  }
  const result = await readView({ store: f.store, identity: "alice" });
  expect(result.conflicts.map(row => row.token).sort()).toEqual(["claims/person/alice/same", "personal/person/alice/same"]);
});


it.each(["unreadable", "refused"] as const)("preserves a %s family failure and its repair route", async kind => {
  const f = createReferenceFixture(), store = Object.create(f.store) as Store;
  const failure = { condition: "Cohort conflicts unavailable.", remedy: { text: "Repair cohort inventory and retry." } };
  store.list = async input => input.family === "cohort" ? kind === "unreadable"
    ? { status: "ok", result: { status: "unreadable", ...failure } }
    : { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "cohort", ...failure } }
    : f.store.list(input);
  const result = await readStoreConflicts({ store, identity: "alice" });
  expect(result).toMatchObject({ status: "refused", refusal: { ...failure, code: kind === "unreadable" ? "listing-unreadable" : "namespace-corrupt" } });
  store.list = input => f.store.list(input);
  expect((await readStoreConflicts({ store, identity: "alice" })).status).toBe("ok");
});

it("retains good records beside every omitted key's family, condition and repair route", async () => {
  const f = createReferenceFixture(), store = Object.create(f.store) as Store;
  const good = await seedStatusConflict(f, f.reference("cohort/conflict-record"));
  store.list = async input => {
    const listing = await f.store.list(input);
    return input.family === "cohort" && listing.status === "ok" && listing.result.status === "complete"
      ? { status: "ok", result: { ...listing.result, missed: true, diagnostics: ["broken-one", "broken-two"].map(key => ({
        kind: "malformed", key, condition: `${key} cannot decode.`, remedy: { text: `Repair ${key} and retry.` } })) } } : listing;
  };
  const result = await readView({ store, identity: "alice" });
  expect(result.conflicts.map(row => row.reference)).toEqual([good.reference]);
  expect(result.incomplete).toBe(true);
  expect(result.warnings).toHaveLength(2);
  for (const key of ["broken-one", "broken-two"]) expect(result.warnings.join(" ")).toContain(`cohort ${key}: ${key} cannot decode. Repair ${key} and retry.`);
});

it("discloses an incomplete family with no per-record diagnostic beside its good records", async () => {
  const f = createReferenceFixture(), store = Object.create(f.store) as Store;
  const good = await seedStatusConflict(f, f.reference("cohort/conflict-record"));
  store.list = async input => {
    const listing = await f.store.list(input);
    return input.family === "cohort" && listing.status === "ok" && listing.result.status === "complete"
      ? { status: "ok", result: { ...listing.result, missed: true, diagnostics: [] } } : listing;
  };
  const result = await readView({ store, identity: "alice" });
  expect(result.conflicts.map(row => row.reference)).toEqual([good.reference]);
  expect(result.incomplete).toBe(true);
  expect(result.warnings.join(" ")).toMatch(/cohort[\s\S]*incomplete[\s\S]*[Rr]epair[\s\S]*arc status --conflicts/u);
});

it.each(["{", "{}"])("omits an undecodable conflict with its token and inspection route: %s", async content => {
  const f = createReferenceFixture(), store = Object.create(f.store) as Store;
  const good = await seedStatusConflict(f, f.reference("cohort/conflict-record"));
  store.list = async input => {
    const listing = await f.store.list(input);
    return input.family === "cohort" && listing.status === "ok" && listing.result.status === "complete"
      ? { status: "ok", result: { ...listing.result, records: [...listing.result.records, { ...good,
        reference: RecordReferenceSchema.parse({ ...good.reference, key: "broken" }), content }] } } : listing;
  };
  const result = await readView({ store, identity: "alice" });
  expect(result.conflicts.map(row => row.reference)).toEqual([good.reference]);
  expect(result.incomplete).toBe(true);
  expect(result.warnings.join(" ")).toMatch(/cohort\/cohort\/cohort-one\/broken[\s\S]*could not be read[\s\S]*arc store conflict/u);
});

it("lists all ten conflict-bearing families without inventing roles for reserved families", async () => {
  const f = createReferenceFixture();
  const kinds = ["work-item/conflict-record", "cohort/conflict-record", "project-inbox/conflict-record", "review/conflict-record",
    "project-registry/conflict-record", "lineage/conflict-record", "personal/conflict-record", "claims/conflict-record",
    "project-machinery/conflict-record", "constitution/conflict-record"] as const;
  for (const kind of kinds) await seedStatusConflict(f, f.reference(kind));
  const result = await readView({ store: f.store, identity: "test-user" });
  expect(result.conflicts.map(row => row.reference.kind).sort()).toEqual([...kinds].sort());
  expect(result.warnings).toEqual([]);
});

it("treats an absent family as empty while retaining other families' good records", async () => {
  const f = createReferenceFixture(), store = Object.create(f.store) as Store;
  const good = await seedStatusConflict(f, f.reference("work-item/conflict-record"));
  store.list = async input => input.family === "cohort" ? { status: "ok", result: { status: "absent" } } : f.store.list(input);
  const result = await readView({ store, identity: "test-user" });
  expect(result.conflicts.map(row => row.reference)).toEqual([good.reference]);
  expect(result.warnings).toEqual([]);
  expect(result.incomplete).toBe(false);
});
