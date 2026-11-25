/** Provider comparison retains authored-name identity only without two known generations. */
import { expect, it } from "vitest";
import { createDecomposeHarness } from "../../../helpers/store/decompose-harness.js";
import { observeDecomposeSeededProvider, sameDecomposeSeededProvider } from "../../../../src/lib/decompose/seeded-provider.js";

it("falls back to the authored slug with an unresolved owner but distinguishes two known generations", async () => {
  const empty = createDecomposeHarness(), first = createDecomposeHarness(), second = createDecomposeHarness();
  await first.seedStub("provider");
  await second.seedStub("provider");
  const unresolved = await observeDecomposeSeededProvider(empty.store, "provider");
  const anotherName = await observeDecomposeSeededProvider(empty.store, "another-provider");
  const one = await observeDecomposeSeededProvider(first.store, "provider");
  const two = await observeDecomposeSeededProvider(second.store, "provider");
  if (unresolved.status === "refused" || anotherName.status === "refused" || one.status === "refused" || two.status === "refused") throw new Error("Expected complete observations.");
  expect(sameDecomposeSeededProvider(unresolved.result, one.result)).toBe(true);
  expect(sameDecomposeSeededProvider(one.result, unresolved.result)).toBe(true);
  expect(sameDecomposeSeededProvider(anotherName.result, one.result)).toBe(false);
  expect(sameDecomposeSeededProvider(one.result, two.result)).toBe(false);
});
