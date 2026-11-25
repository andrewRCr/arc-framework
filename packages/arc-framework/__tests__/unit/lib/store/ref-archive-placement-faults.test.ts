import { describe, expect, it } from "vitest";

import { ListingOutcomeSchema } from "../../../../src/lib/store/read.js";
import { metadataValue, refObjectReadFixture as fixture } from "../../../helpers/store/ref-object-read.js";

const completed = { ...metadataValue, primary: { ...metadataValue.primary, placement: { kind: "completed", quarter: "2026-q4" } } };
const recordRole = { ...metadataValue, primary: { ...metadataValue.primary, role: "work-item/record" } };
const cases = [
  { label: "active placement", metadata: metadataValue, root: "01_alpha/",
    condition: "holds metadata whose placement is active, not completed.", remedy: "completed placement" },
  { label: "absent placement", metadata: { formatVersion: 1, slug: "alpha", formats: {} }, root: "01_alpha/",
    condition: "holds metadata whose placement is absent, not completed.", remedy: "completed placement" },
  { label: "wrong quarter", metadata: { ...completed, primary: { ...completed.primary, placement: { kind: "completed", quarter: "2026-q3" } } },
    root: "01_alpha/", condition: "is in quarter 2026-q4, but its metadata records quarter 2026-q3.", remedy: "Move the folder" },
  { label: "invalid sequence", metadata: completed, root: "1_alpha/", condition: "has no valid sequence prefix.", remedy: "Rename the folder" },
  { label: "record-role active placement", metadata: recordRole, root: "alpha-12345678/",
    condition: "holds metadata whose placement is active, not completed.", remedy: "completed placement" },
  { label: "record-role wrong quarter", metadata: { ...recordRole, primary: { ...recordRole.primary, placement: { kind: "completed", quarter: "2026-q3" } } },
    root: "alpha-12345678/", condition: "is in quarter 2026-q4, but its metadata records quarter 2026-q3.", remedy: "Move the folder" },
];

describe("ref archive placement facts", () => {
  it.each(cases)("reports $label with its placement remedy and historical side", async ({ metadata, root, condition, remedy }) => {
    const { store, reference, namespace, version } = fixture({ metadata: JSON.stringify(metadata), archive: { root, quarter: "2026-q4" } });
    const key = `${namespace}:${root}`;
    for (const saved of [false, true]) {
      const input = saved ? { asOf: version } : {};
      const expectedRemedy = saved ? expect.stringContaining("cannot change an ancestor") : expect.stringContaining(remedy);
      const listing = await store.list({ family: "work-item", ...input });
      expect(listing).toMatchObject({ status: "ok", result: { status: "complete", missed: true, records: [], diagnostics: [{
        kind: "malformed", rule: "placement", key, condition: `The archive folder ${key} ${condition}`, remedy: { text: expectedRemedy },
      }] } });
      if (listing.status !== "ok") throw new Error("Expected listing");
      expect(ListingOutcomeSchema.safeParse(listing.result).success).toBe(true);
      expect(await store.read({ reference, ...input })).toMatchObject({ status: "refused", refusal: {
        code: "namespace-corrupt", class: "terminal", namespace, remedy: { text: expectedRemedy },
      } });
    }
  });

  it("reads a completed record-role folder without requiring a sequence prefix", async () => {
    const { store, reference } = fixture({ metadata: JSON.stringify({ ...recordRole,
      primary: { ...recordRole.primary, placement: { kind: "completed", quarter: "2026-q4" } } }),
      archive: { root: "alpha-12345678/", quarter: "2026-q4" } });
    expect(await store.read({ reference })).toMatchObject({ status: "ok", result: { content: "kept",
      placement: { kind: "completed", quarter: "2026-q4" } } });
    expect(await store.list({ family: "work-item" })).toMatchObject({ status: "ok", result: { status: "complete",
      records: [expect.objectContaining({ content: "kept" })], diagnostics: [], missed: false,
    } });
  });

  it.each([
    { label: "a cohort without its closeout letter", root: "01_cohort-alpha/", family: "cohort", metadata: {
      formatVersion: 1, slug: "alpha", formats: {}, placement: { kind: "completed", quarter: "2026-q4" },
    } },
    { label: "a nonnumeric work-item folder", root: "bad_alpha/", family: "work-item", metadata: completed },
  ] as const)("keeps $label as a coordinate mismatch", async ({ root, family, metadata }) => {
    const { store, namespace, version } = fixture({ metadata: JSON.stringify(metadata), archive: { root, quarter: "2026-q4" } });
    const key = `${namespace}:${root}`;
    for (const saved of [false, true]) {
      expect(await store.list({ family, ...saved ? { asOf: version } : {} })).toMatchObject({ status: "ok", result: {
        records: [], missed: true, diagnostics: [{ kind: "key-mismatch", key,
          condition: expect.stringContaining("role or owner coordinates"),
          remedy: { text: saved ? expect.stringContaining("ancestor") : expect.stringContaining("Restore the folder name") },
        }],
      } });
    }
  });
});
