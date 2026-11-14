import { describe, expect, it } from "vitest";

import { metadataRef as ref, refObjectReadFixture } from "../../../helpers/store/ref-object-read.js";

/** A fixture whose tree enumerations count the batch requests that read its root tree by ID. */
function fixture(options: Parameters<typeof refObjectReadFixture>[0]) {
  const read = refObjectReadFixture(options);
  return { ...read, enumerations: () => read.batches.filter(queries => queries.includes(read.rootTree)).length };
}

describe("ref store point-query absence", () => {
  it.each([
    ["metadata blob", { missingMetadata: true }],
    ["containing tree", { missingTree: true }],
    ["record blob", { missingRecord: true }],
  ] as const)("refuses a missing %s recoverably with object restoration", async (_label, options) => {
    const { store, reference, enumerations } = fixture(options);
    expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", class: "recoverable", reference, historyRefs: [],
      remedy: { text: expect.stringMatching(/Restore.*missing/u) },
    } });
    expect(enumerations()).toBe("missingTree" in options ? 0 : 1);
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
    const { store, reference, enumerations } = fixture(options);
    expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: {
      code: "not-found", class: "recoverable", reference,
    } });
    expect(enumerations()).toBe(1);
  });

  it("retries when a ref-name metadata miss disagrees with the captured tip", async () => {
    const { store, reference } = fixture({ transientMetadataAbsence: true });
    expect(await store.read({ reference })).toMatchObject({ status: "ok", result: { reference, content: "kept" } });
  });

  it("refuses present malformed metadata after establishing that its tree holds records", async () => {
    const { store, reference, enumerations } = fixture({ metadata: "not JSON" });
    expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: {
      code: "namespace-corrupt", class: "terminal", remedy: { text: expect.stringContaining("forward") },
    } });
    expect(enumerations()).toBe(1);
  });

  it.each([
    ["unparseable JSON", { metadata: "not JSON" }],
    ["a tree object", { type: "tree" as const }],
  ] as const)("keeps a record-free tree containing %s as not-found", async (_label, options) => {
    const { store, reference, enumerations } = fixture({ ...options, record: false });
    expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: {
      code: "not-found", class: "recoverable", reference,
    } });
    expect(enumerations()).toBe(1);
  });
});
