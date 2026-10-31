/** Lifecycle target refusal envelopes retain complete store ambiguity and repair evidence. */
import { afterEach, beforeEach, expect, it, vi, onTestFinished } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeWorktreeOwnershipMarker } from "../../../src/lib/git/worktree-marker.js";
import { boundWorkUnitSubject } from "../../helpers/store/bound-checkout.js";
import { resolvePublicationTarget, resolveVerbTargetOrReport } from "../../../src/handlers/lifecycle.js";
import { LifecycleCommandRefusalSchema, refuseWithRemedy } from "../../../src/handlers/lifecycle-shared.js";
import { spineRemedy, SpineRemedySchema } from "../../../src/scripts/integration/spine-refusal.js";
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
it.each(["activate", "publish", "reopen"] as const)("%s preserves every unbound checkout exit in its JSON remedy", async verb => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-target-unbound-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  const h = createLifecycleHarness(), primary = await h.seedMeta("example"), before = lifecycleSuccess(await h.store.version());
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, createdFor: { kind: "work-unit", name: "example" }, spawningIdentity: "test-user", now: 0 });
  const select = () => verb === "activate" ? resolveVerbTargetOrReport(verb, undefined, cwd, true, h.store)
    : resolvePublicationTarget({ cwd, store: h.store }, verb, undefined, true);
  expect(await select()).toBeNull();
  expect(process.exitCode).toBe(1);
  expect(LifecycleCommandRefusalSchema.parse(JSON.parse(stdout))).toMatchObject({ status: "rejected",
    reason: expect.stringContaining("unbound"), remedy: [
      { argv: ["arc", "materialize", "example", "--here"], checkout: cwd },
      { argv: ["arc", "locus", "release"], checkout: cwd },
    ] });
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, createdFor: boundWorkUnitSubject(primary), spawningIdentity: "test-user", now: 0 });
  expect(await select()).toEqual(verb === "activate" ? "example" : { name: "example", record: primary });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});
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
  const remedy = SpineRemedySchema.parse(envelope.remedy);
  expect(remedy.argv).toEqual(["arc", "status", "--json"]);
  if (primary.reference.owner.type === "person" || other.reference.owner.type === "person") throw new Error("Expected work-item identities");
  expect(remedy.text).toContain(`arc rename ${primary.reference.owner.uid} <new-slug>`);
  expect(remedy.text).toContain(`arc rename ${other.reference.owner.uid} <new-slug>`);
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
