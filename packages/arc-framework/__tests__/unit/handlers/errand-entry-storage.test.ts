/** Errand adoption waits for a complete state pull before returning an actionable plan. */
import { expect, it } from "vitest";
import { prepareHandlerErrandAdoption } from "../../../src/handlers/errand-entry-storage.js";
import { createStoreSyncPort } from "../../../src/lib/store/operational-sync.js";
import { PullResultSchema } from "../../../src/lib/store/sync.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";

it.each(["unreachable", "incomplete"] as const)("refuses %s adoption and continues after the pull is repaired", async status => {
  const h = createLifecycleHarness();
  let complete = false;
  const sync = createStoreSyncPort({ pull: async () => complete ? { status: "pulled" }
    : { status, condition: "Source state unavailable.", remedy: { text: "Repair source state." } } });
  h.store.pull = async () => ({ status: "ok", result: PullResultSchema.parse({ states: [], pulls: [{ status: complete ? "pulled" : "failed", remote: "origin", role: "state", families: ["personal"], notices: [],
    ...(complete ? {} : { failure: { ...(status === "unreachable" ? { code: "unreachable", class: "recoverable", cause: "network" } : { code: "refused", class: "terminal", message: "Source state unavailable." }),
      condition: "Source state unavailable.", remedy: { text: "Repair source state." } } }) }] }) });
  const context = { store: h.store, sync, identity: "alice", now: () => new Date("2026-10-01T00:00:00.000Z") };
  const request = { slug: "example", intent: "Keep this free-text description." };
  const legacy = async () => { throw new Error("Selected the legacy adoption path"); };
  const before = lifecycleSuccess(await h.store.version());
  await expect(prepareHandlerErrandAdoption(request, context, legacy)).rejects.toThrow("Source state unavailable. Repair source state.");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  complete = true;
  const plan = await prepareHandlerErrandAdoption(request, context, legacy);
  expect(plan.origin).toBeNull();
  expect(plan.writes).toEqual(expect.arrayContaining([expect.objectContaining({ reference: expect.objectContaining({ kind: "work-item/description" }),
    content: expect.stringContaining(request.intent) })]));
  complete = false;
  const boundContext = { store: h.store, identity: context.identity, now: context.now };
  await expect(prepareHandlerErrandAdoption(request, boundContext, legacy)).rejects.toThrow("Source state unavailable. Repair source state.");
  complete = true;
  expect((await prepareHandlerErrandAdoption(request, boundContext, legacy)).writes).toEqual(
    expect.arrayContaining([expect.objectContaining({ content: expect.stringContaining(request.intent) })]));
});
