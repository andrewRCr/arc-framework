/**
 * Unit tests for cross-WU entry parsing and merge — list-union of
 * `WORKING-MEMORY` / `USER-INBOX` entries across the N most-recent
 * notes, with divergent bodies resolving to the most-recent note and
 * unknown-shape files falling back to whole-file most-recent-wins.
 */

import { describe, it, expect } from "vitest";

import {
  appendRemovalTombstones,
  mergeEntries,
  mergeCrossWuFile,
  parseCrossWuEntries,
  type CrossWuEntry,
} from "../../src/lib/user-sync/index.js";

const wmEntry = (key: string, raw: string): CrossWuEntry => ({ section: "Memories", key, raw });

describe("mergeEntries", () => {
  it("unions disjoint entries from two notes", () => {
    const recent = [wmEntry("**A:**", "**A:**\nbody a")];
    const older = [wmEntry("**B:**", "**B:**\nbody b")];

    const merged = mergeEntries([recent, older]);

    expect(merged.map((e) => e.key)).toEqual(["**A:**", "**B:**"]);
  });

  it("dedupes an entry present identically in both notes", () => {
    const raw = "**A:**\n_Remove when: x._\n\nBody.";
    const merged = mergeEntries([[wmEntry("**A:**", raw)], [wmEntry("**A:**", raw)]]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.raw).toBe(raw);
  });

  it("keeps the most-recent note's body when the same entry diverges", () => {
    const recent = [wmEntry("**A:**", "**A:**\nrecent body")];
    const older = [wmEntry("**A:**", "**A:**\nstale body")];

    const merged = mergeEntries([recent, older]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.raw).toContain("recent body");
    expect(merged[0]?.raw).not.toContain("stale body");
  });

  it("scopes identity by section so the same key survives in different sections", () => {
    const recent: CrossWuEntry[] = [{ section: "Atomic", key: "X", raw: "- **X** — recent atomic" }];
    const older: CrossWuEntry[] = [
      { section: "Backlog", key: "X", raw: "- **X** — backlog" },
      { section: "Atomic", key: "X", raw: "- **X** — stale atomic" },
    ];

    const merged = mergeEntries([recent, older]);

    expect(merged).toHaveLength(2);
    expect(merged.find((e) => e.section === "Atomic")?.raw).toContain("recent atomic");
    expect(merged.find((e) => e.section === "Backlog")?.raw).toContain("backlog");
  });
});

describe("parseCrossWuEntries — WORKING-MEMORY", () => {
  const content = `# Working Memory

## Memories

**Header A:**
_Remove when: trigger a._

Body line a.

**Header B:**
_Remove when: trigger b._

Body line b.

---
`;

  it("parses each bold-field entry under Memories", () => {
    const parsed = parseCrossWuEntries(content, "working-memory");
    const keys = parsed.flatMap((p) => (p.ok ? [p.entry.key] : []));

    expect(keys).toEqual(["**Header A:**", "**Header B:**"]);
  });

  it("surfaces an entry missing its removal trigger as a failure", () => {
    const malformed = `## Memories

**Header A:**
Body with no remove-when line.
`;
    const parsed = parseCrossWuEntries(malformed, "working-memory");

    expect(parsed).toHaveLength(1);
    const [first] = parsed;
    expect(first?.ok).toBe(false);
    if (first && !first.ok) expect(first.reason).toContain("Remove when");
  });

  it("ignores commented-out shape examples", () => {
    const withComment = `## Memories

<!--
Entry shape:

**Short header naming the constraint or tradeoff:**
*Remove when: [explicit trigger condition].*
-->

**Real constraint:**
_Remove when: the work lands._

Body.
`;
    const parsed = parseCrossWuEntries(withComment, "working-memory");
    const ok = parsed.flatMap((p) => (p.ok ? [p.entry.key] : []));

    expect(parsed.filter((p) => !p.ok)).toHaveLength(0);
    expect(ok).toEqual(["**Real constraint:**"]);
  });

  it("accepts an italic-asterisk removal trigger", () => {
    const asterisk = `## Memories

**Constraint:**
*Remove when: the work lands.*

Body.
`;
    const parsed = parseCrossWuEntries(asterisk, "working-memory");

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.ok).toBe(true);
  });
});

describe("parseCrossWuEntries — USER-INBOX", () => {
  const content = `# User Inbox

## Atomic

<!-- ### \`[ ]\` **commented-shape** — shape example, not a real entry -->

### \`[ ]\` **Lead A**

- atomic text
    - nested detail line

### no bold title here

- malformed atomic entry

## Backlog

### \`[ ]\` **Lead B**

- backlog text
- WU_Target: some-wu (provisional)

---
`;

  it("parses each entry keyed by the H3 bold title, scoped to its section", () => {
    const parsed = parseCrossWuEntries(content, "user-inbox");
    const ok = parsed.flatMap((p) => (p.ok ? [p.entry] : []));

    expect(ok.map((e) => `${e.section}:${e.key}`)).toEqual(["Atomic:Lead A", "Backlog:Lead B"]);
    expect(ok[0]?.raw).toContain("nested detail line");
  });

  it("preserves a Backlog entry's WU_Target line verbatim in raw", () => {
    const backlog = parseCrossWuEntries(content, "user-inbox").flatMap((p) =>
      p.ok && p.entry.section === "Backlog" ? [p.entry] : [],
    );

    expect(backlog[0]?.raw).toContain("WU_Target: some-wu (provisional)");
  });

  it("surfaces an H3 entry with no bold title as a failure", () => {
    const failures = parseCrossWuEntries(content, "user-inbox").filter((p) => !p.ok);

    expect(failures).toHaveLength(1);
  });

  it("ignores the commented-out shape example so a seeded template parses as empty", () => {
    const keys = parseCrossWuEntries(content, "user-inbox").flatMap((p) => (p.ok ? [p.entry.key] : []));

    expect(keys).not.toContain("commented-shape");
  });
});

describe("mergeCrossWuFile", () => {
  it("returns the most-recent note verbatim for an unknown-shape file", () => {
    const result = mergeCrossWuFile("SOME-FUTURE-FILE.md", [{ content: "recent" }, { content: "older" }]);

    expect(result.content).toBe("recent");
    expect(result.malformed).toEqual([]);
  });

  it("folds an older note's WORKING-MEMORY entry into the merged content within Memories", () => {
    const recent = `## Memories

**Recent constraint:**
_Remove when: x._

Recent body.

---
`;
    const older = `## Memories

**Older constraint:**
_Remove when: y._

Older body.

---
`;
    const result = mergeCrossWuFile("WORKING-MEMORY.md", [{ content: recent }, { content: older }]);

    expect(result.content).toContain("**Recent constraint:**");
    expect(result.content).toContain("**Older constraint:**");
    expect(result.content.indexOf("**Older constraint:**")).toBeLessThan(result.content.indexOf("\n---"));
  });

  it("folds older USER-INBOX items into their own section, keeping boundaries", () => {
    const recent = `## Atomic

### \`[ ]\` **atomic recent**

- recent atomic item

## Backlog

### \`[ ]\` **backlog recent**

- recent backlog item

---
`;
    const older = `## Atomic

### \`[ ]\` **atomic older**

- older atomic item

## Backlog

### \`[ ]\` **backlog older**

- older backlog item

---
`;
    const result = mergeCrossWuFile("USER-INBOX.md", [{ content: recent }, { content: older }]);

    const atomicStart = result.content.indexOf("## Atomic");
    const backlogStart = result.content.indexOf("## Backlog");
    const atomicOlder = result.content.indexOf("**atomic older**");
    const backlogOlder = result.content.indexOf("**backlog older**");

    expect(atomicOlder).toBeGreaterThan(atomicStart);
    expect(atomicOlder).toBeLessThan(backlogStart);
    expect(backlogOlder).toBeGreaterThan(backlogStart);
  });

  it("surfaces malformed entries instead of dropping them", () => {
    const recent = `## Memories

**Good:**
_Remove when: x._

Body.

**Bad:**
No remove-when trigger here.

---
`;
    const result = mergeCrossWuFile("WORKING-MEMORY.md", [{ content: recent }]);

    expect(result.malformed).toHaveLength(1);
    expect(result.malformed[0]).toContain("Remove when");
  });
});

describe("appendRemovalTombstones", () => {
  const NOW = "2026-05-25T12:00:00.000Z";

  /** A WORKING-MEMORY file whose `## Memories` section holds the given entry blocks. */
  const wmFile = (...entries: string[]): string =>
    `# Working Memory\n\n## Memories\n\n${entries.join("\n\n")}\n\n---\n`;
  const wmEntry = (header: string): string => `**${header}:**\n_Remove when: x._\n\nBody.`;

  it("writes a timestamped Removed marker when a prior entry is absent now", () => {
    const prior = wmFile(wmEntry("Kept"), wmEntry("Dropped"));
    const current = wmFile(wmEntry("Kept"));

    const result = appendRemovalTombstones("WORKING-MEMORY.md", current, [{ content: prior }], NOW);

    expect(result).toContain("## Removed: **Dropped:**");
    expect(result).toContain(NOW);
    expect(result).not.toContain("## Removed: **Kept:**");
  });

  it("writes no tombstone for an entry that was never in the prior state", () => {
    const prior = wmFile(wmEntry("Kept"));
    const current = wmFile(wmEntry("Kept"), wmEntry("NewlyAdded"));

    const result = appendRemovalTombstones("WORKING-MEMORY.md", current, [{ content: prior }], NOW);

    expect(result).not.toContain("## Removed:");
  });

  it("writes no tombstone when every prior entry is still present", () => {
    const file = wmFile(wmEntry("Kept"));

    const result = appendRemovalTombstones("WORKING-MEMORY.md", file, [{ content: file }], NOW);

    expect(result).not.toContain("## Removed:");
  });

  it("synthesizes no tombstones when there is no prior merged state", () => {
    const current = wmFile(wmEntry("Kept"));

    const result = appendRemovalTombstones("WORKING-MEMORY.md", current, [], NOW);

    expect(result).toBe(current);
  });

  it("keys the tombstone to (section, key) so a removal spares the same title elsewhere", () => {
    const uiFile = (atomic: string, backlog: string): string =>
      `# User Inbox\n\n## Atomic\n\n${atomic}\n\n## Backlog\n\n${backlog}\n\n---\n`;
    const prior = uiFile("### `[ ]` **Shared**\n\n- atomic body", "### `[ ]` **Shared**\n\n- backlog body");
    const current = uiFile("### `[ ]` **Shared**\n\n- atomic body", "");

    const result = appendRemovalTombstones("USER-INBOX.md", current, [{ content: prior }], NOW);

    expect(result).toContain("## Removed: Shared");
    expect(result).toContain("_Section:_ Backlog");
    expect(result).not.toContain("_Section:_ Atomic");
  });

  it("leaves an unknown-shape file unchanged", () => {
    const current = "# Future file\n\narbitrary content\n";

    const result = appendRemovalTombstones("SOME-FUTURE-FILE.md", current, [{ content: "anything" }], NOW);

    expect(result).toBe(current);
  });
});

describe("mergeCrossWuFile — tombstones", () => {
  const NOW = "2026-05-25T12:00:00.000Z";
  /** N days before NOW, as an ISO timestamp. */
  const daysAgo = (n: number): string => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();

  const wmEntry = (header: string): string => `**${header}:**\n_Remove when: x._\n\n${header} body.`;
  const wmTomb = (header: string, removedAt: string): string =>
    `## Removed: **${header}:**\n\n- _Section:_ Memories\n- _Removed:_ ${removedAt}`;
  /** A WORKING-MEMORY note: a `## Memories` block plus optional trailing tombstones. */
  const note = (entries: string, tombstones: string[] = []): string => {
    const head = `# Working Memory\n\n## Memories\n\n${entries}\n\n---\n`;
    return tombstones.length > 0 ? `${head}\n${tombstones.join("\n\n")}\n` : head;
  };

  it("suppresses an earlier note's entry when a more-recent note tombstones it", () => {
    const recent = note("", [wmTomb("Dropped", daysAgo(1))]);
    const older = note(wmEntry("Dropped"));

    const result = mergeCrossWuFile("WORKING-MEMORY.md", [{ content: recent }, { content: older }], NOW);

    expect(result.content).not.toContain("Dropped body.");
    expect(result.content).toContain("## Removed: **Dropped:**");
  });

  it("lets a more-recent re-add win over an earlier tombstone", () => {
    const recent = note(wmEntry("Readded"));
    const older = note("", [wmTomb("Readded", daysAgo(5))]);

    const result = mergeCrossWuFile("WORKING-MEMORY.md", [{ content: recent }, { content: older }], NOW);

    expect(result.content).toContain("Readded body.");
    expect(result.content).not.toContain("## Removed:");
  });

  it("drops a TTL-expired tombstone, letting the entry propagate again", () => {
    const recent = note("", [wmTomb("Old", daysAgo(200))]);
    const older = note(wmEntry("Old"));

    const result = mergeCrossWuFile("WORKING-MEMORY.md", [{ content: recent }, { content: older }], NOW);

    expect(result.content).toContain("Old body.");
    expect(result.content).not.toContain("## Removed:");
  });

  it("drops a tombstone past the short TTL that an older, longer window would have kept", () => {
    const recent = note("", [wmTomb("Aged", daysAgo(10))]);
    const older = note(wmEntry("Aged"));

    const result = mergeCrossWuFile("WORKING-MEMORY.md", [{ content: recent }, { content: older }], NOW);

    expect(result.content).toContain("Aged body.");
    expect(result.content).not.toContain("## Removed:");
  });

  it("surfaces a malformed Removed marker instead of dropping it", () => {
    const broken = `# Working Memory\n\n## Memories\n\n${wmEntry("Kept")}\n\n---\n\n## Removed: **Broken:**\n\nno fields here\n`;

    const result = mergeCrossWuFile("WORKING-MEMORY.md", [{ content: broken }], NOW);

    expect(result.malformed.some((reason) => reason.includes("Removed"))).toBe(true);
  });
});

describe("mergeCrossWuFile — byte-identical materialization", () => {
  const NOW = "2026-05-25T12:00:00.000Z";
  const daysAgo = (n: number): string => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();

  const wmEntry = (header: string): string => `**${header}:**\n_Remove when: x._\n\n${header} body.`;
  const wmTomb = (header: string, removedAt: string): string =>
    `## Removed: **${header}:**\n\n- _Section:_ Memories\n- _Removed:_ ${removedAt}`;
  const note = (entries: string, tombstones: string[] = []): string => {
    const head = `# Working Memory\n\n## Memories\n\n${entries}\n\n---\n`;
    return tombstones.length > 0 ? `${head}\n${tombstones.join("\n\n")}\n` : head;
  };

  it("folds an older WORKING-MEMORY entry into the recent note's section", () => {
    const recent = note(wmEntry("Recent"));
    const older = note(wmEntry("Older"));

    const result = mergeCrossWuFile("WORKING-MEMORY.md", [{ content: recent }, { content: older }], NOW);

    expect(result.content).toMatchInlineSnapshot(`
      "# Working Memory

      ## Memories

      **Recent:**
      _Remove when: x._

      Recent body.

      **Older:**
      _Remove when: x._

      Older body.

      ---
      "
    `);
  });

  it("folds older USER-INBOX items into their owning sections", () => {
    const recent = `## Atomic\n\n### \`[ ]\` **atomic recent**\n\n- recent atomic item\n\n## Backlog\n\n### \`[ ]\` **backlog recent**\n\n- recent backlog item\n\n---\n`;
    const older = `## Atomic\n\n### \`[ ]\` **atomic older**\n\n- older atomic item\n\n## Backlog\n\n### \`[ ]\` **backlog older**\n\n- older backlog item\n\n---\n`;

    const result = mergeCrossWuFile("USER-INBOX.md", [{ content: recent }, { content: older }], NOW);

    expect(result.content).toMatchInlineSnapshot(`
      "## Atomic

      ### \`[ ]\` **atomic recent**

      - recent atomic item

      ### \`[ ]\` **atomic older**

      - older atomic item

      ## Backlog

      ### \`[ ]\` **backlog recent**

      - recent backlog item

      ### \`[ ]\` **backlog older**

      - older backlog item

      ---
      "
    `);
  });

  it("suppresses a tombstoned entry and carries the winning tombstone forward", () => {
    const recent = note("", [wmTomb("Dropped", daysAgo(1))]);
    const older = note(wmEntry("Dropped"));

    const result = mergeCrossWuFile("WORKING-MEMORY.md", [{ content: recent }, { content: older }], NOW);

    expect(result.content).toMatchInlineSnapshot(`
      "# Working Memory

      ## Memories

      ---

      ## Removed: **Dropped:**

      - _Section:_ Memories
      - _Removed:_ 2026-05-24T12:00:00.000Z
      "
    `);
  });

  it("lets a TTL-expired tombstone drop so the entry propagates again", () => {
    const recent = note("", [wmTomb("Old", daysAgo(200))]);
    const older = note(wmEntry("Old"));

    const result = mergeCrossWuFile("WORKING-MEMORY.md", [{ content: recent }, { content: older }], NOW);

    expect(result.content).toMatchInlineSnapshot(`
      "# Working Memory

      ## Memories

      **Old:**
      _Remove when: x._

      Old body.

      ---
      "
    `);
  });
});

