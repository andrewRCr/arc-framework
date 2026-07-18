import { describe, expect, it } from "vitest";

import {
  buildErrandCheckJsonEnvelope,
  formatErrandCheckCaveats,
  formatErrandPushDeferredWarning,
} from "../../../src/handlers/errand.js";

describe("formatErrandCheckCaveats", () => {
  it("renders caveat lines for skipped marked entries and indeterminate probes", () => {
    const lines = formatErrandCheckCaveats({
      overlaps: [],
      skipped: [
        {
          branch: "feat/wu-a",
          worktreePath: "/repo.wu-a",
          marks: ["location-ambiguous"],
          reason: "entry-location-ambiguous",
        },
        {
          branch: "feat/wu-local",
          remoteOnly: false,
          marks: ["indeterminate"],
          reason: "entry-marked-indeterminate",
        },
      ],
      indeterminate: [
        {
          branch: "feat/wu-b",
          worktreePath: "/repo.wu-b",
          matchedPaths: [],
          reason: "uncommitted-probe-disagreement",
        },
      ],
      notes: ["Originating work unit name was unavailable; self-exclusion fell back to worktree/meta path matching."],
    });

    expect(lines).toEqual([
      "feat/wu-a  skipped  marked location-ambiguous  (/repo.wu-a)",
      "feat/wu-local  skipped  marked indeterminate  (no worktree)",
      "feat/wu-b  caveat  probe indeterminate  (/repo.wu-b)",
      "Originating work unit name was unavailable; self-exclusion fell back to worktree/meta path matching.",
    ]);
  });
});

describe("buildErrandCheckJsonEnvelope", () => {
  it("carries skipped-entry mark fields for JSON consumers", () => {
    const envelope = buildErrandCheckJsonEnvelope(
      {
        overlaps: [],
        skipped: [
          {
            branch: "feat/wu-a",
            marks: ["location-ambiguous"],
            reason: "entry-location-ambiguous",
          },
        ],
      },
      [],
      true,
    );

    expect(envelope.skipped?.[0]?.marks).toEqual(["location-ambiguous"]);
    expect(envelope).toMatchObject({ warnings: [], reachable: true });
  });
});

describe("formatErrandPushDeferredWarning", () => {
  it("names every same-slug collision and gives the actual discard-side recovery", () => {
    const warning = formatErrandPushDeferredWarning(
      "Record-removal",
      { kind: "conflict", slugs: ["alpha", "beta"] },
      true,
    );

    expect(warning).toContain("alpha, beta");
    expect(warning).toContain("arc errand close --force <slug>");
    expect(warning).toContain("discarded side");
    expect(warning).not.toContain("reconciles on the next `arc sync`");
  });

  it("surfaces when no sync-state record could retain the recovery marker", () => {
    const warning = formatErrandPushDeferredWarning(
      "Record",
      { kind: "failed", error: new Error("offline") },
      false,
    );

    expect(warning).toContain("recovery marker was not recorded");
    expect(warning).toContain("retry recovery with `arc sync`");
    expect(warning).not.toContain("it reconciles");
  });
});
