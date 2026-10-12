/** USER-INBOX captures selected by the work unit their `WU_Target` line names. */

import { describe, expect, it } from "vitest";

import { listInboxEntriesNamingTarget } from "../../../src/lib/user-sync/inbox-target.js";

const entry = (title: string, ...bullets: string[]): string =>
  ["### `[ ]` **" + title + "**", "", ...bullets, ""].join("\n");

const inbox = (errand: string[], workUnit: string[]): string =>
  ["# User Inbox", "", "## Errand", "", ...errand, "## Work Unit", "", ...workUnit].join("\n");

describe("listInboxEntriesNamingTarget", () => {
  it("selects every target line form in file order", () => {
    const content = inbox([], [
      entry("Backticked line", "- `WU_Target: seam-lifecycle`", "- _Observation:_ one."),
      entry("Managed field", "- _WU_Target:_ `seam-lifecycle`"),
      entry("Bare line", "- WU_Target: seam-lifecycle"),
    ]);

    expect(listInboxEntriesNamingTarget(content, "seam-lifecycle")).toEqual({
      entries: [
        { title: "Backticked line", section: "Work Unit", held: false },
        { title: "Managed field", section: "Work Unit", held: false },
        { title: "Bare line", section: "Work Unit", held: false },
      ],
      diagnostics: [],
    });
  });

  it("reads a planned or provisional commitment suffix as the same target", () => {
    const content = inbox([], [
      entry("Planned hint", "- `WU_Target: seam-lifecycle (planned)`"),
      entry("Provisional hint", "- WU_Target: seam-lifecycle (provisional)"),
    ]);

    expect(listInboxEntriesNamingTarget(content, "seam-lifecycle").entries.map((found) => found.title))
      .toEqual(["Planned hint", "Provisional hint"]);
  });

  it("reports whether each selected capture is held", () => {
    const content = inbox([], [
      entry("Held for adoption", "- _Hold:_ `true`", "- _Created:_ `2026-10-11`", "", "- `WU_Target: seam-lifecycle`"),
      entry("Released hold", "- _Hold:_ `false`", "- `WU_Target: seam-lifecycle`"),
    ]);

    expect(listInboxEntriesNamingTarget(content, "seam-lifecycle").entries).toEqual([
      { title: "Held for adoption", section: "Work Unit", held: true },
      { title: "Released hold", section: "Work Unit", held: false },
    ]);
  });

  it("selects a capture in the Errand section when it carries a target line", () => {
    const content = inbox([entry("Misfiled capture", "- WU_Target: seam-lifecycle")], []);

    expect(listInboxEntriesNamingTarget(content, "seam-lifecycle").entries).toEqual([
      { title: "Misfiled capture", section: "Errand", held: false },
    ]);
  });

  it("skips other targets, undecided targets, slug prefixes, and prose mentions", () => {
    const content = inbox([], [
      entry("Other target", "- `WU_Target: seam-locus`"),
      entry("Undecided", "- WU_Target: TBD"),
      entry("Longer slug", "- `WU_Target: seam-lifecycle-followup`"),
      entry(
        "Prose mention",
        "- _Routed from:_ the inbox (`WU_Target: seam-lifecycle`), housekeep drain.",
        "  - `WU_Target: seam-lifecycle`",
      ),
    ]);

    expect(listInboxEntriesNamingTarget(content, "seam-lifecycle")).toEqual({ entries: [], diagnostics: [] });
    expect(listInboxEntriesNamingTarget(content, "seam").entries).toEqual([]);
  });

  it("ignores commented shape examples", () => {
    const content = inbox([], ["<!--", entry("Example", "- `WU_Target: seam-lifecycle`"), "-->", ""]);

    expect(listInboxEntriesNamingTarget(content, "seam-lifecycle")).toEqual({ entries: [], diagnostics: [] });
  });

  it("reports an entry it cannot read, since that entry may name the target", () => {
    const content = inbox([], [
      "### `[ ]` missing bold title",
      "",
      "- `WU_Target: seam-lifecycle`",
      "",
      entry("Readable", "- `WU_Target: seam-lifecycle`"),
    ]);

    const listing = listInboxEntriesNamingTarget(content, "seam-lifecycle");

    expect(listing.entries).toEqual([{ title: "Readable", section: "Work Unit", held: false }]);
    expect(listing.diagnostics).toEqual([
      "USER-INBOX Work Unit entry missing bold title: ### `[ ]` missing bold title",
      "A line naming seam-lifecycle sits outside any readable inbox entry: - `WU_Target: seam-lifecycle`",
    ]);
  });

  it("reports a target line in a repeated section, then lists the capture once the sections merge", () => {
    const first = entry("First section", "- WU_Target: other");
    const misplaced = entry("Second section", "- WU_Target: seam-lifecycle");
    const duplicated = [inbox([], [first]), "## Work Unit", "", misplaced].join("\n");

    expect(listInboxEntriesNamingTarget(duplicated, "seam-lifecycle")).toEqual({
      entries: [],
      diagnostics: ["A line naming seam-lifecycle sits outside any readable inbox entry: - WU_Target: seam-lifecycle"],
    });
    expect(listInboxEntriesNamingTarget(inbox([], [first, misplaced]), "seam-lifecycle")).toEqual({
      entries: [{ title: "Second section", section: "Work Unit", held: false }],
      diagnostics: [],
    });
  });

  it("reports a target line past a rule that ends its section, then lists it once the rule is gone", () => {
    const before = entry("Before the rule", "- `WU_Target: seam-lifecycle`");
    const after = entry("After the rule", "- `WU_Target: seam-lifecycle`");

    expect(listInboxEntriesNamingTarget(inbox([], [before, "---", "", after]), "seam-lifecycle")).toEqual({
      entries: [{ title: "Before the rule", section: "Work Unit", held: false }],
      diagnostics: ["A line naming seam-lifecycle sits outside any readable inbox entry: - `WU_Target: seam-lifecycle`"],
    });
    expect(listInboxEntriesNamingTarget(inbox([], [before, after]), "seam-lifecycle").entries).toEqual([
      { title: "Before the rule", section: "Work Unit", held: false },
      { title: "After the rule", section: "Work Unit", held: false },
    ]);
  });

  it("reads removal tombstones after the sections as no target", () => {
    const content = [
      inbox([], [entry("Live", "- WU_Target: seam-lifecycle")]),
      "## Removed: Retired capture",
      "",
      "- _Section:_ Work Unit",
      "- _Removed:_ 2026-10-01T00:33:26.897Z",
      "",
    ].join("\n");

    expect(listInboxEntriesNamingTarget(content, "seam-lifecycle")).toEqual({
      entries: [{ title: "Live", section: "Work Unit", held: false }],
      diagnostics: [],
    });
  });
});
