import { describe, expect, it } from "vitest";

import {
  buildErrandCheckJsonEnvelope,
  formatErrandCheckCaveats,
  formatErrandCloseResult,
} from "../../../src/handlers/errand.js";
import { createErrandTerminalResult } from "../../../src/lib/errand/terminal-result.js";

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

describe("formatErrandCloseResult", () => {
  it("renders the same validated result as human narration and JSON", () => {
    const result = createErrandTerminalResult({
      outcome: "refused",
      operation: "errand-close",
      subject: null,
      checkoutPath: null,
      generation: null,
      reason: "preservation-unproven",
      recommendedPromptText: "The recorded head moved.",
    });

    expect(formatErrandCloseResult(result, false)).toEqual({
      stream: "stderr",
      text: "The recorded head moved.",
      exitCode: 1,
    });
    expect(formatErrandCloseResult(result, true)).toEqual({
      stream: "stdout",
      text: `${JSON.stringify(result)}\n`,
      exitCode: 1,
    });
  });
});
