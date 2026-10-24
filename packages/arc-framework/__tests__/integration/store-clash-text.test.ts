/** Registered lifecycle commands explain typed clashes and continue after the preferred repair. */
import { expect, it } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createClashDouble } from "../helpers/store/clash-double.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { ReferenceBackend } from "../helpers/store/reference-backend.js";
import { recordKey } from "../helpers/store/model.js";
import { seed, success, testProvenance } from "../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { META_REGISTRATION } from "../../src/lib/store/kinds/meta/registration.js";
import { renderMetaFile } from "../../src/lib/store/kinds/meta/writers.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";

it.each(["pause", "handover"] as const)("%s prints both live holders and their repair", async verb => {
  const f = await repairCliFixture(), h = createLifecycleHarness();
  const primary = await h.seedMeta("example"), other = await h.seedMeta("other");
  const store = createClashDouble(h.store, { slug: "example", holders: [primary.reference, other.reference] });
  const args = verb === "pause" ? [verb, "example", "--reason", "Waiting"] : [verb, "example", "--to", "next-owner"];
  const result = await repairCli(f, args, { store });
  expect(result.exitCode).toBe(1);
  if (primary.reference.owner.type === "person" || other.reference.owner.type === "person") throw new Error("Expected work-item identities");
  const text = result.stdout + result.stderr;
  expect(text).toContain("work unit `example`");
  expect(text).toContain(primary.reference.owner.uid); expect(text).toContain(other.reference.owner.uid);
  expect(text).toContain(`arc rename ${primary.reference.owner.uid} <new-slug>`);
  expect(text).toContain(`arc rename ${other.reference.owner.uid} <new-slug>`);
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(primary);
  expect(lifecycleSuccess(await h.store.read({ reference: other.reference }))).toEqual(other);
}, 60_000);

it("names both current names when a former operand ties", async () => {
  const f = await repairCliFixture(), fixture = createReferenceFixture();
  if (!(fixture.store instanceof ReferenceBackend)) throw new Error("Expected the reference backend");
  const first = await seed(fixture, fixture.reference("work-item/meta", "alpha"));
  const second = await seed(fixture, fixture.reference("work-item/meta", "beta"));
  for (const record of [first, second]) {
    const stored = fixture.store.state.records.get(recordKey(record.reference));
    if (stored === undefined) throw new Error("Missing fixture record");
    stored.formerSlugs.push("former");
  }
  const beforeFirst = success(await fixture.store.read({ reference: first.reference }));
  const beforeSecond = success(await fixture.store.read({ reference: second.reference }));
  const result = await repairCli(f, ["resume", "former"], { store: fixture.store });
  expect(result.exitCode).toBe(1);
  expect(result.stdout + result.stderr).toContain("current name");
  expect(result.stdout + result.stderr).toContain(first.reference.owner.name);
  expect(result.stdout + result.stderr).toContain(second.reference.owner.name);
  expect(result.stdout + result.stderr).not.toContain("arc rename");
  expect(success(await fixture.store.read({ reference: first.reference }))).toEqual(beforeFirst);
  expect(success(await fixture.store.read({ reference: second.reference }))).toEqual(beforeSecond);
}, 60_000);

it("resumes after the cohort is renamed and keeps the name unambiguous through completion", async () => {
  const f = await repairCliFixture(), h = createLifecycleHarness();
  const primary = await h.seedMeta("example");
  const cohort = await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "example" })),
    "# Cohort: example\n\n**Purpose:** Coordinate work.\n");
  const refused = await repairCli(f, ["resume", "example"], { store: h.store });
  expect(refused.exitCode).toBe(1);
  if (cohort.reference.owner.type === "person") throw new Error("Expected a cohort identity");
  expect(refused.stdout + refused.stderr).toContain(`arc rename ${cohort.reference.owner.uid} <new-slug>`);
  expect(refused.stdout + refused.stderr).toContain("work unit `example`");
  expect(refused.stdout + refused.stderr).toContain("cohort `example`");
  const renamed = { ...cohort.reference, owner: { ...cohort.reference.owner, name: SlugSchema.parse("group") } };
  lifecycleSuccess(await h.store.write({ action: "put", reference: renamed, expected: cohort.version,
    content: cohort.content.replaceAll("example", "group"), provenance: testProvenance }));
  const retried = await repairCli(f, ["resume", "example"], { store: h.store });
  expect(retried.exitCode ?? 0, retried.stdout + retried.stderr).toBe(0);
  const lookup = () => h.store.lookup({ kind: "slug", slug: SlugSchema.parse("example") });
  expect(lifecycleSuccess(await lookup()).reference).toEqual(primary.reference);
  const placement = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
  const group = lifecycleSuccess(await h.store.read({ reference: renamed }));
  lifecycleSuccess(await h.store.write({ ...recordPut(group, { placement }), provenance: testProvenance }));
  expect(lifecycleSuccess(await lookup()).reference).toEqual(primary.reference);
  const current = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  lifecycleSuccess(await h.store.write({ ...recordPut(current, { placement }), provenance: testProvenance }));
  expect(lifecycleSuccess(await lookup()).reference).toEqual(primary.reference);
}, 60_000);

it("resumes after the Errand closes and retains the completed work-unit winner", async () => {
  const f = await repairCliFixture();
  const parser = META_REGISTRATION.parser;
  if (parser === undefined) throw new Error("Missing production metadata parser");
  const fixture = createReferenceFixture({}, { "work-item/meta": { parser } });
  const primaryReference = fixture.reference("work-item/meta", "one");
  const primary = await seed(fixture, primaryReference, renderMetaFile(primaryReference.owner.name,
    { state: "Active", owner: "test-user", workClass: "Light", currentWorkflow: "process-task-loop" }));
  const originalErrand = await seed(fixture, fixture.reference("work-item/record", "two"));
  const errandReference = { ...originalErrand.reference, owner: { ...originalErrand.reference.owner, name: primary.reference.owner.name } };
  if (!(fixture.store instanceof ReferenceBackend)) throw new Error("Expected the reference backend");
  const storedErrand = fixture.store.state.records.get(recordKey(originalErrand.reference));
  if (storedErrand === undefined) throw new Error("Missing fixture Errand");
  // Concurrent writers can introduce the clash that a local namespace write refuses.
  storedErrand.reference = errandReference;
  const errand = success(await fixture.store.read({ reference: errandReference }));
  const refused = await repairCli(f, ["resume", primary.reference.owner.name], { store: fixture.store });
  expect(refused.exitCode).toBe(1);
  if (errandReference.owner.type === "person") throw new Error("Expected an Errand identity");
  expect(refused.stdout + refused.stderr).toContain(`arc errand close ${errandReference.owner.uid}`);
  expect(refused.stdout + refused.stderr).toContain(`work unit \`${primary.reference.owner.name}\``);
  expect(refused.stdout + refused.stderr).toContain(`Errand \`${primary.reference.owner.name}\``);
  const placement = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
  success(await fixture.store.write({ ...recordPut(errand, { placement,
    content: JSON.stringify({ ...JSON.parse(errand.content) as Record<string, unknown>, state: "closed" }) }), provenance: testProvenance }));
  const retried = await repairCli(f, ["resume", primary.reference.owner.name], { store: fixture.store });
  expect(retried.exitCode ?? 0, retried.stdout + retried.stderr).toBe(0);
  const lookup = () => fixture.store.lookup({ kind: "slug", slug: primary.reference.owner.name });
  expect(success(await lookup()).reference).toEqual(primary.reference);
  const current = success(await fixture.store.read({ reference: primary.reference }));
  success(await fixture.store.write({ ...recordPut(current, { placement }), provenance: testProvenance }));
  expect(success(await lookup()).reference).toEqual(primary.reference);
}, 60_000);
