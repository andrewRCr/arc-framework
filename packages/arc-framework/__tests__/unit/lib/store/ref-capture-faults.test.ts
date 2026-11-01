import { describe, expect, it } from "vitest";

import { ListingOutcomeSchema } from "../../../../src/lib/store/read.js";
import { metadataValue, refObjectReadFixture } from "../../../helpers/store/ref-object-read.js";
import { success } from "../../../helpers/store/suite-tools.js";

const completed = { ...metadataValue, primary: { ...metadataValue.primary, placement: { kind: "completed", quarter: "2026-q4" } } };
const archive = { root: "01_alpha/", quarter: "2026-q4" };

describe("capture fault conversion through public archive reads", () => {
  it("keeps a missing record recoverable through its captured diagnostic", async () => {
    const { store, reference, version } = refObjectReadFixture({ archive, metadata: JSON.stringify(completed), missingRecord: true });
    for (const input of [{ reference }, { reference, asOf: version }]) {
      expect(await store.read(input)).toMatchObject({ status: "refused", refusal: {
        code: "state-unresolvable", class: "recoverable", remedy: { text: expect.stringMatching(/restore/iu) },
      } });
    }
    const listing = success(await store.list({ family: "work-item" }));
    expect(listing).toMatchObject({ status: "complete", missed: true, diagnostics: [{ kind: "unreadable" }] });
    expect(ListingOutcomeSchema.safeParse(listing).success).toBe(true);
    if (listing.status === "complete") expect(listing.diagnostics[0]).not.toHaveProperty("fault");
  });

  it.each([
    { label: "missing", options: { missingMetadata: true, metadata: JSON.stringify(completed) }, code: "state-unresolvable", remedy: /restore/iu },
    { label: "unparseable", options: { metadata: "not JSON" }, code: "namespace-corrupt", remedy: /forward/iu },
  ])("takes the $label metadata diagnostic's fault row without exposing the tag", async ({ options, code, remedy }) => {
    const { store, reference, version } = refObjectReadFixture({ archive, ...options });
    expect(await store.lookup({ kind: "slug", slug: reference.owner.name })).toMatchObject({ status: "refused", refusal: {
      code, remedy: { text: expect.stringMatching(remedy) },
    } });
    for (const input of [{ family: "work-item" as const }, { family: "work-item" as const, asOf: version }]) {
      const listing = success(await store.list(input));
      expect(listing).toMatchObject({ status: "complete", missed: true, diagnostics: [{ kind: "unreadable" }] });
      expect(ListingOutcomeSchema.safeParse(listing).success).toBe(true);
      if (listing.status === "complete") expect(listing.diagnostics[0]).not.toHaveProperty("fault");
    }
  });

  it("preserves a key-mismatch's own folder condition and repair", async () => {
    const { store, reference } = refObjectReadFixture({ archive: { ...archive, root: "01_wrong/" }, metadata: JSON.stringify(completed) });
    expect(await store.lookup({ kind: "slug", slug: reference.owner.name })).toMatchObject({ status: "refused", refusal: {
      code: "namespace-corrupt", class: "terminal", condition: expect.stringContaining("role or owner coordinates"),
      remedy: { text: expect.stringContaining("Restore the folder name") },
    } });
    const listing = success(await store.list({ family: "work-item" }));
    expect(listing).toMatchObject({ status: "complete", diagnostics: [{ kind: "key-mismatch" }] });
    expect(ListingOutcomeSchema.safeParse(listing).success).toBe(true);
    if (listing.status === "complete") expect(listing.diagnostics[0]).not.toHaveProperty("fault");
  });
});
