/** Project pause marks use the shared prerequisite and review-age semantics. */
import { expect, it } from "vitest";
import { MetaPauseSchema } from "../../../src/lib/active/meta-schema.js";
import { writeMetaPause } from "../../../src/lib/store/kinds/meta/writers.js";
import { recordPut, batchLifecycleWrites } from "../../../src/lib/store/lifecycle-write.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/writer.js";
import { listLifecycleIndex } from "../../../src/lib/store/lifecycle-index.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { readStoreProjectPauseMarks } from "../../../src/lib/status/store-project-pauses.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import type { Store } from "../../../src/lib/store/contract.js";

const now = new Date("2026-10-21T12:00:00.000Z");

async function pause(h: ReturnType<typeof createLifecycleHarness>, waitsOn: unknown = null) {
  const meta = await h.seedMeta("paused", { state: "Planning", owner: "sam", currentWorkflow: "draft-design" });
  const value = MetaPauseSchema.parse({ pausedBy: "andrew", since: "2026-10-01T12:00:00.000Z", reason: "Waiting", waitsOn });
  lifecycleSuccess(await h.store.write({ ...recordPut(meta, { content: writeMetaPause(meta.content, value) }),
    provenance: { verb: "pause", lifecycleAction: "pause" } }));
}

async function entries(h: ReturnType<typeof createLifecycleHarness>) {
  const listing = lifecycleSuccess(await listLifecycleIndex(h.store));
  if (listing.status !== "complete") throw new Error("Expected paused work");
  return listing.index.entries();
}

it.each([
  { state: "shipped", mark: "resumable" }, { state: "abandoned", mark: "review-due" },
] as const)("marks a prerequisite that is $state as $mark", async ({ state, mark }) => {
  const h = createLifecycleHarness();
  const dependency = await h.seedMeta("dependency", state === "shipped" ? { state: "Shipped", currentWorkflow: null } : {});
  await pause(h, { kind: "work-unit", slug: "dependency" });
  if (state === "abandoned") lifecycleSuccess(await batchLifecycleWrites(h.store, [
    { action: "remove", reference: dependency.reference, expected: dependency.version },
    { action: "put", reference: recordReferences["lineage/transition"](dependency.reference.owner), expected: null,
      content: writeLineageRecord({ schemaVersion: 2, origin: { name: SlugSchema.parse("dependency") }, kind: "abandon", successors: [], incoming: [] }) },
  ], { verb: "abandon", lifecycleAction: "abandon" }));

  const result = await readStoreProjectPauseMarks({ store: h.store, entries: await entries(h), reviewAfterDays: 14, now });
  expect([...result.marks]).toEqual([["paused", [mark]]]);
  expect(result.warnings).toEqual([]);
});

it("leaves a row unmarked and preserves the marking failure's text", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("dependency");
  await pause(h, { kind: "work-unit", slug: "dependency" });
  const selected = await entries(h);
  const store = Object.create(h.store) as Store;
  store.lookup = async () => ({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "work-item",
    condition: "Prerequisite index unavailable.", remedy: { text: "Repair the prerequisite index and retry." } } });

  const result = await readStoreProjectPauseMarks({ store, entries: selected, reviewAfterDays: 14, now });
  expect(result.marks.has("paused")).toBe(false);
  expect(result.warnings).toEqual([{ code: "store-read-failed", workUnit: "paused",
    rendered: "Prerequisite index unavailable. Repair the prerequisite index and retry." }]);
});

it.each([
  { reviewAfterDays: 14, marks: ["review-due"] }, { reviewAfterDays: 30, marks: [] },
])("applies the configured $reviewAfterDays-day bound to a pause waiting on nothing", async ({ reviewAfterDays, marks }) => {
  const h = createLifecycleHarness();
  await pause(h);
  const result = await readStoreProjectPauseMarks({ store: h.store, entries: await entries(h), reviewAfterDays, now });
  expect(result.marks.get("paused")).toEqual(marks);
  expect(result.warnings).toEqual([]);
});
