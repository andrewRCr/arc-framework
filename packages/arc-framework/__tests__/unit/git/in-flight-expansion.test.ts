/** Only expected fetch writes may disappear from in-flight drift comparisons. */

import { expect, it } from "vitest";

import { accountForFetchedTracking } from "../../../src/lib/git/in-flight-expansion.js";

const base = "a".repeat(40);
const captured = "b".repeat(40);
const concurrent = "c".repeat(40);

it("accounts for the captured fetch tip while retaining unrelated local changes as drift", () => {
  const before = { remoteTracking: { main: base }, localHeads: { main: base } };
  const after = { remoteTracking: { main: base, "feat/later": captured }, localHeads: { main: concurrent } };

  expect(accountForFetchedTracking(before, after, { "origin/feat/later": captured }, "origin")).toEqual({
    remoteTracking: { main: base, "feat/later": captured }, localHeads: { main: base },
  });
  expect(before).toEqual({ remoteTracking: { main: base }, localHeads: { main: base } });
});

it("keeps a concurrently changed remote tip outside the fetch's expected writes", () => {
  const before = { remoteTracking: { main: base }, localHeads: { main: base } };
  const after = { remoteTracking: { main: base, "feat/later": concurrent }, localHeads: { main: base } };

  expect(accountForFetchedTracking(before, after, { "origin/feat/later": captured }, "origin")).toEqual(before);
});
