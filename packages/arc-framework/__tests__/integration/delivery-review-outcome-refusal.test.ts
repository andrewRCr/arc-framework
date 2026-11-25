/** Native delivery review retains outcome-list refusals and resumes after repair without abandoned promises. */
import { expect, it } from "vitest";
import type { Store } from "../../src/lib/store/contract.js";
import { sameOwner } from "../../src/lib/store/identity.js";
import { LifecycleReferenceBackend } from "../helpers/store/lifecycle-harness.js";
import { createNativePublishedDeliveryFixture, seedNativeClosedDeliveryTasks, carryNativeDeliveryStatus,
  invokeNativeDelivery } from "../helpers/store/native-delivery-refusal.js";

it("returns the native refusal and resumes after repair without escaping the awaited command", async () => {
  const h = await createNativePublishedDeliveryFixture();
  await seedNativeClosedDeliveryTasks(h);
  await carryNativeDeliveryStatus(h);
  const scope = { family: "review" as const, kind: "review/outcome" as const, owner: h.primary.reference.owner };
  const damaged = new LifecycleReferenceBackend();
  damaged.state.corrupt = true;
  const refusedListing = await damaged.list(scope);
  if (refusedListing.status !== "refused") throw new Error("Expected the damaged native backend's refusal");
  let broken = true;
  const store = Object.create(h.reference.store) as Store;
  store.list = async input => broken && input.family === scope.family && input.kind === scope.kind
    && input.owner !== undefined && sameOwner(input.owner, scope.owner)
    ? refusedListing : h.reference.store.list(input);
  const request = { repository: "owner/repo", remote: "origin" };
  const refused = await invokeNativeDelivery(h, "review-fix-continue", request, store);
  expect(refused.result, refused.output).toMatchObject({ status: "refused", reason: "review-status-unavailable",
    recommendedActionText: expect.stringContaining(refusedListing.refusal.condition) });
  expect(refused.result).toHaveProperty("recommendedActionText", expect.stringContaining(refusedListing.refusal.remedy.text));
  await new Promise<void>(resolve => setImmediate(resolve));
  broken = false;
  const repaired = await invokeNativeDelivery(h, "review-fix-continue", request, store);
  expect(repaired.exits, repaired.output).toEqual([]);
  expect(repaired.result, repaired.output).toMatchObject({ status: "review-status-required", nextAction: "review-hosted-request" });
  await new Promise<void>(resolve => setImmediate(resolve));
}, 60_000);
