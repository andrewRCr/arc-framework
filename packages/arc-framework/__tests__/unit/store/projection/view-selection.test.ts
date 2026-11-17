/** In-flight views select exact active generations without narrowing inventory by editor identity. */
import { expect, it, vi } from "vitest";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { selectProjectionView } from "../../../../src/lib/store/projection/view-selection.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { TransientIdentityRecordSchema, serializeTransientIdentityRecord } from "../../../../src/lib/errand/identity-record.js";
import { ListingOutcomeSchema } from "../../../../src/lib/store/read.js";

async function seedErrand(h: ReturnType<typeof createLifecycleHarness>, name: string, owner: string) {
  const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: name,
    claimId: "a".repeat(32), createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    owner, intent: "Correct a bounded concern", branch: `chore/${name}`, origin: "description", originEntry: null,
    state: "open", savedHead: null, changeRequest: null });
  return h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name })),
    serializeTransientIdentityRecord(record), { kind: "active" });
}

it("selects other active work owned by the editing identity for mine", async () => {
  const h = createLifecycleHarness();
  const own = await h.seedMeta("alpha", { owner: "andrew" });
  const other = await h.seedMeta("beta", { owner: "andrew" });
  await h.seedMeta("gamma", { owner: "bob" });
  await h.seedMeta("planned", { state: "Planning", owner: "andrew", currentWorkflow: "draft-design" },
    { kind: "backlog", commitment: "planned" });
  const before = lifecycleSuccess(await h.store.version());
  expect(await selectProjectionView({ store: h.store, identity: SlugSchema.parse("andrew"),
    view: { mode: "mine", pins: [] }, own: own.reference.owner }))
    .toEqual({ kind: "selected", references: [other.reference], missingPins: [] });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("selects the cohort's other members and outside pins while excluding a pin for its own generation", async () => {
  const h = createLifecycleHarness();
  await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "core" })),
    "# Cohort: core\n\n**Parent:** [none]\n\n**Purpose:** Coordinate work.\n");
  const own = await h.seedMeta("alpha", { owner: "andrew", cohort: "core" });
  const peer = await h.seedMeta("beta", { owner: "bob", cohort: "core" });
  const pinned = await h.seedMeta("gamma", { owner: "bob" });
  await h.seedMeta("delta", { owner: "andrew" });
  expect(await selectProjectionView({ store: h.store, identity: SlugSchema.parse("andrew"),
    view: { mode: "cohort", pins: [SlugSchema.parse("alpha"), SlugSchema.parse("gamma")] }, own: own.reference.owner }))
    .toEqual({ kind: "selected", references: [peer.reference, pinned.reference], missingPins: [] });
});

it("uses the complete non-null Cohort path rather than a shared ancestor", async () => {
  const h = createLifecycleHarness();
  for (const [name, parent] of [["core", "[none]"], ["sub", "`core`"], ["other", "`core`"]] as const) {
    await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name })),
      `# Cohort: ${name}\n\n**Parent:** ${parent}\n\n**Purpose:** Coordinate work.\n`);
  }
  const own = await h.seedMeta("alpha", { owner: "andrew", cohort: "core/sub" });
  const peer = await h.seedMeta("beta", { owner: "bob", cohort: "core/sub" });
  await h.seedMeta("gamma", { owner: "bob", cohort: "core" });
  await h.seedMeta("delta", { owner: "bob", cohort: "core/other" });
  expect(await selectProjectionView({ store: h.store, identity: SlugSchema.parse("andrew"),
    view: { mode: "cohort", pins: [] }, own: own.reference.owner }))
    .toEqual({ kind: "selected", references: [peer.reference], missingPins: [] });
});

it("selects another person's active work under all", async () => {
  const h = createLifecycleHarness();
  const own = await h.seedMeta("alpha", { owner: "andrew" });
  const foreign = await h.seedMeta("beta", { owner: "bob" });
  const other = await h.seedMeta("gamma", { owner: "andrew" });
  expect(await selectProjectionView({ store: h.store, identity: SlugSchema.parse("andrew"),
    view: { mode: "all", pins: [] }, own: own.reference.owner }))
    .toEqual({ kind: "selected", references: [foreign.reference, other.reference], missingPins: [] });
});

it.each(["mine", "all", "pinned"] as const)("selects ordinary Errands through %s without mistaking a routing identity for one", async mode => {
  const h = createLifecycleHarness();
  const own = await h.seedMeta("alpha", { owner: "andrew" });
  const foreign = await seedErrand(h, "repair-bob", "bob"), owned = await seedErrand(h, "repair-mine", "andrew");
  const routing = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "housekeep-routing", slug: "routing",
    claimId: "b".repeat(32), createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    branch: "chore/routing", state: "open", savedHead: null, changeRequest: null });
  await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "routing" })),
    serializeTransientIdentityRecord(routing), { kind: "active" });
  const references = mode === "mine" ? [owned.reference] : mode === "all" ? [foreign.reference, owned.reference] : [foreign.reference];
  expect(await selectProjectionView({ store: h.store, identity: SlugSchema.parse("andrew"), own: own.reference.owner,
    view: { mode: mode === "pinned" ? "cohort" : mode, pins: mode === "pinned" ? [SlugSchema.parse("repair-bob")] : [] } }))
    .toEqual({ kind: "selected", references, missingPins: [] });
});

it.each(["unreadable", "missed", "diagnostic"] as const)("keeps %s inventory evidence distinct from missing pins and selects after repair", async condition => {
  const h = createLifecycleHarness();
  const own = await h.seedMeta("alpha", { owner: "andrew" }), other = await h.seedMeta("beta", { owner: "bob" });
  const input = { store: h.store, identity: SlugSchema.parse("andrew"), own: own.reference.owner,
    view: { mode: "all" as const, pins: [SlugSchema.parse("missing")] } };
  const list = h.store.list.bind(h.store);
  const fault = vi.spyOn(h.store, "list").mockImplementationOnce(async request => {
    const actual = await list(request);
    if (actual.status !== "ok" || actual.result.status !== "complete") throw new Error("Expected a complete checked fixture listing");
    const issue = { kind: "unreadable", key: "alpha", condition: "The active inventory cannot be read.",
      remedy: { text: "Repair the active inventory, then retry." } };
    return { status: "ok", result: ListingOutcomeSchema.parse(condition === "unreadable"
      ? { status: "unreadable", condition: issue.condition, remedy: issue.remedy }
      : { ...actual.result, missed: condition === "missed", diagnostics: condition === "diagnostic" ? [issue] : [] }) };
  });
  try {
    const held = await selectProjectionView(input);
    expect(held).toMatchObject({ kind: "unavailable", diagnostics: [expect.objectContaining({
      reason: expect.stringMatching(/inventory/iu), remedy: { text: expect.stringMatching(/retry/iu) },
    })] });
    expect(held).not.toHaveProperty("missingPins");
    expect(held).toMatchObject({ references: condition === "unreadable" ? [] : [other.reference] });
  } finally { fault.mockRestore(); }
  expect(await selectProjectionView(input)).toEqual({ kind: "selected", references: [other.reference], missingPins: input.view.pins });
});
