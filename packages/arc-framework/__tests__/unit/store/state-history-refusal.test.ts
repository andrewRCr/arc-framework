/** Saved-state refusals name only provider-owned history refs. */
import { expect, it } from "vitest";
import { StoreRefusalSchema } from "../../../src/lib/store/refusal.js";

const refusal = { code: "state-unresolvable", class: "recoverable", condition: "Saved history is absent.",
  remedy: { text: "Pull the missing history and retry." }, stateVersion: "expired-state",
  historyRefs: ["refs/arc/history/work/00000000-0000-4000-8000-000000000001"] };
it("admits the provider's named saved-state refusal and rejects unrelated ref namespaces", () => {
  expect(StoreRefusalSchema.parse(refusal)).toEqual(refusal);
  expect(StoreRefusalSchema.safeParse({ ...refusal, historyRefs: ["refs/heads/main"] }).success).toBe(false);
});
