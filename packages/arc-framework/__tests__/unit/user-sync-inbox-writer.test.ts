/**
 * Unit tests for the targeted `USER-INBOX` entry remover — the write-side
 * complement to errand completion. Removal is title-keyed, idempotent (a no-op
 * when the entry is absent), and targeted (a single entry excised, sibling
 * entries and the rest of the file byte-stable — never a parse-and-re-render).
 * The writer mirrors the parser's view of an entry: an H3 managed-entry block
 * within `## Atomic` / `## Backlog`, where the section runs to the next `## `
 * heading or `---` rule.
 */

import { describe, it, expect } from "vitest";

import { removeInboxEntry } from "../../src/lib/user-sync/index.js";

/** A realistic inbox: two `## Atomic` entries, one `## Backlog` entry, a trailing tombstone. */
const INBOX = `# User Inbox

> _Personal capture surface for items to handle later._

## Atomic

> _Single-step captures._

### \`[ ]\` **First atomic**

- _Observation:_ first.

### \`[ ]\` **Second atomic**

- _Observation:_ second.

## Backlog

> _Multi-step captures._

### \`[ ]\` **A backlog item**

- WU_Target: foo

- _Observation:_ backlog body.

---

## Removed: An old thing

- _Section:_ Atomic
- _Removed:_ 2026-06-01T00:00:00.000Z
`;

describe("removeInboxEntry", () => {
  it("removes the title-matched entry and leaves siblings byte-stable", () => {
    const result = removeInboxEntry(INBOX, "Second atomic");

    expect(result.removed).toBe(true);
    expect(result.content).toBe(`# User Inbox

> _Personal capture surface for items to handle later._

## Atomic

> _Single-step captures._

### \`[ ]\` **First atomic**

- _Observation:_ first.

## Backlog

> _Multi-step captures._

### \`[ ]\` **A backlog item**

- WU_Target: foo

- _Observation:_ backlog body.

---

## Removed: An old thing

- _Section:_ Atomic
- _Removed:_ 2026-06-01T00:00:00.000Z
`);
  });

  it("removes the first entry in a section, preserving the section guidance", () => {
    const result = removeInboxEntry(INBOX, "First atomic");

    expect(result.removed).toBe(true);
    expect(result.content).toContain(`## Atomic

> _Single-step captures._

### \`[ ]\` **Second atomic**
`);
    expect(result.content).not.toContain("First atomic");
  });

  it("removes the only entry in a section, preserving the section heading and trailing rule", () => {
    const result = removeInboxEntry(INBOX, "A backlog item");

    expect(result.removed).toBe(true);
    expect(result.content).toContain(`## Backlog

> _Multi-step captures._

---
`);
    expect(result.content).not.toContain("A backlog item");
  });

  it("is an idempotent no-op when the title is absent", () => {
    const result = removeInboxEntry(INBOX, "No such entry");

    expect(result.removed).toBe(false);
    expect(result.content).toBe(INBOX);
  });

  it("leaves the rest of the file — other section, tombstones — untouched", () => {
    const result = removeInboxEntry(INBOX, "First atomic");

    // The Backlog entry and the tombstone block survive verbatim.
    expect(result.content).toContain(`### \`[ ]\` **A backlog item**

- WU_Target: foo

- _Observation:_ backlog body.`);
    expect(result.content).toContain(`## Removed: An old thing

- _Section:_ Atomic
- _Removed:_ 2026-06-01T00:00:00.000Z`);
  });

  it("matches the title insensitive to surrounding whitespace", () => {
    const result = removeInboxEntry(INBOX, "  Second atomic  ");

    expect(result.removed).toBe(true);
    expect(result.content).not.toContain("Second atomic");
  });

  it("matches a title carrying backticks and punctuation verbatim", () => {
    const content = `## Atomic

### \`[ ]\` **\`assess-spec-readiness\` — codify the check (draft/spec asymmetry)**

- _Observation:_ body.

### \`[ ]\` **Keeper**

- _Observation:_ keep me.
`;
    const result = removeInboxEntry(
      content,
      "`assess-spec-readiness` — codify the check (draft/spec asymmetry)",
    );

    expect(result.removed).toBe(true);
    expect(result.content).toContain("### `[ ]` **Keeper**");
    expect(result.content).not.toContain("assess-spec-readiness");
  });

  it("does not remove an H3 that falls outside an entry section (below a rule)", () => {
    // A non-canonical `---` between entries ends the section for the reader, so
    // the entry beneath it is out of view — the writer mirrors that and no-ops.
    const content = `## Backlog

### \`[ ]\` **In section**

- _Observation:_ visible.

---

### \`[ ]\` **Below the rule**

- _Observation:_ orphaned by the stray rule.
`;
    const result = removeInboxEntry(content, "Below the rule");

    expect(result.removed).toBe(false);
    expect(result.content).toBe(content);
  });
});
