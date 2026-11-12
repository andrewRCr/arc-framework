/** Registered lifecycle readers preserve clashes while unrelated work can advance. */
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createClashDouble } from "../helpers/store/clash-double.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { writeMetaTitle } from "../../src/lib/store/kinds/meta/writers.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";

async function fixture() {
  const f = await repairCliFixture(), h = createLifecycleHarness();
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project", uid: randomUUID() })), "{}");
  return { ...f, ...h };
}
const readers = [
  { verb: "activate", argv: ["activate", "example", "--type", "feat", "--task", "Implement", "--action", "Continue"], format: "text" },
  { verb: "deactivate", argv: ["deactivate", "example"], format: "text" },
  { verb: "abandon", argv: ["abandon", "example", "--yes"], format: "text" },
  { verb: "rename", argv: ["rename", "example", "renamed"], format: "text" },
  { verb: "archive", argv: ["archive", "example"], format: "text" },
  { verb: "promote", argv: ["promote", "example"], format: "text" },
  { verb: "demote", argv: ["demote", "example"], format: "text" },
  { verb: "publish", argv: ["publish", "example"], format: "text" },
  { verb: "publish JSON", argv: ["publish", "example", "--json"], format: "json" },
  { verb: "decompose preflight", argv: ["decompose", "example", "--preflight"], format: "native" },
] as const;

it.each(readers)("$verb preserves both typed holders at its first clash", async ({ argv, format }) => {
  const f = await fixture(), first = await f.seedMeta("example"), second = await f.seedMeta("other");
  const store = createClashDouble(f.store, { slug: "example", holders: [first.reference, second.reference] });
  const before = lifecycleSuccess(await f.store.version());
  const result = await repairCli(f, argv, { store });
  expect(result.exitCode, result.stdout + result.stderr).toBe(1);
  const candidates = [first.reference, { ...second.reference, owner: { ...second.reference.owner, name: first.reference.owner.name } }];
  const refusal = { code: "ambiguous-match", candidates: expect.arrayContaining(candidates), tie: { liveness: "live", name: "current" } };
  if (format === "text") {
    const text = result.stdout + result.stderr;
    expect(text).toContain("ambiguous-match"); expect(text).toContain("work unit `example`");
    for (const candidate of candidates) {
      if (candidate.owner.type === "person") throw new Error("Expected a lifecycle holder");
      expect(text).toContain(candidate.owner.uid);
      expect(text).toContain(`arc rename ${candidate.owner.uid} <new-slug>`);
    }
  } else if (format === "json") expect(result.result).toMatchObject({ refusal, remedy: { text: expect.stringContaining("arc rename") } });
  else expect(result.result).toMatchObject({ status: "refused", reason: "store", storeRefusal: refusal, remedy: { text: expect.any(String) } });
  expect(lifecycleSuccess(await f.store.version())).toBe(before);
  expect(lifecycleSuccess(await f.store.read({ reference: first.reference }))).toEqual(first);
  expect(lifecycleSuccess(await f.store.read({ reference: second.reference }))).toEqual(second);
}, 60_000);

it("activates unrelated work whose prose and paired reference mention a clashed name", async () => {
  const f = await fixture(), first = await f.seedMeta("example"), second = await f.seedMeta("other");
  const dependent = await f.seedMeta("dependent", { state: "Planning", currentWorkflow: "draft-design" });
  const notes = await f.seed(recordReferences["work-item/notes"](dependent.reference.owner), "# Notes\n\nNarrative example context. Read `spec-example-prd.md`.\n");
  const store = createClashDouble(f.store, { slug: "example", holders: [first.reference, second.reference] });
  const result = await repairCli(f, ["activate", "dependent", "--type", "feat", "--task", "Implement", "--action", "Continue"], { store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(lifecycleSuccess(await f.store.read({ reference: dependent.reference })).fields).toMatchObject({ state: "Active", dependsOn: [] });
  expect(lifecycleSuccess(await f.store.read({ reference: notes.reference }))).toEqual(notes);
  for (const record of [first, second]) expect(lifecycleSuccess(await f.store.read({ reference: record.reference }))).toEqual(record);
}, 60_000);

it.each([false, true])("activates against the resolved generation without a false self-dependency, former=%s", async former => {
  const f = await fixture();
  const archived = await f.seedMeta(former ? "former" : "target", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  if (former) lifecycleSuccess(await f.store.write({ ...recordPut(archived, { content: writeMetaTitle(archived.content, SlugSchema.parse("dependent")) }),
    reference: { ...archived.reference, owner: OwnerIdentitySchema.parse({ ...archived.reference.owner, name: "dependent" }) },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  const completed = lifecycleSuccess(await f.store.read({ reference: archived.reference }));
  const live = former ? undefined : await f.seedMeta("target");
  const edge = former ? "former" : "target";
  const dependent = await f.seedMeta("dependent", { state: "Planning", currentWorkflow: "draft-design", dependsOn: [edge] });
  const result = await repairCli(f, ["activate", "dependent", "--type", "feat", "--task", "Implement", "--action", "Continue"], { store: f.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(lifecycleSuccess(await f.store.read({ reference: dependent.reference })).fields).toMatchObject({ state: "Active", dependsOn: former ? [] : [edge] });
  expect(lifecycleSuccess(await f.store.read({ reference: archived.reference }))).toEqual(completed);
  if (live !== undefined) expect(lifecycleSuccess(await f.store.read({ reference: live.reference }))).toEqual(live);
}, 60_000);

it("archives the last other member while two clashed members keep their cohort open", async () => {
  const f = await fixture();
  const cohort = await f.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" })),
    "# Cohort: group\n\n**Purpose:** Deliver all members.\n");
  const first = await f.seedMeta("first", { cohort: "group" }), second = await f.seedMeta("second", { cohort: "group" });
  const subject = await f.seedMeta("subject", { cohort: "group" });
  const store = createClashDouble(f.store, { slug: "clashed", holders: [first.reference, second.reference] });
  const result = await repairCli(f, ["archive", "subject"], { store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(lifecycleSuccess(await f.store.read({ reference: subject.reference }))).toMatchObject({ placement: { kind: "completed" }, fields: { state: "Shipped" } });
  expect(lifecycleSuccess(await f.store.read({ reference: cohort.reference })).placement).toBeUndefined();
  for (const record of [first, second]) expect(lifecycleSuccess(await f.store.read({ reference: record.reference }))).toEqual(record);
}, 60_000);
