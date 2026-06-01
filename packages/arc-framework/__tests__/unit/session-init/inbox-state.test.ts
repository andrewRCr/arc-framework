/**
 * Unit tests for the inbox-state probe — counting routable (well-formed)
 * USER-INBOX entries and deriving the housekeep-needed flag, so session-init
 * offers housekeep from a machine-resolved signal rather than an agent re-scan.
 */

import { describe, it, expect } from "vitest";

import { runInboxState } from "../../../src/lib/session-init/inbox-state.js";

const atomicEntry = (title: string): string =>
  ["### `[ ]` **" + title + "**", "", "- _Created:_ `2026-05-30`", "- A routable atomic capture.", ""].join("\n");

const backlogEntry = (title: string): string =>
  ["### `[ ]` **" + title + "**", "", "- A routable backlog capture.", ""].join("\n");

describe("runInboxState", () => {
  it("counts well-formed entries across the Atomic and Backlog sections", () => {
    const content = [
      "# User Inbox",
      "",
      "## Atomic",
      "",
      atomicEntry("first atomic"),
      atomicEntry("second atomic"),
      "## Backlog",
      "",
      backlogEntry("a backlog item"),
    ].join("\n");

    expect(runInboxState({ content }).routableCount).toBe(3);
  });

  it("sets housekeepNeeded when at least one entry is routable", () => {
    const content = ["## Atomic", "", atomicEntry("only entry"), "## Backlog", ""].join("\n");

    expect(runInboxState({ content }).housekeepNeeded).toBe(true);
  });

  it("reports an empty inbox as zero count with housekeepNeeded false", () => {
    const content = ["# User Inbox", "", "## Atomic", "", "## Backlog", ""].join("\n");

    expect(runInboxState({ content })).toEqual({ routableCount: 0, housekeepNeeded: false });
  });

  it("treats empty content as zero count with housekeepNeeded false", () => {
    expect(runInboxState({ content: "" })).toEqual({ routableCount: 0, housekeepNeeded: false });
  });

  it("does not count malformed entries (H3 with no bold title)", () => {
    const content = [
      "## Atomic",
      "",
      atomicEntry("well-formed"),
      "### just a heading with no bold title",
      "",
      "- orphaned descriptor",
      "",
      "## Backlog",
      "",
    ].join("\n");

    expect(runInboxState({ content }).routableCount).toBe(1);
  });

  it("excludes a held entry (`_Hold:_ `true``) from the routable count", () => {
    const heldEntry = (title: string): string =>
      ["### `[ ]` **" + title + "**", "", "- _Hold:_ `true`", "- _Created:_ `2026-06-01`", "- A retained capture.", ""].join(
        "\n",
      );
    const content = ["## Atomic", "", atomicEntry("pending atomic"), heldEntry("retained atomic"), "## Backlog", ""].join(
      "\n",
    );

    expect(runInboxState({ content }).routableCount).toBe(1);
  });

  it("reports housekeepNeeded false when the only entry is held", () => {
    const content = [
      "## Atomic",
      "",
      ["### `[ ]` **only held**", "", "- _Hold:_ `true`", "- _Created:_ `2026-06-01`", "- Retained.", ""].join("\n"),
      "## Backlog",
      "",
    ].join("\n");

    expect(runInboxState({ content })).toEqual({ routableCount: 0, housekeepNeeded: false });
  });
});
