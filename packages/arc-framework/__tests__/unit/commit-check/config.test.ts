/** Unit tests for commit-check configuration resolution. */

import { describe, expect, it } from "vitest";
import {
  COMMIT_CHECK_DEFAULTS,
  readCommitCheckConfiguration,
  resolveCommitCheckPolicy,
} from "../../../src/lib/commit-check/index.js";

describe("readCommitCheckConfiguration", () => {
  it("preserves all eight explicit values", () => {
    const configuration = readCommitCheckConfiguration({
      "hooks.commit_msg": "enabled",
      "commit.format": "custom",
      "commit.context_footer": "custom",
      "commit.custom_pattern": "^subject$",
      "commit.context_pattern": "^Trace: ",
      "hooks.subject_max_length": "80",
      "hooks.body_max_lines": "120",
      "hooks.body_max_line_length": "110",
    });

    expect(configuration).toEqual({
      "hooks.commit_msg": "enabled",
      "commit.format": "custom",
      "commit.context_footer": "custom",
      "commit.custom_pattern": "^subject$",
      "commit.context_pattern": "^Trace: ",
      "hooks.subject_max_length": "80",
      "hooks.body_max_lines": "120",
      "hooks.body_max_line_length": "110",
    });
  });

  it("uses Bash defaults only for absent values", () => {
    expect(readCommitCheckConfiguration({})).toEqual(COMMIT_CHECK_DEFAULTS);
    expect(readCommitCheckConfiguration({ "commit.custom_pattern": "" })["commit.custom_pattern"]).toBe("");
  });
});

describe("resolveCommitCheckPolicy", () => {
  it("parses quoted-normalized numeric values", () => {
    const result = resolveCommitCheckPolicy(
      readCommitCheckConfiguration({
        "hooks.subject_max_length": "80",
        "hooks.body_max_lines": "120",
        "hooks.body_max_line_length": "110",
      }),
    );

    expect(result).toMatchObject({
      kind: "active",
      policy: { subjectMaxLength: 80, bodyMaxLines: 120, bodyMaxLineLength: 110 },
    });
  });

  it.each([
    ["hooks.commit_msg", "sometimes"],
    ["commit.format", "strict"],
    ["commit.context_footer", "optional"],
  ] as const)("rejects unknown %s values", (key, value) => {
    const result = resolveCommitCheckPolicy(readCommitCheckConfiguration({ [key]: value }));

    expect(result).toMatchObject({
      kind: "invalid",
      findings: [{ code: "config.invalid-value", location: { kind: "configuration-key", key } }],
    });
  });

  it.each([
    ["hooks.subject_max_length", "+10"],
    ["hooks.subject_max_length", "0x10"],
    ["hooks.subject_max_length", "9007199254740992"],
    ["hooks.subject_max_length", "9"],
    ["hooks.body_max_lines", "0"],
    ["hooks.body_max_line_length", "-1"],
  ] as const)("rejects out-of-domain %s value %s", (key, value) => {
    const result = resolveCommitCheckPolicy(readCommitCheckConfiguration({ [key]: value }));

    expect(result).toMatchObject({
      kind: "invalid",
      findings: [{ code: "config.invalid-number", location: { kind: "configuration-key", key } }],
    });
  });

  it("returns every independent configuration finding", () => {
    const result = resolveCommitCheckPolicy(
      readCommitCheckConfiguration({
        "commit.format": "strict",
        "commit.context_footer": "optional",
        "hooks.subject_max_length": "nine",
      }),
    );

    expect(result).toMatchObject({ kind: "invalid" });
    if (result.kind !== "invalid") throw new Error("expected invalid configuration");
    expect(result.findings.map(({ code, location }) => ({ code, location }))).toEqual([
      {
        code: "config.invalid-value",
        location: { kind: "configuration-key", key: "commit.format" },
      },
      {
        code: "config.invalid-value",
        location: { kind: "configuration-key", key: "commit.context_footer" },
      },
      {
        code: "config.invalid-number",
        location: { kind: "configuration-key", key: "hooks.subject_max_length" },
      },
    ]);
  });

  it("returns disabled before unrelated policy-domain failures", () => {
    const result = resolveCommitCheckPolicy(
      readCommitCheckConfiguration({
        "hooks.commit_msg": "disabled",
        "commit.format": "strict",
        "hooks.subject_max_length": "invalid",
      }),
    );

    expect(result).toEqual({ kind: "disabled" });
  });
});
