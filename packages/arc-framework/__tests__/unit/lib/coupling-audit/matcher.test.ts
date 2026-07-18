import { describe, expect, it } from "vitest";

import { findPatternMatches, findPatternSetMatches } from "../../../../src/lib/coupling-audit/matcher.js";

describe("coupling-audit matcher", () => {
  it("finds repeated literal matches with Unicode-aware locations", () => {
    const matches = findPatternMatches("😀 meta-x\nmeta-y", {
      id: "meta-prefix",
      form: "literal",
      value: "meta-",
      caseSensitive: true,
    });
    expect(matches.map(({ line, column, endColumn, token }) => ({ line, column, endColumn, token }))).toEqual([
      { line: 1, column: 3, endColumn: 8, token: "meta-" },
      { line: 2, column: 1, endColumn: 6, token: "meta-" },
    ]);
  });

  it("lets the engine own global regex iteration", () => {
    const matches = findPatternMatches("ACTIVE/ active/", {
      id: "active-path",
      form: "regex",
      value: "active/",
      flags: "iu",
    });
    expect(matches.map((match) => match.token)).toEqual(["ACTIVE/", "active/"]);
  });

  it("represents multi-line spans with separate end locations", () => {
    const [match] = findPatternMatches("start\nend", {
      id: "multi-line",
      form: "regex",
      value: "start\\nend",
      flags: "u",
    });
    expect(match).toMatchObject({ line: 1, column: 1, endLine: 2, endColumn: 4 });
  });

  it("retains overlapping evidence from different patterns", () => {
    const matches = findPatternSetMatches("backlog/planned/item", [
      { id: "backlog", form: "literal", value: "backlog/", caseSensitive: true },
      { id: "planned", form: "literal", value: "backlog/planned/", caseSensitive: true },
    ]);
    expect(matches.map((match) => [match.patternId, match.start, match.end])).toEqual([
      ["backlog", 0, 8],
      ["planned", 0, 16],
    ]);
  });

  it("rejects empty-string regexes at execution time", () => {
    expect(() => findPatternMatches("value", { id: "bad", form: "regex", value: ".*", flags: "u" })).toThrow(
      "must not match the empty string",
    );
  });
});
