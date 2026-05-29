/**
 * Unit tests for the errand-staleness sweep — flagging errand-queue entries
 * pending past the configured threshold for execute-or-demote.
 */

import { describe, it, expect } from "vitest";

import { runErrandStalenessSweep } from "../../../src/lib/session-init/errand-staleness-sweep.js";

const NOW = "2026-05-25T12:00:00.000Z";

const entry = (slug: string, created: string): string =>
  `### \`[ ]\` **${slug}**\n\n- _Goal:_ ${slug} goal\n- _Branch:_ \`chore/${slug}\`\n- _Created:_ ${created}`;
const queue = (entries: string[]): string =>
  `# Errand Queue\n\n## Queue\n\n${entries.join("\n\n")}\n\n---\n`;

describe("runErrandStalenessSweep", () => {
  it("does not flag an entry younger than the threshold", () => {
    const content = queue([entry("fresh", "2026-05-24")]); // 1 day before NOW
    const result = runErrandStalenessSweep({ content, thresholdDays: 3, now: NOW });

    expect(result.stale).toEqual([]);
  });

  it("flags an entry older than the threshold for execute-or-demote", () => {
    const content = queue([entry("stale-errand", "2026-05-18")]); // 7 days before NOW
    const result = runErrandStalenessSweep({ content, thresholdDays: 3, now: NOW });

    expect(result.stale).toEqual([{ slug: "stale-errand", created: "2026-05-18", ageDays: 7 }]);
  });

  it("honors the configured threshold rather than a fixed window", () => {
    const content = queue([entry("week-old", "2026-05-18")]); // 7 days before NOW

    expect(runErrandStalenessSweep({ content, thresholdDays: 10, now: NOW }).stale).toEqual([]);
    expect(runErrandStalenessSweep({ content, thresholdDays: 5, now: NOW }).stale).toHaveLength(1);
  });

  it("skips an entry with no parseable _Created:_ date (cannot be aged)", () => {
    const content = queue(["### `[ ]` **undated**\n\n- _Goal:_ no created line"]);
    const result = runErrandStalenessSweep({ content, thresholdDays: 3, now: NOW });

    expect(result.stale).toEqual([]);
  });

  it("returns no stale entries for an empty (freshly seeded) queue", () => {
    const content = "# Errand Queue\n\n## Queue\n\n<!-- shape comment only -->\n\n---\n";
    const result = runErrandStalenessSweep({ content, thresholdDays: 3, now: NOW });

    expect(result.stale).toEqual([]);
  });
});
