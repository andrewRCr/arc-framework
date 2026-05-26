/**
 * Unit tests for cross-WU entry parsing and merge — list-union of
 * `WORKING-MEMORY` / `USER-INBOX` entries across the N most-recent notes, with
 * divergent bodies resolving to the most-recent note and unknown-shape files
 * falling back to whole-file most-recent-wins.
 */

import { describe, it, expect } from "vitest";

import {
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

  it("scopes identity by section so the same lead-in survives in different sections", () => {
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

<!-- guidance comment -->

- **Lead A** — atomic text
    - nested detail line
- plain item with no bold lead-in

## Backlog

- **Lead B** — backlog text

---
`;

  it("parses list items scoped to their section, keeping multi-line bodies", () => {
    const parsed = parseCrossWuEntries(content, "user-inbox");
    const ok = parsed.flatMap((p) => (p.ok ? [p.entry] : []));

    expect(ok.map((e) => `${e.section}:${e.key}`)).toEqual(["Atomic:Lead A", "Backlog:Lead B"]);
    expect(ok[0]?.raw).toContain("nested detail line");
  });

  it("surfaces a list item with no bold lead-in as a failure", () => {
    const failures = parseCrossWuEntries(content, "user-inbox").filter((p) => !p.ok);

    expect(failures).toHaveLength(1);
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

- **atomic recent** — recent atomic item

## Backlog

- **backlog recent** — recent backlog item

---
`;
    const older = `## Atomic

- **atomic older** — older atomic item

## Backlog

- **backlog older** — older backlog item

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
