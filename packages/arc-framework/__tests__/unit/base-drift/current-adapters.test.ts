import { describe, expect, it, vi } from "vitest";

import { createCompletedMetaResolver } from "../../../src/lib/base-drift/current-adapters.js";
import type { BaseDriftCommitInput, IntegrationEvent } from "../../../src/lib/git/base-drift-types.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const BASE = "b".repeat(40);
const COMMIT = "c".repeat(40);
const PARENT = "a".repeat(40);
const META_PATH = ".arc/completed/2026-q3/01_widget/meta-widget.md";
const meta = (pr: number): string => `# Work Unit\n\n- **PR URL:** https://github.com/o/r/pull/${pr}\n`;

function input(subject: string, acceptedPrNumber?: number): BaseDriftCommitInput {
  return {
    oid: COMMIT,
    parents: [PARENT],
    subject,
    ...(acceptedPrNumber === undefined ? {} : { acceptedPrNumber }),
  };
}

describe("completed-meta integration resolver", () => {
  it("builds the base archive index once and uniquely enriches topology by PR", async () => {
    const exec = vi.fn<GitExec>(async (_cmd, args) => {
      if (args[0] === "ls-tree") return { stdout: `${META_PATH}\n` };
      if (args[0] === "show" && args[1] === `${BASE}:${META_PATH}`) return { stdout: meta(7) };
      if (args[0] === "diff-tree") return { stdout: "" };
      throw new Error(`unexpected: ${args.join(" ")}`);
    });
    const resolver = createCompletedMetaResolver(exec, BASE);
    const event: IntegrationEvent = { commits: [COMMIT], proof: "topology", prNumber: 7 };
    const result = await resolver.enrichTopologyEvent(event, input("merge", 7));
    expect(result).toEqual({
      status: "available",
      value: { slug: "widget", prNumber: 7, prUrl: "https://github.com/o/r/pull/7" },
    });
    await resolver.proveSingleParentEvents([]);
    expect(exec.mock.calls.filter(([, args]) => args[0] === "ls-tree")).toHaveLength(1);
  });

  it("proves a squash only from matching same-commit archive and suffix facts", async () => {
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "ls-tree") return { stdout: "" };
      if (args[0] === "diff-tree") return { stdout: `A\0${META_PATH}\0` };
      if (args[0] === "show") return { stdout: meta(9) };
      throw new Error(`unexpected: ${args.join(" ")}`);
    };
    const resolver = createCompletedMetaResolver(exec, BASE);
    await expect(resolver.proveSingleParentEvents([input("delivery (#9)", 9)])).resolves.toEqual({
      status: "available",
      value: [{
        commits: [COMMIT], slug: "widget", prNumber: 9, prUrl: "https://github.com/o/r/pull/9",
      }],
    });
    await expect(resolver.proveSingleParentEvents([input("delivery (#8)", 8)])).resolves.toEqual({
      status: "available",
      value: [],
    });
  });

  it("surfaces malformed status framing as resolver degradation", async () => {
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "ls-tree") return { stdout: "" };
      if (args[0] === "diff-tree") return { stdout: `A\0${META_PATH}` };
      throw new Error(`unexpected: ${args.join(" ")}`);
    };
    const resolver = createCompletedMetaResolver(exec, BASE);
    await expect(resolver.proveSingleParentEvents([input("delivery (#9)", 9)])).resolves.toEqual({
      status: "partial",
      value: [],
    });
  });
});
