/** Unit tests for shared commit-check exemption and advisory context. */

import { describe, expect, it, vi } from "vitest";
import {
  createCommitCheckContext,
  readCommitCheckConfiguration,
} from "../../../src/lib/commit-check/index.js";
import { prepareCommitCheckContext } from "../../../src/lib/commit-check/context.js";

function context(overrides: {
  config?: Readonly<Record<string, string>>;
  mergeInProgress?: boolean;
  role?: string | null;
} = {}) {
  return createCommitCheckContext({
    configuration: readCommitCheckConfiguration(overrides.config ?? {}),
    mergeInProgress: overrides.mergeInProgress ?? false,
    role: overrides.role,
    resolveArtifact: vi.fn().mockResolvedValue("not-found"),
  });
}

describe("prepareCommitCheckContext", () => {
  it("returns a typed disabled outcome before unrelated policy validation", () => {
    const result = prepareCommitCheckContext(
      context({ config: { "hooks.commit_msg": "disabled", "commit.format": "strict" } }),
    );

    expect(result).toEqual({ kind: "outcome", outcome: { kind: "skipped", reason: "disabled" } });
  });

  it("returns a typed merge outcome before unrelated policy validation", () => {
    const result = prepareCommitCheckContext(
      context({ mergeInProgress: true, config: { "hooks.commit_msg": "unknown" } }),
    );

    expect(result).toEqual({
      kind: "outcome",
      outcome: { kind: "skipped", reason: "merge-in-progress" },
    });
  });

  it("returns active unknown hook mode as a configuration failure", () => {
    const result = prepareCommitCheckContext(context({ config: { "hooks.commit_msg": "unknown" } }));

    expect(result).toMatchObject({
      kind: "outcome",
      outcome: {
        kind: "validated",
        verdict: "fail",
        findings: [
          {
            code: "config.invalid-value",
            location: { kind: "configuration-key", key: "hooks.commit_msg" },
          },
        ],
      },
    });
  });

  it("defaults a missing role to maintainer", () => {
    const result = prepareCommitCheckContext(context({ role: null }));

    expect(result).toMatchObject({ kind: "ready", repository: { role: "maintainer" } });
  });

  it("retains contributor role as advisory context", () => {
    const result = prepareCommitCheckContext(context({ role: "contributor" }));

    expect(result).toMatchObject({ kind: "ready", repository: { role: "contributor" } });
  });
});
