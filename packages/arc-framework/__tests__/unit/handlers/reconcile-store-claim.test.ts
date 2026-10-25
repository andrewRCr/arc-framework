/** Reconcile's ended-holder fallback retains the marker generation through its metadata read. */
import { expect, it, vi } from "vitest";
import { handleStoreReconcile } from "../../../src/handlers/reconcile.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { boundWorkUnitCheckout } from "../../helpers/store/bound-checkout.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";

it("does not apply a live namesake's dependency repair from the ended owner's checkout", async () => {
  const h = createLifecycleHarness(), completed = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
  await h.seedMeta("done", { state: "Shipped", currentWorkflow: null }, completed);
  const ended = await h.seedMeta("example", { state: "Shipped", currentWorkflow: null }, completed);
  const live = await h.seedMeta("example", { dependsOn: ["done"] });
  const cwd = await boundWorkUnitCheckout(ended), oldExit = process.exitCode;
  let stdout = "";
  const output = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { stdout += String(chunk); return true; });
  try { await handleStoreReconcile(h.store, cwd, { apply: true, json: true }); }
  finally { output.mockRestore(); process.exitCode = oldExit; }
  expect(JSON.parse(stdout)).toMatchObject({ status: "clean", dependency: { before: [], after: [] } });
  expect(lifecycleSuccess(await h.store.read({ reference: live.reference }))).toEqual(live);
  expect(lifecycleSuccess(await h.store.read({ reference: ended.reference }))).toEqual(ended);
});
