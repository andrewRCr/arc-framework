/** Unit tests for the policy-free commit-message parser. */

import { describe, expect, it } from "vitest";
import { parseCommitMessage } from "../../../src/lib/commit-check/parser.js";

describe("parseCommitMessage", () => {
  it.each([
    ["feature: description", { type: "feature", scope: null, breaking: false }],
    ["feature(api): description", { type: "feature", scope: "api", breaking: false }],
    ["feature(api)!: description", { type: "feature", scope: "api", breaking: true }],
    ["feature!: description", { type: "feature", scope: null, breaking: true }],
  ])("parses conventional syntax without applying policy: %s", (subject, expected) => {
    expect(parseCommitMessage(subject).subject).toMatchObject({
      raw: subject,
      description: "description",
      ...expected,
    });
  });

  it("separates the final trailer block from body prose", () => {
    const parsed = parseCommitMessage(
      "feature(api): description\n\nBody prose.\n\nTrace: one\nContext: standalone (maintenance)\n",
    );

    expect(parsed.bodyLines.map((line) => line.text)).toEqual(["", "Body prose.", ""]);
    expect(parsed.trailers).toEqual([
      { key: "Trace", value: "one", line: 5 },
      { key: "Context", value: "standalone (maintenance)", line: 6 },
    ]);
  });

  it("folds continuation lines into the preceding trailer value", () => {
    const parsed = parseCommitMessage(
      "feature(api): description\n\nContext: tasks-example.md\n  (Task 1.2)\n",
    );

    expect(parsed.trailers).toEqual([
      { key: "Context", value: "tasks-example.md (Task 1.2)", line: 3 },
    ]);
  });

  it("selects the last repeated Context trailer", () => {
    const parsed = parseCommitMessage(
      "feature(api): description\n\nContext: first\nContext: second\n",
    );

    expect(parsed.contextTrailer).toEqual({ key: "Context", value: "second", line: 4 });
  });

  it("does not treat a Context-shaped body line as the final trailer", () => {
    const parsed = parseCommitMessage(
      "feature(api): description\n\nContext: body-shaped\nBody prose follows.\n",
    );

    expect(parsed.trailers).toEqual([]);
    expect(parsed.contextTrailer).toBeNull();
  });
});
