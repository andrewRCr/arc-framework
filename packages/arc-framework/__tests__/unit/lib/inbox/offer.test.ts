/** An offer distinguishes missing entries and same-entry conflicts while leaving ranks untouched. */
import { expect, it } from "vitest";
import { createInboxHarness, entry } from "../../../helpers/inbox-harness.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { setErrandQueue } from "../../../../src/lib/inbox/queue.js";
import { resolveQueueExecutionOffer } from "../../../../src/lib/inbox/offer.js";

it("takes the first acceptable member, reporting left-out and skipped members without writing", async () => {
  const h = createInboxHarness();
  const saved = await h.inbox("personal", [entry("22222222", "Two"), entry("33333333", "Three")].join("\n\n"));
  expect((await setErrandQueue({ schemaVersion: 1, members: ["11111111", "22222222", "33333333"].map((id) => ({ inbox: "personal", id })) }, h.context)).state).toBe("set");
  for (const title of ["Two current", "Two incoming"]) success(await h.context.store.write({ action: "put", reference: saved.reference, expected: saved.version, content: saved.content.replace("Two", title), provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const before = success(await h.context.store.version());
  expect(await resolveQueueExecutionOffer(h.context)).toMatchObject({ status: "ok", result: { nextOffer: { key: "personal:33333333" }, leftOut: [{ id: "11111111", remedy: { text: expect.stringContaining("arc errand queue set") } }], skipped: [{ id: "22222222", remedy: { text: expect.stringContaining("arc errand queue set") } }] } });
  expect(success(await h.context.store.version())).toBe(before);
});
