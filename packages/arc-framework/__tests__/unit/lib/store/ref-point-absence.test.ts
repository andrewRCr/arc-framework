import { describe, expect, it } from "vitest";

import { metadataRef as ref, refObjectReadFixture as fixture } from "../../../helpers/store/ref-object-read.js";

describe("ref store point-query absence", () => {
  it.each([
    ["metadata blob", { missingMetadata: true }],
    ["containing tree", { missingTree: true }],
    ["record blob", { missingRecord: true }],
  ] as const)("refuses a missing %s recoverably with object restoration", async (_label, options) => {
    const { store, reference, calls } = fixture(options);
    expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", class: "recoverable", reference, historyRefs: [],
      remedy: { text: expect.stringMatching(/Restore.*missing/u) },
    } });
    expect(calls.filter(args => args[0] === "diff-tree")).toHaveLength("missingTree" in options ? 0 : 1);
  });

  it("refuses an absent metadata entry beside records with a forward repair", async () => {
    const { store, reference } = fixture({ metadata: null });
    expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: {
      code: "namespace-corrupt", class: "terminal", namespace: ref, remedy: { text: expect.stringContaining("forward") },
    } });
  });

  it.each([
    ["record path", { record: false }],
    ["record-free tree", { record: false, metadata: null }],
  ] as const)("keeps an absent %s as not-found", async (_label, options) => {
    const { store, reference, calls } = fixture(options);
    expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: {
      code: "not-found", class: "recoverable", reference,
    } });
    expect(calls.filter(args => args[0] === "diff-tree")).toHaveLength(1);
  });

  it("retries when a ref-name metadata miss disagrees with the captured tip", async () => {
    const { store, reference } = fixture({ transientMetadataAbsence: true });
    expect(await store.read({ reference })).toMatchObject({ status: "ok", result: { reference, content: "kept" } });
  });

  it("refuses a present malformed metadata object without enumerating its tree", async () => {
    const { store, reference, calls } = fixture({ metadata: "not JSON" });
    expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: {
      code: "namespace-corrupt", class: "terminal", remedy: { text: expect.stringContaining("forward") },
    } });
    expect(calls.some(args => args[0] === "diff-tree")).toBe(false);
  });
});
