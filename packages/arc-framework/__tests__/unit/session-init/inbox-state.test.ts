/**
 * Unit tests for the inbox-state probe — counting routable (well-formed)
 * USER-INBOX entries and deriving the housekeep-needed flag, so session-init
 * offers housekeep from a machine-resolved signal rather than an agent re-scan.
 */

import { describe, it, expect } from "vitest";

import {
  InboxStateResultSchema,
  runInboxState,
} from "../../../src/lib/session-init/inbox-state.js";

const atomicEntry = (title: string): string =>
  ["### `[ ]` **" + title + "**", "", "- _Created:_ `2026-05-30`", "- A routable atomic capture.", ""].join("\n");

const backlogEntry = (title: string): string =>
  ["### `[ ]` **" + title + "**", "", "- A routable backlog capture.", ""].join("\n");

const executeBoundEntry = (title: string): string =>
  [
    "### `[ ]` **" + title + "**",
    "",
    "- _Disposition:_ `execute-bound`",
    "- _Created:_ `2026-06-01`",
    "- A capture already routed for execution.",
    "",
  ].join("\n");

describe("runInboxState", () => {
  it("counts well-formed entries across the Errand and Work Unit sections", () => {
    const content = [
      "# User Inbox",
      "",
      "## Errand",
      "",
      atomicEntry("first atomic"),
      atomicEntry("second atomic"),
      "## Work Unit",
      "",
      backlogEntry("a backlog item"),
    ].join("\n");

    expect(runInboxState({ content }).routableCount).toBe(3);
  });

  it("sets housekeepNeeded when at least one entry is routable", () => {
    const content = ["## Errand", "", atomicEntry("only entry"), "## Work Unit", ""].join("\n");

    expect(runInboxState({ content }).housekeepNeeded).toBe(true);
  });

  it("reports an empty inbox as zero count with housekeepNeeded false", () => {
    const content = ["# User Inbox", "", "## Errand", "", "## Work Unit", ""].join("\n");

    expect(runInboxState({ content })).toEqual({ routableCount: 0, executeBoundCount: 0, housekeepNeeded: false });
  });

  it("treats empty content as zero count with housekeepNeeded false", () => {
    expect(runInboxState({ content: "" })).toEqual({ routableCount: 0, executeBoundCount: 0, housekeepNeeded: false });
  });

  it("does not count malformed entries (H3 with no bold title)", () => {
    const content = [
      "## Errand",
      "",
      atomicEntry("well-formed"),
      "### just a heading with no bold title",
      "",
      "- orphaned descriptor",
      "",
      "## Work Unit",
      "",
    ].join("\n");

    expect(runInboxState({ content }).routableCount).toBe(1);
  });

  it("excludes a held entry (`_Hold:_ `true``) from the routable count", () => {
    const heldEntry = (title: string): string =>
      ["### `[ ]` **" + title + "**", "", "- _Hold:_ `true`", "- _Created:_ `2026-06-01`", "- A retained capture.", ""].join(
        "\n",
      );
    const content = ["## Errand", "", atomicEntry("pending atomic"), heldEntry("retained atomic"), "## Work Unit", ""].join(
      "\n",
    );

    expect(runInboxState({ content }).routableCount).toBe(1);
  });

  it("reports housekeepNeeded false when the only entry is held", () => {
    const content = [
      "## Errand",
      "",
      ["### `[ ]` **only held**", "", "- _Hold:_ `true`", "- _Created:_ `2026-06-01`", "- Retained.", ""].join("\n"),
      "## Work Unit",
      "",
    ].join("\n");

    expect(runInboxState({ content })).toEqual({ routableCount: 0, executeBoundCount: 0, housekeepNeeded: false });
  });

  it("excludes execute-bound entries while retaining pending entries in a mixed inbox", () => {
    const content = [
      "## Errand",
      "",
      atomicEntry("pending atomic"),
      executeBoundEntry("queued atomic"),
      "## Work Unit",
      "",
      executeBoundEntry("queued backlog item"),
      backlogEntry("pending backlog item"),
    ].join("\n");

    expect(runInboxState({ content })).toEqual({ routableCount: 2, executeBoundCount: 2, housekeepNeeded: true });
  });

  it("reports housekeeping unnecessary when every entry is execute-bound", () => {
    const content = [
      "## Errand",
      "",
      executeBoundEntry("queued atomic"),
      "## Work Unit",
      "",
      executeBoundEntry("queued backlog item"),
    ].join("\n");

    expect(runInboxState({ content })).toEqual({ routableCount: 0, executeBoundCount: 2, housekeepNeeded: false });
  });

  it("keeps a malformed execute-bound disposition routable", () => {
    const malformed = executeBoundEntry("broken queue marker")
      .replace("- _Disposition:_ `execute-bound`", "- _Disposition:_ execute-bound");
    const content = ["## Errand", "", malformed, "## Work Unit", ""].join("\n");

    expect(runInboxState({ content })).toEqual({ routableCount: 1, executeBoundCount: 0, housekeepNeeded: true });
  });
});

describe("InboxStateResultSchema", () => {
  it("accepts the exact producer result", () => {
    expect(InboxStateResultSchema.parse({ routableCount: 2, executeBoundCount: 3, housekeepNeeded: true })).toEqual({
      routableCount: 2,
      executeBoundCount: 3,
      housekeepNeeded: true,
    });
  });

  it.each([-1, 1.5])("rejects an invalid routable count: %s", (routableCount) => {
    expect(InboxStateResultSchema.safeParse({ routableCount, executeBoundCount: 0, housekeepNeeded: false }).success)
      .toBe(false);
  });

  it.each([-1, 1.5])("rejects an invalid execute-bound count: %s", (executeBoundCount) => {
    expect(InboxStateResultSchema.safeParse({ routableCount: 0, executeBoundCount, housekeepNeeded: false }).success)
      .toBe(false);
  });

  it.each([
    { routableCount: 0, executeBoundCount: 1, housekeepNeeded: true },
    { routableCount: 1, executeBoundCount: 0, housekeepNeeded: false },
  ])("rejects an inconsistent count and flag pair", (value) => {
    expect(InboxStateResultSchema.safeParse(value).success).toBe(false);
  });
});
