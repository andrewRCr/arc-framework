import { describe, expect, it } from "vitest";

import { metadataRef, refObjectReadFixture } from "../../../helpers/store/ref-object-read.js";

const history = metadataRef.replace("refs/arc/", "refs/arc/history/");

describe("saved object-loss history routes", () => {
  it.each([true, false])("names history for a missing saved root only when live is %s", async live => {
    const { store, reference, version } = refObjectReadFixture({ missingTree: true, live });
    for (const result of [await store.read({ reference, asOf: version }), await store.list({ family: "work-item", asOf: version })]) {
      expect(result).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", class: "recoverable",
        stateVersion: version, historyRefs: live ? [] : [history], remedy: { text: expect.stringMatching(/restore|fetch/iu) },
      } });
    }
  });

  it.each([true, false])("names history for a missing saved metadata blob only when live is %s", async live => {
    const { store, reference, version } = refObjectReadFixture({ missingMetadata: true, live });
    expect(await store.read({ reference, asOf: version })).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", historyRefs: live ? [] : [history],
    } });
  });

  it.each([
    ["project-registry", "refs/arc/project/registry"], ["personal", "refs/arc/user/andrew/personal"],
  ] as const)("keeps a saved %s fault free of history routes", async (family, namespace) => {
    const { store, version } = refObjectReadFixture({ missingTree: true, namespace, identity: "andrew" });
    expect(await store.list({ family, asOf: version })).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", historyRefs: [], stateVersion: version,
    } });
  });

  it("adds no current-ref read to a successful saved read", async () => {
    const { store, reference, version, calls } = refObjectReadFixture();
    expect(await store.read({ reference, asOf: version })).toMatchObject({ status: "ok", result: { content: "kept" } });
    expect(calls.filter(args => args[0] === "for-each-ref")).toEqual([]);
  });

  it("uses its captured live tips when a history walk loses a parent", async () => {
    const { store, reference, calls } = refObjectReadFixture({ graph: "missing-parent" });
    expect(await store.history({ reference })).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", class: "recoverable", historyRefs: [],
      remedy: { text: expect.stringMatching(/restore|fetch/iu) },
    } });
    expect(calls.filter(args => args[0] === "for-each-ref")).toHaveLength(1);
  });

  it("adds no failure-only ref read to a successful history walk", async () => {
    const { store, reference, calls } = refObjectReadFixture({ graph: "empty" });
    expect(await store.history({ reference })).toEqual({ status: "ok", result: [] });
    expect(calls.filter(args => args[0] === "for-each-ref")).toHaveLength(1);
  });
});
