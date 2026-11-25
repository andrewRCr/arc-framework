import { expect, it } from "vitest";

import { refObjectReadFixture } from "../../../helpers/store/ref-object-read.js";

it("keeps a missing history endpoint metadata blob recoverable without requesting a live owner's history", async () => {
  const { store, reference, calls } = refObjectReadFixture({ missingMetadata: true, graph: "empty" });
  expect(await store.history({ reference })).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", historyRefs: [],
    remedy: { text: expect.stringMatching(/restore|fetch/iu) },
  } });
  expect(calls.filter(args => args[0] === "for-each-ref")).toHaveLength(1);
});

it("keeps an unavailable archive quarter tree recoverable on a UID read", async () => {
  const { store, reference } = refObjectReadFixture({ archive: { root: "01_alpha/", quarter: "2026-q4" }, missingTree: true });
  expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", historyRefs: [],
    remedy: { text: expect.stringMatching(/restore|fetch/iu) },
  } });
});
