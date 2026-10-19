/** Token lookups retain generations, identity scope and the evidence needed to prove absence. */
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../../src/lib/store/identity.js";
import { readStoreConflictToken } from "../../../src/lib/status/store-conflict-token.js";
import { createReferenceFixture } from "../../helpers/store/reference-fixture.js";
import { seed, success, update } from "../../helpers/store/suite-tools.js";
import { seedStatusConflict } from "../../helpers/store/status-conflicts.js";

it("shows both a completed and a live holder of one conflict token", async () => {
  const f = createReferenceFixture(), reference = f.reference("work-item/meta");
  const old = await seed(f, reference);
  success(await f.store.write({ ...update(f, old), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
  const current = await seed(f, reference);
  const records = [];
  for (const owner of [old.reference.owner, current.reference.owner]) records.push(await seedStatusConflict(f,
    RecordReferenceSchema.parse({ kind: "work-item/conflict-record", owner, key: "shared/id" })));
  const result = await readStoreConflictToken({ store: f.store, identity: "alice", token: "work-item/work-item/work-item-one/shared/id" });
  expect(result.status).toBe("ok");
  if (result.status === "refused") throw new Error(result.refusal.condition);
  expect(result.result.conflicts.map(row => row.reference)).toEqual(records.map(row => row.reference));
  expect(result.result.conflicts[0]?.reference.owner).not.toEqual(result.result.conflicts[1]?.reference.owner);
});

it.each(["absent", "complete", "invalid"] as const)("refuses an unknown token after a %s read with the listing route", async outcome => {
  const f = createReferenceFixture();
  if (outcome !== "invalid") f.store.list = async () => ({ status: "ok", result: outcome === "absent" ? { status: "absent" }
    : { status: "complete", records: [], diagnostics: [], missed: false } });
  const result = await readStoreConflictToken({ store: f.store, identity: "alice", token: outcome === "invalid" ? "bad-token" : "cohort/cohort/missing/unknown" });
  expect(result).toMatchObject({ status: "refused", refusal: { code: "not-found", condition: expect.stringContaining("Unknown conflict token"),
    remedy: { text: expect.stringContaining("arc status --conflicts") } } });
});

it.each(["personal", "claims"])("refuses a %s token without identity before listing any records", async family => {
  const f = createReferenceFixture(); f.identity(undefined);
  f.store.list = async () => { throw new Error("Identityless personal token attempted a listing"); };
  const result = await readStoreConflictToken({ store: f.store, identity: null, token: `${family}/person/alice/key` });
  expect(result).toMatchObject({ status: "refused", refusal: { remedy: { text: expect.stringContaining("git config arc.identity <name>") } } });
});

it.each(["personal", "claims"])("keeps the resolved person as the %s token scope", async family => {
  const f = createReferenceFixture(); f.identity("alice");
  for (const name of ["alice", "bob"]) await seedStatusConflict(f, RecordReferenceSchema.parse({ kind: `${family}/conflict-record`, owner: { type: "person", name }, key: "shared" }));
  const mine = await readStoreConflictToken({ store: f.store, identity: "alice", token: `${family}/person/alice/shared` });
  expect(mine.status).toBe("ok");
  if (mine.status === "refused") throw new Error(mine.refusal.condition);
  expect(mine.result.conflicts.map(row => row.reference.owner.name)).toEqual(["alice"]);
  const foreign = await readStoreConflictToken({ store: f.store, identity: "alice", token: `${family}/person/bob/shared` });
  expect(foreign).toMatchObject({ status: "refused", refusal: { code: "not-found", remedy: { text: expect.stringContaining("arc status --conflicts") } } });
});

it.each(["unreadable", "refused"] as const)("preserves a token family's %s failure and resumes after repair", async kind => {
  const f = createReferenceFixture(); await seedStatusConflict(f, f.reference("cohort/conflict-record"));
  const list = f.store.list.bind(f.store); let broken = true;
  const failure = { condition: "Cohort inventory unavailable.", remedy: { text: "Restore cohort inventory and retry." } };
  f.store.list = async input => broken ? kind === "unreadable" ? { status: "ok", result: { status: "unreadable", ...failure } }
    : { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "cohort", ...failure } } : list(input);
  const options = { store: f.store, identity: "alice", token: "cohort/cohort/cohort-one/one" };
  expect(await readStoreConflictToken(options)).toMatchObject({ status: "refused", refusal: failure });
  broken = false;
  expect((await readStoreConflictToken(options)).status).toBe("ok");
});

it("renders a found token with its family's omission warnings without reading unrelated families", async () => {
  const f = createReferenceFixture(); await seedStatusConflict(f, f.reference("cohort/conflict-record"));
  const list = f.store.list.bind(f.store);
  f.store.list = async input => {
    if (input.family !== "cohort") throw new Error("Token lookup read an unrelated family");
    const result = await list(input);
    return result.status === "ok" && result.result.status === "complete" ? { status: "ok", result: { ...result.result,
      missed: true, diagnostics: [{ kind: "unreadable", key: "lost", condition: "A conflict is unavailable.", remedy: { text: "Restore its bytes." } }] } } : result;
  };
  const result = await readStoreConflictToken({ store: f.store, identity: "alice", token: "cohort/cohort/cohort-one/one" });
  expect(result.status).toBe("ok");
  if (result.status === "refused") throw new Error(result.refusal.condition);
  expect(result.result.conflicts).toHaveLength(1);
  expect(result.result.warnings).toEqual(["cohort lost: A conflict is unavailable. Restore its bytes."]);
});

it.each(["diagnostic", "missed", "decode"] as const)("refuses a no-match token as incomplete after a %s omission", async omission => {
  const f = createReferenceFixture(), good = await seedStatusConflict(f, f.reference("cohort/conflict-record"));
  f.store.list = async () => ({ status: "ok", result: { status: "complete", records: omission === "decode" ? [{ ...good, content: "{" }] : [],
    missed: omission === "missed", diagnostics: omission === "diagnostic"
      ? [{ kind: "unreadable", key: "lost", condition: "Missing conflict bytes.", remedy: { text: "Restore those bytes." } }] : [] } });
  const result = await readStoreConflictToken({ store: f.store, identity: "alice", token: "cohort/cohort/cohort-one/unknown" });
  expect(result.status).toBe("refused");
  if (result.status !== "refused") throw new Error("Incomplete token read unexpectedly succeeded");
  expect(result.refusal.code).toBe("listing-unreadable");
  expect(result.refusal.condition).not.toContain("Unknown conflict token");
  expect(result.refusal.condition).toContain(omission === "diagnostic" ? "cohort lost: Missing conflict bytes. Restore those bytes."
    : omission === "missed" ? "cohort conflict inventory is incomplete" : "could not be read");
  expect(result.refusal.remedy.text).toContain("arc status --conflicts");
});
