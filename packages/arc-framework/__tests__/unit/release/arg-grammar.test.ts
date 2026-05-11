/**
 * Unit tests for `normalizeReleasePushArgs`.
 *
 * Covers the recognized positional shapes (bare flag list, `<remote>
 * <branch>` pair, `-u <remote> <branch>` triple, `--set-upstream <remote>
 * <branch>` triple), plus pass-through cases (single positional, flag-only,
 * `=value` flag forms) and the mismatch refusal path with payload shape.
 */

import { describe, expect, it } from "vitest";

import { normalizeReleasePushArgs } from "../../../src/lib/release/arg-grammar.js";

const CURRENT = "technical/feature-x";

describe("normalizeReleasePushArgs — pass-through cases", () => {
  it("returns empty args when argv is empty", () => {
    const result = normalizeReleasePushArgs([], CURRENT);
    expect(result).toEqual({ kind: "ok", args: [] });
  });

  it("passes a flag-only argv through unchanged", () => {
    const result = normalizeReleasePushArgs(["--dry-run", "--quiet"], CURRENT);
    expect(result).toEqual({ kind: "ok", args: ["--dry-run", "--quiet"] });
  });

  it("passes through `=value` flag forms unchanged", () => {
    const result = normalizeReleasePushArgs(
      ["--repo=alt-remote", "--receive-pack=/usr/bin/git-receive-pack"],
      CURRENT,
    );
    expect(result).toEqual({
      kind: "ok",
      args: ["--repo=alt-remote", "--receive-pack=/usr/bin/git-receive-pack"],
    });
  });

  it("passes a single trailing positional through (no next positional to pair with)", () => {
    const result = normalizeReleasePushArgs(["-o", "push-option-value"], CURRENT);
    expect(result).toEqual({ kind: "ok", args: ["-o", "push-option-value"] });
  });

  it("consumes the token after `-o` as a push-option value, not a positional", () => {
    const result = normalizeReleasePushArgs(
      ["-o", "ci.skip", "origin", CURRENT],
      CURRENT,
    );
    expect(result).toEqual({ kind: "ok", args: ["-o", "ci.skip"] });
  });

  it("consumes the token after `--push-option` as a push-option value, not a positional", () => {
    const result = normalizeReleasePushArgs(
      ["--push-option", "ci.skip", "origin", CURRENT],
      CURRENT,
    );
    expect(result).toEqual({ kind: "ok", args: ["--push-option", "ci.skip"] });
  });

  it("passes `-u` alone through when no positional pair follows", () => {
    const result = normalizeReleasePushArgs(["-u"], CURRENT);
    expect(result).toEqual({ kind: "ok", args: ["-u"] });
  });

  it("passes `-u` followed by only one positional through unchanged", () => {
    const result = normalizeReleasePushArgs(["-u", "origin"], CURRENT);
    expect(result).toEqual({ kind: "ok", args: ["-u", "origin"] });
  });
});

describe("normalizeReleasePushArgs — matching positional pair", () => {
  it("strips a bare `<remote> <branch>` pair on match", () => {
    const result = normalizeReleasePushArgs(["origin", CURRENT], CURRENT);
    expect(result).toEqual({ kind: "ok", args: [] });
  });

  it("strips a `-u <remote> <branch>` triple but preserves the flag", () => {
    const result = normalizeReleasePushArgs(["-u", "origin", CURRENT], CURRENT);
    expect(result).toEqual({ kind: "ok", args: ["-u"] });
  });

  it("strips a `--set-upstream <remote> <branch>` triple but preserves the flag", () => {
    const result = normalizeReleasePushArgs(
      ["--set-upstream", "origin", CURRENT],
      CURRENT,
    );
    expect(result).toEqual({ kind: "ok", args: ["--set-upstream"] });
  });

  it("strips a matching pair when surrounded by other flags", () => {
    const result = normalizeReleasePushArgs(
      ["--quiet", "origin", CURRENT, "--dry-run"],
      CURRENT,
    );
    expect(result).toEqual({ kind: "ok", args: ["--quiet", "--dry-run"] });
  });
});

describe("normalizeReleasePushArgs — mismatch refusal", () => {
  it("refuses on `<other-remote> <current-branch>`", () => {
    const result = normalizeReleasePushArgs(["upstream", CURRENT], CURRENT);
    expect(result).toEqual({
      kind: "mismatch",
      attempted: { remote: "upstream", branch: CURRENT },
      expected: { remote: "origin", branch: CURRENT },
    });
  });

  it("refuses on `origin <other-branch>`", () => {
    const result = normalizeReleasePushArgs(["origin", "other-branch"], CURRENT);
    expect(result).toEqual({
      kind: "mismatch",
      attempted: { remote: "origin", branch: "other-branch" },
      expected: { remote: "origin", branch: CURRENT },
    });
  });

  it("refuses on `-u origin <other-branch>` — the documented failure mode", () => {
    const result = normalizeReleasePushArgs(
      ["-u", "origin", "other-branch"],
      CURRENT,
    );
    expect(result).toEqual({
      kind: "mismatch",
      attempted: { remote: "origin", branch: "other-branch" },
      expected: { remote: "origin", branch: CURRENT },
    });
  });

  it("refuses on the first mismatch when multiple positional pairs are present", () => {
    const result = normalizeReleasePushArgs(
      ["upstream", "other", "origin", CURRENT],
      CURRENT,
    );
    expect(result).toEqual({
      kind: "mismatch",
      attempted: { remote: "upstream", branch: "other" },
      expected: { remote: "origin", branch: CURRENT },
    });
  });
});
