/**
 * Unit tests for the inbox reminder-flag extractor — surfacing `_Remind:_`-
 * flagged `## Atomic` USER-INBOX entries (with their `_Created:_` aging date)
 * so the staleness sweep can nudge the developer about them.
 */

import { describe, it, expect } from "vitest";

import { extractReminderEntries } from "../../../src/lib/session-init/inbox-reminders.js";

/** Build a `## Atomic` H3 entry block from descriptor bullets. */
const atomic = (title: string, ...bullets: string[]): string =>
  ["### `[ ]` **" + title + "**", "", ...bullets.map((b) => "- " + b), ""].join("\n");

const inbox = (...sections: { heading: string; body: string[] }[]): string =>
  ["# User Inbox", "", ...sections.flatMap((s) => [`## ${s.heading}`, "", ...s.body])].join("\n");

describe("extractReminderEntries", () => {
  it("extracts a flagged Atomic entry with its key and created date", () => {
    const content = inbox({
      heading: "Atomic",
      body: [atomic("fix the thing", "_Remind:_ `true`", "_Created:_ `2026-05-30`")],
    });

    expect(extractReminderEntries({ content }).entries).toEqual([
      { key: "fix the thing", created: "2026-05-30" },
    ]);
  });

  it("ignores an Atomic entry with no reminder flag (absence reads as false)", () => {
    const content = inbox({
      heading: "Atomic",
      body: [atomic("unflagged", "_Observation:_ just a note", "_Created:_ `2026-05-30`")],
    });

    expect(extractReminderEntries({ content }).entries).toEqual([]);
  });

  it("ignores an explicit `false` reminder value", () => {
    const content = inbox({
      heading: "Atomic",
      body: [atomic("opted out", "_Remind:_ `false`", "_Created:_ `2026-05-30`")],
    });

    expect(extractReminderEntries({ content }).entries).toEqual([]);
  });

  it("requires the value to be backtick-delimited — a bare `true` is prose, not the flag", () => {
    const content = inbox({
      heading: "Atomic",
      body: [atomic("bare value", "_Remind:_ true", "_Created:_ `2026-05-30`")],
    });

    expect(extractReminderEntries({ content }).entries).toEqual([]);
  });

  it("does not extract reminders from the Backlog section (Atomic-only)", () => {
    const content = inbox({
      heading: "Backlog",
      body: [atomic("backlog flagged", "_Remind:_ `true`", "_Created:_ `2026-05-30`")],
    });

    expect(extractReminderEntries({ content }).entries).toEqual([]);
  });

  it("emits a flagged entry with no created date as an empty date (the sweep skips aging it)", () => {
    const content = inbox({
      heading: "Atomic",
      body: [atomic("flagged but undated", "_Remind:_ `true`")],
    });

    expect(extractReminderEntries({ content }).entries).toEqual([{ key: "flagged but undated", created: "" }]);
  });

  it("surfaces a held entry (`_Hold:_ `true``) so a retained capture cannot rot", () => {
    const content = inbox({
      heading: "Atomic",
      body: [atomic("retained thing", "_Hold:_ `true`", "_Created:_ `2026-06-01`")],
    });

    expect(extractReminderEntries({ content }).entries).toEqual([
      { key: "retained thing", created: "2026-06-01" },
    ]);
  });

  it("returns no entries for empty content", () => {
    expect(extractReminderEntries({ content: "" }).entries).toEqual([]);
  });
});
