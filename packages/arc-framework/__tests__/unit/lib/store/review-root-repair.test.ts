/** Invalid repair requests preserve the store's existing typed refusal boundary. */
import { expect, it } from "vitest";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { runReviewRootRepair } from "../../../../src/lib/store/review-root-repair.js";

it.each([null, { schemaVersion: 9, operation: "preview" }])("returns a recoverable store refusal for malformed request %j", async request => {
  const h = createReviewHarness();
  await expect(runReviewRootRepair({ store: h.store, request, now: () => "2026-11-03T10:00:00Z" }))
    .resolves.toMatchObject({ status: "refused", refusal: { code: "record-malformed", class: "recoverable",
      remedy: { text: expect.stringContaining("repair-review-roots --schema") } } });
});
