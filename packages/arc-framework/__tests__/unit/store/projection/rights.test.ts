/** Edit policy reads stored lifecycle facts independently of projected folders. */
import { expect, it } from "vitest";
import { ArchiveQuarterSchema, SlugSchema } from "../../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { readProjectionEditRights } from "../../../../src/lib/store/projection/rights.js";
import { createLifecycleHarness } from "../../../helpers/store/lifecycle-harness.js";
import { createInboxHarness, entry } from "../../../helpers/inbox-harness.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { cohortDoc } from "../../../helpers/store/cohort-rule-input.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordSchema } from "../../../../src/lib/errand/identity-record.js";

it("lets any identity edit a backlog stub by its stored lifecycle state", async () => {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("stub", { state: "Planning", owner: "bob", currentWorkflow: "planning" },
    { kind: "backlog", commitment: "planned" });
  expect(await readProjectionEditRights({ store: h.store, reference: meta.reference, identity: SlugSchema.parse("alice"),
    checkout: "unused-checkout" })).toMatchObject({ status: "ok", result: { kind: "editable" } });
});

it("lets the in-flight owner edit prose from another checkout", async () => {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("in-flight", { owner: "alice" });
  const prose = await h.seed(recordReferences["work-item/spec"](meta.reference.owner), "# Design\n\nAuthored prose.\n");
  expect(await readProjectionEditRights({ store: h.store, reference: prose.reference, identity: SlugSchema.parse("alice"),
    checkout: "another-checkout" })).toMatchObject({ status: "ok", result: { kind: "editable" } });
});

it.each(["alice", "bob"])("keeps archived work with its person owner from any checkout (%s)", async identity => {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("archived", { state: "Shipped", owner: "alice" },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  expect(await readProjectionEditRights({ store: h.store, reference: meta.reference, identity: SlugSchema.parse(identity),
    checkout: "another-checkout" })).toMatchObject({ status: "ok", result: identity === "alice" ? { kind: "editable" }
      : { kind: "protected", reason: "identity", owner: "alice", reference: meta.reference } });
});

it("protects another person's in-flight prose and identifies its person owner", async () => {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("in-flight", { owner: "alice" });
  const prose = await h.seed(recordReferences["work-item/spec"](meta.reference.owner), "# Design\n\nAuthored prose.\n");
  expect(await readProjectionEditRights({ store: h.store, reference: prose.reference, identity: SlugSchema.parse("bob"),
    checkout: "another-checkout" })).toMatchObject({ status: "ok", result: {
    kind: "protected", reason: "identity", owner: "alice", reference: prose.reference,
  } });
});

it("lets an Errand's durable owner edit its description from another checkout", async () => {
  const h = createInboxHarness();
  const primary = await h.errand("owned", entry());
  const reference = recordReferences["work-item/description"](primary.reference.owner);
  expect(await readProjectionEditRights({ store: h.fixture.store, reference, identity: SlugSchema.parse("test-user"),
    checkout: "another-checkout" })).toMatchObject({ status: "ok", result: { kind: "editable" } });
});

it.each(["test-user", "another-person"])("grants personal working-memory edits only to that identity (%s)", async identity => {
  const h = createReferenceFixture();
  const reference = h.reference("personal/working-memory");
  expect(await readProjectionEditRights({ store: h.store, reference, identity: SlugSchema.parse(identity), checkout: "any-checkout" }))
    .toMatchObject({ status: "ok", result: identity === "test-user" ? { kind: "editable" }
      : { kind: "protected", reason: "identity", owner: "test-user", reference } });
});

it.each([false, true])("lets any identity edit a cohort document, including archived cohorts (%s)", async completed => {
  const h = createLifecycleHarness();
  const reference = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" }));
  const cohort = await h.seed(reference, cohortDoc().content,
    completed ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : undefined);
  if (completed) expect(cohort.placement).toMatchObject({ kind: "completed" });
  expect(await readProjectionEditRights({ store: h.store, reference: cohort.reference, identity: SlugSchema.parse("any-team-member"),
    checkout: "any-checkout" })).toMatchObject({ status: "ok", result: { kind: "editable" } });
});

it("lets any team identity edit the project inbox", async () => {
  const h = createInboxHarness();
  const inbox = await h.inbox("project");
  expect(await readProjectionEditRights({ store: h.fixture.store, reference: inbox.reference, identity: SlugSchema.parse("another-person"),
    checkout: "any-checkout" })).toMatchObject({ status: "ok", result: { kind: "editable" } });
});

it("reads canonical metadata when the backend omits parsed field projections", async () => {
  const h = createReferenceFixture(undefined, { "work-item/meta": { parser: null } });
  const primary = await seed(h, h.reference("work-item/meta"), makeMetaFixture("work-item-one", { owner: "alice" }));
  expect(primary.fields).toBeUndefined();
  const reference = recordReferences["work-item/spec"](primary.reference.owner);
  expect(await readProjectionEditRights({ store: h.store, reference, identity: SlugSchema.parse("alice"), checkout: "another-checkout" }))
    .toMatchObject({ status: "ok", result: { kind: "editable" } });
});

it.each(["unknown-state", "missing-header", "missing-owner"] as const)("refuses unreadable metadata authority and permits retry after repair (%s)", async defect => {
  const h = createReferenceFixture(undefined, { "work-item/meta": { parser: null } });
  const valid = makeMetaFixture("work-item-one", { owner: "alice" });
  const corruptions = { "unknown-state": valid.replace("`Active`", "`Unknown`"),
    "missing-header": valid.replace(/^# Metadata:[^\n]*\n/u, ""), "missing-owner": valid.replace("`alice`", "[none]") };
  const content = corruptions[defect];
  const primary = await seed(h, h.reference("work-item/meta"), content);
  const reference = recordReferences["work-item/spec"](primary.reference.owner);
  const input = { store: h.store, reference, identity: SlugSchema.parse("alice"), checkout: "another-checkout" };
  expect(await readProjectionEditRights(input)).toMatchObject({ status: "refused", refusal: {
    code: "record-malformed", condition: expect.stringMatching(/metadata/iu), remedy: { text: expect.stringContaining("Repair") },
  } });
  success(await h.store.write({ action: "put", reference: primary.reference, expected: primary.version, content: valid,
    placement: { kind: "active" }, provenance: { verb: "edit", lifecycleAction: "edit" } }));
  expect(await readProjectionEditRights(input)).toMatchObject({ status: "ok", result: { kind: "editable" } });
});

it("requires repair of an Errand's missing durable owner instead of inferring an editor", async () => {
  const h = createInboxHarness();
  const primary = await h.errand("owned", entry());
  const raw: unknown = JSON.parse(primary.content);
  const ordinary = TransientIdentityRecordSchema.parse(raw);
  if (ordinary.kind !== "errand" || ordinary.purpose !== "errand") throw new Error("Expected an ordinary Errand");
  const content = serializeTransientIdentityRecord({ ...ordinary, owner: undefined });
  success(await h.fixture.store.write({ action: "put", reference: primary.reference, expected: primary.version, content,
    placement: { kind: "active" }, provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const reference = recordReferences["work-item/description"](primary.reference.owner);
  const input = { store: h.fixture.store, reference, identity: SlugSchema.parse("test-user"), checkout: "another-checkout" };
  expect(await readProjectionEditRights(input)).toMatchObject({ status: "refused", refusal: {
    code: "record-malformed", condition: expect.stringContaining("owner"), remedy: { text: expect.stringContaining("Repair") },
  } });
  const current = success(await h.fixture.store.read({ reference: primary.reference }));
  success(await h.fixture.store.write({ action: "put", reference: primary.reference, expected: current.version,
    content: primary.content, placement: { kind: "active" }, provenance: { verb: "edit", lifecycleAction: "edit" } }));
  expect(await readProjectionEditRights(input)).toMatchObject({ status: "ok", result: { kind: "editable" } });
});

it.each(["test-user", "another-person"])("keeps inbound edits with the work item's person owner (%s)", async identity => {
  const h = createInboxHarness();
  const primary = await h.workUnit("inbound", "test-user", "active", entry());
  const reference = recordReferences["work-item/inbound"](primary.reference.owner);
  expect(await readProjectionEditRights({ store: h.fixture.store, reference, identity: SlugSchema.parse(identity), checkout: "another-checkout" }))
    .toMatchObject({ status: "ok", result: identity === "test-user" ? { kind: "editable" }
      : { kind: "protected", reason: "identity", owner: "test-user", reference } });
});
