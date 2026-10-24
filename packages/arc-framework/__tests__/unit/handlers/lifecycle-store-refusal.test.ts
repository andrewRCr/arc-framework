/** Lifecycle target refusal envelopes retain complete store ambiguity and repair evidence. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resolvePublicationTarget, resolveVerbTargetOrReport } from "../../../src/handlers/lifecycle.js";
import { LifecycleCommandRefusalSchema, refuseWithRemedy } from "../../../src/handlers/lifecycle-shared.js";
import { spineRemedy } from "../../../src/scripts/integration/spine-refusal.js";
import { StoreRefusalSchema } from "../../../src/lib/store/refusal.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { createClashDouble } from "../../helpers/store/clash-double.js";
const priorExitCode = process.exitCode;
let stdout = "";
beforeEach(() => {
  vi.resetAllMocks(); stdout = ""; process.exitCode = undefined;
  vi.spyOn(process.stdout, "write").mockImplementation(chunk => { stdout += String(chunk); return true; });
});
afterEach(() => { vi.restoreAllMocks(); process.exitCode = priorExitCode; });
it.each(["activate", "publish", "reopen"] as const)("%s target admission preserves a ranked clash in JSON", async verb => {
  const h = createLifecycleHarness(), primary = await h.seedMeta("example"), other = await h.seedMeta("other");
  const store = createClashDouble(h.store, { slug: "example", holders: [primary.reference, other.reference] });
  const lookup = await store.lookup({ kind: "slug", slug: SlugSchema.parse("example") });
  if (lookup.status !== "refused") throw new Error("Expected an ambiguous fixture");
  const selected = verb === "activate" ? await resolveVerbTargetOrReport(verb, "example", "/repo", true, store)
    : await resolvePublicationTarget({ cwd: "/repo", store }, verb, "example", true);
  expect(selected).toBeNull(); expect(process.exitCode).toBe(1);
  const envelope = LifecycleCommandRefusalSchema.parse(JSON.parse(stdout));
  expect(envelope).toMatchObject({ refusal: lookup.refusal });
  expect(envelope.remedy.argv).toEqual(["arc", "status", "--json"]);
  if (primary.reference.owner.type === "person" || other.reference.owner.type === "person") throw new Error("Expected work-item identities");
  expect(envelope.remedy.text).toContain(`arc rename ${primary.reference.owner.uid} <new-slug>`);
  expect(envelope.remedy.text).toContain(`arc rename ${other.reference.owner.uid} <new-slug>`);
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(primary);
  expect(lifecycleSuccess(await h.store.read({ reference: other.reference }))).toEqual(other);
});
it("retains a non-clash store refusal without changing its supplied spine remedy", () => {
  const refusal = StoreRefusalSchema.parse({ code: "lock-held", class: "recoverable", lock: "project-state",
    condition: "The state writer is busy.", remedy: { text: "Retry after the writer finishes.", argv: ["arc", "status", "--json"] } });
  const remedy = spineRemedy(refusal.condition, refusal.remedy.text, ["arc", "status", "--json"]);
  refuseWithRemedy(refusal.condition, remedy, true, refusal);
  const envelope = LifecycleCommandRefusalSchema.parse(JSON.parse(stdout));
  expect(envelope).toMatchObject({ refusal }); expect(envelope.remedy).toEqual(remedy);
});
