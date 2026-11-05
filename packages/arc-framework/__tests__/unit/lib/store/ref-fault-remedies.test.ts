import { describe, expect, it } from "vitest";

import { ListingOutcomeSchema } from "../../../../src/lib/store/read.js";
import { metadataRef as ref, refObjectReadFixture as fixture } from "../../../helpers/store/ref-object-read.js";

describe("ref object fault remedies", () => {
  it("restores missing saved metadata instead of offering an ancestor repair", async () => {
    const { store, reference, version } = fixture({ missingMetadata: true });
    expect(await store.read({ reference, asOf: version })).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", class: "recoverable", historyRefs: [],
      remedy: { text: expect.stringMatching(/Restore.*missing/u) },
    } });
  });

  it.each([
    ["unparseable metadata", "not JSON"], ["no metadata", null],
  ] as const)("keeps %s terminal with current and historical remedies", async (_label, metadata) => {
    const { store, reference, version } = fixture({ metadata });
    expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: {
      code: "namespace-corrupt", class: "terminal", namespace: ref,
      remedy: { text: expect.stringContaining("forward") },
    } });
    expect(await store.read({ reference, asOf: version })).toMatchObject({ status: "refused", refusal: {
      code: "namespace-corrupt", class: "terminal", namespace: ref,
      remedy: { text: expect.stringContaining("cannot change an ancestor") },
    } });
  });

  it("keeps a point reader's specific missing-record text", async () => {
    const { store, reference } = fixture({ missingRecord: true });
    expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", class: "recoverable", historyRefs: [],
      condition: `The record blob at extra-alpha.md on ${ref} is unavailable locally.`,
      remedy: { text: `Restore or fetch the missing record objects for ${ref} in the store repository, then retry.` },
    } });
  });

  it("lists a missing record blob with object restoration and the existing diagnostic schema", async () => {
    const { store } = fixture({ missingRecord: true });
    const listing = await store.list({ family: "work-item" });
    expect(listing).toMatchObject({ status: "ok", result: { status: "complete", records: [], missed: true,
      diagnostics: [{ kind: "unreadable", key: "extra-alpha.md", remedy: { text: expect.stringMatching(/Restore.*missing/u) } }],
    } });
    if (listing.status !== "ok") throw new Error("Expected listing");
    expect(ListingOutcomeSchema.safeParse(listing.result).success).toBe(true);
  });
});
