/**
 * Unit tests for the targeted `USER-INBOX` entry remover — the write-side
 * complement to errand completion. Removal is title-keyed, idempotent (a no-op
 * when the entry is absent), and targeted (a single entry excised, sibling
 * entries and the rest of the file byte-stable — never a parse-and-re-render).
 * The writer mirrors the parser's view of an entry: an H3 managed-entry block
 * within `## Errand` / `## Work Unit`, where the section runs to the next `## `
 * heading or `---` rule.
 */

import { describe, it, expect } from "vitest";

import {
  inboxEntrySourceDigest,
  listInboxEntryTitles,
  mutateInboxEntries,
  removeInboxEntry,
  requireLiveInboxTitle,
} from "../../src/lib/user-sync/index.js";

/** A realistic inbox: two `## Errand` entries, one `## Work Unit` entry, a trailing tombstone. */
const INBOX = `# User Inbox

> _Personal capture surface for items to handle later._

## Errand

> _Single-step captures._

### \`[ ]\` **First atomic**

- _Observation:_ first.

### \`[ ]\` **Second atomic**

- _Observation:_ second.

## Work Unit

> _Multi-step captures._

### \`[ ]\` **A backlog item**

- WU_Target: foo

- _Observation:_ backlog body.

---

## Removed: An old thing

- _Section:_ Atomic
- _Removed:_ 2026-06-01T00:00:00.000Z
`;

describe("mutateInboxEntries", () => {
  it("marks an exact batch with one visible dispatch generation", () => {
    const firstDigest = inboxEntrySourceDigest(INBOX, "First atomic");
    const secondDigest = inboxEntrySourceDigest(INBOX, "Second atomic");

    const result = mutateInboxEntries(INBOX, [
      { kind: "mark", title: "First atomic", sourceDigest: firstDigest, dispatchId: "dispatch-7" },
      { kind: "mark", title: "Second atomic", sourceDigest: secondDigest, dispatchId: "dispatch-7" },
    ]);

    expect(result.changed).toBe(true);
    expect(result.outcomes).toEqual([
      { title: "First atomic", state: "applied" },
      { title: "Second atomic", state: "applied" },
    ]);
    expect(result.content.match(/- _Disposition:_ `execute-bound`/g)).toHaveLength(2);
    expect(result.content.match(/- _Dispatch:_ `dispatch-7`/g)).toHaveLength(2);
    expect(result.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("replays an exact mark, unmark, and removal without widening the write", () => {
    const sourceDigest = inboxEntrySourceDigest(INBOX, "First atomic");
    const marked = mutateInboxEntries(INBOX, [
      { kind: "mark", title: "First atomic", sourceDigest, dispatchId: "dispatch-7" },
    ]);
    const markReplay = mutateInboxEntries(marked.content, [
      { kind: "mark", title: "First atomic", sourceDigest, dispatchId: "dispatch-7" },
    ]);
    expect(markReplay).toMatchObject({ changed: false, content: marked.content });
    expect(markReplay.outcomes).toEqual([{ title: "First atomic", state: "already-applied" }]);

    const unmarked = mutateInboxEntries(marked.content, [
      { kind: "unmark", title: "First atomic", sourceDigest, dispatchId: "dispatch-7" },
    ]);
    expect(unmarked.content).toBe(INBOX);
    expect(mutateInboxEntries(unmarked.content, [
      { kind: "unmark", title: "First atomic", sourceDigest, dispatchId: "dispatch-7" },
    ])).toMatchObject({ changed: false, content: INBOX });

    const removed = mutateInboxEntries(marked.content, [
      { kind: "remove", title: "First atomic", sourceDigest },
    ]);
    expect(removed.content).not.toContain("First atomic");
    expect(mutateInboxEntries(removed.content, [
      { kind: "remove", title: "First atomic", sourceDigest },
    ])).toMatchObject({ changed: false, content: removed.content });
  });

  it("rejects changed, missing, duplicate, and malformed entry preimages", () => {
    const sourceDigest = inboxEntrySourceDigest(INBOX, "First atomic");
    expect(() => mutateInboxEntries(INBOX.replace("first.", "changed."), [
      { kind: "mark", title: "First atomic", sourceDigest, dispatchId: "dispatch-7" },
    ])).toThrow(/source digest changed/);
    expect(() => mutateInboxEntries(INBOX, [
      { kind: "mark", title: "Missing", sourceDigest, dispatchId: "dispatch-7" },
    ])).toThrow(/Missing USER-INBOX entry/);

    const duplicate = INBOX.replace(
      "## Work Unit",
      "### `[ ]` **First atomic**\n\n- _Observation:_ duplicate.\n\n## Work Unit",
    );
    expect(() => mutateInboxEntries(duplicate, [
      { kind: "mark", title: "First atomic", sourceDigest, dispatchId: "dispatch-7" },
    ])).toThrow(/Duplicate USER-INBOX entry title/);

    const malformed = INBOX.replace("### `[ ]` **First atomic**", "### `[ ]` First atomic");
    expect(() => mutateInboxEntries(malformed, [
      { kind: "mark", title: "Second atomic", sourceDigest: inboxEntrySourceDigest(INBOX, "Second atomic"), dispatchId: "dispatch-7" },
    ])).toThrow(/Malformed USER-INBOX entry heading/);
  });

  it("preserves unrelated bytes and rejects partial or cross-generation dispatch fields", () => {
    const sourceDigest = inboxEntrySourceDigest(INBOX, "First atomic");
    const marked = mutateInboxEntries(INBOX, [
      { kind: "mark", title: "First atomic", sourceDigest, dispatchId: "dispatch-7" },
    ]);
    expect(marked.content.replace(
      "\n\n- _Disposition:_ `execute-bound`\n- _Dispatch:_ `dispatch-7`",
      "",
    )).toBe(INBOX);
    expect(() => mutateInboxEntries(marked.content, [
      { kind: "unmark", title: "First atomic", sourceDigest, dispatchId: "dispatch-8" },
    ])).toThrow(/bound to another dispatch/);

    const partial = INBOX.replace(
      "### `[ ]` **First atomic**",
      "### `[ ]` **First atomic**\n\n- _Disposition:_ `execute-bound`",
    );
    expect(() => mutateInboxEntries(partial, [
      { kind: "remove", title: "First atomic", sourceDigest },
    ])).toThrow(/Malformed USER-INBOX dispatch fields/);
  });
});

describe("removeInboxEntry", () => {
  it("removes the title-matched entry and leaves siblings byte-stable", () => {
    const result = removeInboxEntry(INBOX, "Second atomic");

    expect(result.removed).toBe(true);
    expect(result.content).toBe(`# User Inbox

> _Personal capture surface for items to handle later._

## Errand

> _Single-step captures._

### \`[ ]\` **First atomic**

- _Observation:_ first.

## Work Unit

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
    expect(result.content).toContain(`## Errand

> _Single-step captures._

### \`[ ]\` **Second atomic**
`);
    expect(result.content).not.toContain("First atomic");
  });

  it("removes the only entry in a section, preserving the section heading and trailing rule", () => {
    const result = removeInboxEntry(INBOX, "A backlog item");

    expect(result.removed).toBe(true);
    expect(result.content).toContain(`## Work Unit

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

    // The Work Unit entry and the tombstone block survive verbatim.
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
    const content = `## Errand

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
    const content = `## Work Unit

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

describe("listInboxEntryTitles", () => {
  it("collects titles from both ## Errand and ## Work Unit in document order", () => {
    expect(listInboxEntryTitles(INBOX)).toEqual([
      "First atomic",
      "Second atomic",
      "A backlog item",
    ]);
  });

  it("stops collection after a --- section boundary", () => {
    const content = `## Errand

### \`[ ]\` **Live**

- _Observation:_ keep.

---

### \`[ ]\` **Past boundary**

- _Observation:_ not managed.
`;
    expect(listInboxEntryTitles(content)).toEqual(["Live"]);
  });

  it("preserves duplicate titles in returned order", () => {
    const content = `## Errand

### \`[ ]\` **Same title**

- _Observation:_ one.

### \`[ ]\` **Same title**

- _Observation:_ two.
`;
    expect(listInboxEntryTitles(content)).toEqual(["Same title", "Same title"]);
  });
});

describe("requireLiveInboxTitle", () => {
  it("returns the live title when present", () => {
    expect(requireLiveInboxTitle(INBOX, "First atomic")).toBe("First atomic");
    expect(requireLiveInboxTitle(INBOX, "  Second atomic  ")).toBe("Second atomic");
  });

  it("throws when no live capture matches", () => {
    expect(() => requireLiveInboxTitle(INBOX, "Missing capture")).toThrow(
      /No live USER-INBOX capture titled 'Missing capture'/,
    );
  });
});
