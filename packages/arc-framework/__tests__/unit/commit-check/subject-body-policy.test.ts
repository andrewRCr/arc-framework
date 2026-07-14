/** Unit tests for subject and raw-body commit policy. */

import { describe, expect, it } from "vitest";
import {
  readCommitCheckConfiguration,
  resolveCommitCheckPolicy,
} from "../../../src/lib/commit-check/index.js";
import { parseCommitMessage } from "../../../src/lib/commit-check/parser.js";
import { validateSubjectAndBody } from "../../../src/lib/commit-check/policy.js";

function findings(
  message: string,
  overrides: Readonly<Record<string, string>> = {},
) {
  const resolution = resolveCommitCheckPolicy(readCommitCheckConfiguration(overrides));
  if (resolution.kind !== "active") throw new Error("expected active policy");
  return validateSubjectAndBody(parseCommitMessage(message), resolution.policy);
}

describe("conventional subject policy", () => {
  it("accepts a valid current conventional subject", () => {
    expect(findings("feat(api): add a stable endpoint")).toEqual([]);
  });

  it.each([
    ["unknown(api): add a stable endpoint", "subject.invalid-type"],
    ["feat: add a stable endpoint", "subject.missing-scope"],
    ["feat(API): add a stable endpoint", "subject.invalid-scope"],
    ["feat(api)!: add a stable endpoint", "subject.breaking-not-allowed"],
    ["not conventional", "subject.invalid-format"],
  ])("reports %s with %s", (subject, code) => {
    expect(findings(subject)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code, location: { kind: "message-line", line: 1 } })]),
    );
  });
});

describe("custom subject policy", () => {
  it("rejects an empty custom pattern at its configuration key", () => {
    expect(findings("ticket-1 good", { "commit.format": "custom" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "config.empty-pattern",
          location: { kind: "configuration-key", key: "commit.custom_pattern" },
        }),
      ]),
    );
  });

  it("rejects an invalid ECMAScript pattern", () => {
    expect(
      findings("ticket-1 good", {
        "commit.format": "custom",
        "commit.custom_pattern": "[",
      }),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ code: "config.invalid-pattern" })]));
  });

  it.each(["[[:digit:]]+", "[[.ch.]]", "[[=a=]]"])(
    "rejects POSIX-only pattern source %s with a migration finding",
    (pattern) => {
      expect(
        findings("ticket-1 good", {
          "commit.format": "custom",
          "commit.custom_pattern": pattern,
        }),
      ).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "config.unsupported-pattern-dialect" })]),
      );
    },
  );

  it("distinguishes matching and non-matching custom subjects", () => {
    const config = { "commit.format": "custom", "commit.custom_pattern": "^ticket-[0-9]+ good$" };
    expect(findings("ticket-1 good", config)).toEqual([]);
    expect(findings("ticket-x bad", config)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "subject.custom-mismatch" })]),
    );
  });
});

describe("subject and raw body limits", () => {
  it("disables subject format and length opinions under any mode", () => {
    expect(
      findings("x", { "commit.format": "any", "hooks.subject_max_length": "10" }),
    ).toEqual([]);
  });

  it("counts astral characters as one code point", () => {
    expect(
      findings("feat(x): 😀", { "hooks.subject_max_length": "10" }),
    ).toEqual([]);
    expect(
      findings("feat(x): 😀😀", { "hooks.subject_max_length": "10" }),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ code: "subject.too-long" })]));
  });

  it("counts non-empty lines from physical line three, including trailers", () => {
    const result = findings(
      "feat(api): add a stable endpoint\n\nbody one\n\nContext: standalone (maintenance)\nextra",
      { "hooks.body_max_lines": "2" },
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "body.too-many-lines",
          location: { kind: "message-line", line: 6 },
          detail: expect.objectContaining({ actual: 3, maximum: 2 }),
        }),
      ]),
    );
  });

  it("does not measure physical line two", () => {
    expect(
      findings(`feat(api): add a stable endpoint\n${"x".repeat(20)}`, {
        "hooks.body_max_line_length": "10",
      }),
    ).toEqual([]);
  });

  it("reports overlong prose and trailer lines with code-point lengths", () => {
    const result = findings(
      "feat(api): add a stable endpoint\n\nbody too long\nContext: too long",
      { "hooks.body_max_line_length": "10" },
    );

    expect(result.filter(({ code }) => code === "body.line-too-long")).toMatchObject([
      { location: { kind: "message-line", line: 3 }, detail: { actual: 13, maximum: 10 } },
      { location: { kind: "message-line", line: 4 }, detail: { actual: 17, maximum: 10 } },
    ]);
  });

  it("locates dotted phase references without matching deeper task IDs", () => {
    const result = findings(
      "feat(api): add a stable endpoint\n\nPhase 2.3 is wrong\nPhase 2.3.a is a task",
    );

    expect(result.filter(({ code }) => code === "message.dotted-phase")).toMatchObject([
      { location: { kind: "message-line", line: 3 } },
    ]);
  });
});
