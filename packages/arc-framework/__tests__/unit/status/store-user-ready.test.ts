/** User Ready rows reuse project classification and dependency resolution. */
import { expect, it } from "vitest";
import { readStoreUserReady } from "../../../src/lib/status/store-user-ready.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { createReferenceFixture } from "../../helpers/store/reference-fixture.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import { OwnerIdentitySchema, RecordReferenceSchema, recordReferences } from "../../../src/lib/store/identity.js";
import { testProvenance } from "../../helpers/store/suite-tools.js";
import { MetaPauseSchema } from "../../../src/lib/active/meta-schema.js";
import type { Store } from "../../../src/lib/store/contract.js";

it("renders owned planned work with satisfied dependencies and its Class", async () => {
  const h = createLifecycleHarness();
  const shipped = await h.seedMeta("shipped", { state: "Shipped", currentWorkflow: null });
  lifecycleSuccess(await h.store.write({ ...recordPut(shipped, { placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }),
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  await h.seedMeta("ready", { owner: "alice", state: "Planning", currentWorkflow: "draft-design", workClass: "Heavy", priority: "P1", dependsOn: ["shipped"] },
    { kind: "backlog", commitment: "planned" });
  await h.seedMeta("foreign", { owner: "bob", state: "Planning", currentWorkflow: "draft-design" }, { kind: "backlog", commitment: "planned" });
  const result = await readStoreUserReady({ store: h.store, identity: "alice", reviewAfterDays: 14 });
  expect(result).toEqual({ status: "ok", result: { rows: [{ workUnit: "ready", state: "Planning", class: "Heavy", priority: "P1", dependsOn: [] }], warnings: [] } });
});

it.each(["active", "paused"] as const)("keeps planned %s work out of Ready", async kind => {
  const h = createReferenceFixture();
  const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "not-ready" }));
  const fields = { ...parseMetaRecord(makeMetaFixture("not-ready", { owner: "alice", state: kind === "active" ? "Active" : "Planning" })),
    pause: kind === "paused" ? MetaPauseSchema.parse({ pausedBy: "alice", since: "2026-10-01T12:00:00.000Z", reason: "Waiting" }) : null };
  lifecycleSuccess(await h.store.write({ action: "put", reference, expected: null, content: JSON.stringify(fields),
    placement: { kind: "backlog", commitment: "planned" }, provenance: testProvenance }));
  const result = await readStoreUserReady({ store: h.store, identity: "alice", reviewAfterDays: 14 });
  if (result.status === "refused") throw new Error(result.refusal.condition);
  expect(result.result.rows).toEqual([]);
});

it("includes an unowned admitted meta in the identity's Ready slice", async () => {
  const h = createReferenceFixture();
  const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "unowned" }));
  const fields = { ...parseMetaRecord(makeMetaFixture("unowned", { state: "Planning" })), owner: null };
  lifecycleSuccess(await h.store.write({ action: "put", reference, expected: null, content: JSON.stringify(fields),
    placement: { kind: "backlog", commitment: "planned" }, provenance: testProvenance }));
  const result = await readStoreUserReady({ store: h.store, identity: "alice", reviewAfterDays: 14 });
  if (result.status === "refused") throw new Error(result.refusal.condition);
  expect(result.result.rows.map(row => row.workUnit)).toEqual(["unowned"]);
});

it("satisfies a completed generation's former slug despite its active namesake", async () => {
  const h = createLifecycleHarness();
  const former = await h.seedMeta("former", { state: "Shipped", currentWorkflow: null });
  const reference = RecordReferenceSchema.parse({ ...former.reference, owner: { ...former.reference.owner, name: "current" } });
  lifecycleSuccess(await h.store.write({ action: "put", reference, expected: former.version,
    content: former.content.replaceAll("former", "current"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "rename" } }));
  const current = lifecycleSuccess(await h.store.read({ reference }));
  lifecycleSuccess(await h.store.write({ ...recordPut(current, { placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }),
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  await h.seedMeta("current");
  await h.seedMeta("ready", { owner: "alice", state: "Planning", currentWorkflow: "draft-design", dependsOn: ["former"] },
    { kind: "backlog", commitment: "planned" });
  const result = await readStoreUserReady({ store: h.store, identity: "alice", reviewAfterDays: 14 });
  if (result.status === "refused") throw new Error(result.refusal.condition);
  expect(result.result.rows.map(row => row.workUnit)).toEqual(["ready"]);
  expect(result.result.warnings).toEqual([]);
});

it("omits both clashed holders from Ready while retaining the coded warning", async () => {
  const h = createLifecycleHarness();
  for (const name of ["first", "second"]) await h.seedMeta(name, { owner: "alice", state: "Planning", currentWorkflow: "draft-design" },
    { kind: "backlog", commitment: "planned" });
  const listing = lifecycleSuccess(await h.store.list({ family: "work-item", kind: "work-item/meta" }));
  if (listing.status !== "complete") throw new Error("Expected both primary records");
  const store = Object.create(h.store) as Store;
  store.list = async input => input.kind === "work-item/meta" ? { status: "ok", result: { ...listing, records: listing.records.map(record => ({
    ...record, reference: RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name: "clashed" } }),
    content: record.content.replaceAll(record.reference.owner.name, "clashed"),
  })) } } : h.store.list(input);
  const result = await readStoreUserReady({ store, identity: "alice", reviewAfterDays: 14 });
  if (result.status === "refused") throw new Error(result.refusal.condition);
  expect(result.result.rows).toEqual([]);
  expect(result.result.warnings).toMatchObject([{ code: "slug-clash", workUnit: "clashed" }]);
});
