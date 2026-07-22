/** Canonical housekeeping-plan validation and digesting. */

import { describe, expect, it } from "vitest";

import {
  compileHousekeepPlan,
  executePlanEntries,
  parseHousekeepPlan,
} from "../../../src/lib/housekeep/plan.js";

const digest = `sha256:${"a".repeat(64)}`;

describe("housekeeping plan", () => {
  it("compiles judgment-only dispositions against the current inbox generations", () => {
    const inbox = [
      "# User Inbox",
      "",
      "## Errand",
      "",
      "### `[ ]` **Run now**",
      "",
      "- _Observation:_ Execute this capture.",
      "",
      "## Work Unit",
      "",
      "### `[ ]` **Route later**",
      "",
      "- _Observation:_ Route this capture.",
      "",
      "---",
      "",
    ].join("\n");
    const intent = JSON.stringify({
      version: 1,
      entries: [
        { title: "Run now", disposition: "execute-now" },
        { title: "Route later", disposition: "new-stub", destination: "later", commitment: "provisional" },
      ],
    });

    const compiled = compileHousekeepPlan(intent, inbox);

    expect(compiled.plan.entries).toEqual([
      expect.objectContaining({ title: "Run now", disposition: "execute-now", sourceDigest: expect.stringMatching(/^sha256:/u) }),
      expect.objectContaining({ title: "Route later", disposition: "new-stub", sourceDigest: expect.stringMatching(/^sha256:/u) }),
    ]);
    expect(parseHousekeepPlan(compiled.canonicalJson).digest).toBe(compiled.digest);
  });

  it("refuses intent entries that are absent or already dispatch-bound", () => {
    const inbox = [
      "# User Inbox",
      "",
      "## Errand",
      "",
      "### `[ ]` **Busy**",
      "",
      "- _Disposition:_ `execute-bound`",
      "- _Dispatch:_ `dispatch-1`",
      "- _Observation:_ Already dispatched.",
      "",
      "## Work Unit",
      "",
      "---",
      "",
    ].join("\n");

    expect(() => compileHousekeepPlan(JSON.stringify({
      version: 1,
      entries: [{ title: "Missing", disposition: "dismiss" }],
    }), inbox)).toThrow(/Missing USER-INBOX entry/u);
    expect(() => compileHousekeepPlan(JSON.stringify({
      version: 1,
      entries: [{ title: "Busy", disposition: "execute-now" }],
    }), inbox)).toThrow(/already dispatch-bound/u);
  });

  it("digests equivalent JSON encodings identically while preserving inbox order", () => {
    const compact = `{"version":1,"entries":[{"title":"A","sourceDigest":"${digest}","disposition":"execute-now"}]}`;
    const spaced = JSON.stringify({ entries: [{ disposition: "execute-now", sourceDigest: digest, title: "A" }], version: 1 }, null, 2);
    expect(parseHousekeepPlan(compact).digest).toBe(parseHousekeepPlan(spaced).digest);
    expect(executePlanEntries(parseHousekeepPlan(compact).plan)).toEqual([{ title: "A", sourceDigest: digest }]);
  });

  it("rejects duplicate titles and disposition-illegal fields", () => {
    const duplicate = { version: 1, entries: [
      { title: "A", sourceDigest: digest, disposition: "retain" },
      { title: "A", sourceDigest: digest, disposition: "dismiss" },
    ] };
    expect(() => parseHousekeepPlan(JSON.stringify(duplicate))).toThrow();
    expect(() => parseHousekeepPlan(JSON.stringify({
      version: 1, entries: [{ title: "A", sourceDigest: digest, disposition: "retain", destination: "x" }],
    }))).toThrow();
  });

  it("normalizes CRLF entry evidence through the source digest contract, not JSON encoding", () => {
    const input = JSON.stringify({
      version: 1,
      entries: [{ title: "A", sourceDigest: digest, disposition: "new-stub", destination: "alpha", commitment: "planned" }],
    }).replaceAll("\n", "\r\n");
    expect(parseHousekeepPlan(input).plan.entries[0]).toMatchObject({ disposition: "new-stub", commitment: "planned" });
  });
});
