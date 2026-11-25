/** Effective view interpretation keeps unknown settings visible and every valid pinned slug. */
import { expect, it } from "vitest";
import { interpretProjectionView } from "../../../../src/lib/store/projection/view-settings.js";

it("defaults an unset view to mine", () => {
  expect(interpretProjectionView({ setting: null, pins: [] })).toEqual({ view: { mode: "mine", pins: [] }, diagnostics: [] });
});

it.each(["mine", "cohort", "all"] as const)("interprets %s and retains every pinned slug", mode => {
  expect(interpretProjectionView({ setting: mode, pins: ["alpha", "beta", "alpha"] }))
    .toEqual({ view: { mode, pins: ["alpha", "beta", "alpha"] }, diagnostics: [] });
});

it("falls back to mine while reporting an unknown setting and its repair", () => {
  expect(interpretProjectionView({ setting: "unknown", pins: ["alpha"] })).toMatchObject({
    view: { mode: "mine", pins: ["alpha"] }, diagnostics: [{
      reason: expect.stringContaining('arc.inflightView value "unknown"'), remedy: { text: expect.stringContaining("mine, cohort, or all") },
    }],
  });
  expect(interpretProjectionView({ setting: "all", pins: ["alpha"] })).toEqual({ view: { mode: "all", pins: ["alpha"] }, diagnostics: [] });
});

it("reports an invalid pin without discarding valid pins and accepts the corrected slug", () => {
  expect(interpretProjectionView({ setting: "all", pins: ["alpha", "Bad Name", "beta"] })).toMatchObject({
    view: { mode: "all", pins: ["alpha", "beta"] }, diagnostics: [{
      reason: expect.stringContaining('arc.inflightPin value "Bad Name"'), remedy: { text: expect.stringContaining("valid work-item slug") },
    }],
  });
  expect(interpretProjectionView({ setting: "all", pins: ["alpha", "good-name", "beta"] }))
    .toEqual({ view: { mode: "all", pins: ["alpha", "good-name", "beta"] }, diagnostics: [] });
});
