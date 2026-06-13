/**
 * Unit tests for the `gh`-backed work-unit PR source — the mergeable-sharpening
 * tier's live PR adapter. Parses one `gh pr list --json` call into per-branch
 * disposition facts; a `gh` failure (missing / unauthenticated / unreachable)
 * propagates so the composer degrades to the presence tier.
 */

import { describe, it, expect, vi } from "vitest";

import { createGhWorkUnitPrSource } from "../../../src/lib/session-init/work-unit-pr-source.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

interface FakePr {
  headRefName: string;
  state: string;
  reviewDecision: string;
  statusCheckRollup: unknown[];
}

const pr = (over: Partial<FakePr> = {}): FakePr => ({
  headRefName: "feat/widget",
  state: "OPEN",
  reviewDecision: "REVIEW_REQUIRED",
  statusCheckRollup: [],
  ...over,
});

/** Mock exec: `gh pr list` returns the supplied PRs as JSON; failRun rejects. */
function buildExec(options: { prs?: FakePr[]; failRun?: Error } = {}): GitExec {
  return vi.fn(async (cmd: string, args: string[]) => {
    if (cmd !== "gh") throw new Error(`unexpected command: ${cmd}`);
    if (args[0] === "pr" && args[1] === "list") {
      if (options.failRun !== undefined) throw options.failRun;
      return { stdout: JSON.stringify(options.prs ?? []), stderr: "" };
    }
    throw new Error(`unexpected gh ${args.join(" ")}`);
  });
}

const lastExecOptions = (exec: GitExec): { signal?: AbortSignal } | undefined =>
  (vi.mocked(exec).mock.calls.at(-1)?.[2]) as { signal?: AbortSignal } | undefined;

describe("createGhWorkUnitPrSource", () => {
  it("maps an approved, green open PR to mergeable-shaped facts", async () => {
    const source = createGhWorkUnitPrSource(buildExec({ prs: [pr({ reviewDecision: "APPROVED" })] }));

    const result = await source(["feat/widget"]);

    expect(result.get("feat/widget")).toEqual({
      merged: false,
      hasOpenPr: true,
      approved: true,
      changesRequested: false,
      checksFailed: false,
    });
  });

  it("maps a changes-requested PR to changesRequested facts", async () => {
    const source = createGhWorkUnitPrSource(
      buildExec({ prs: [pr({ reviewDecision: "CHANGES_REQUESTED" })] }),
    );

    expect((await source(["feat/widget"])).get("feat/widget")).toMatchObject({
      changesRequested: true,
      approved: false,
    });
  });

  it("flags checksFailed from a failing statusCheckRollup entry (CheckRun conclusion)", async () => {
    const source = createGhWorkUnitPrSource(
      buildExec({
        prs: [pr({ reviewDecision: "APPROVED", statusCheckRollup: [{ conclusion: "FAILURE" }] })],
      }),
    );

    expect((await source(["feat/widget"])).get("feat/widget")).toMatchObject({
      approved: true,
      checksFailed: true,
    });
  });

  it("flags checksFailed from a failing StatusContext state", async () => {
    const source = createGhWorkUnitPrSource(
      buildExec({ prs: [pr({ statusCheckRollup: [{ state: "ERROR" }] })] }),
    );

    expect((await source(["feat/widget"])).get("feat/widget")?.checksFailed).toBe(true);
  });

  it("maps a merged PR to merged facts", async () => {
    const source = createGhWorkUnitPrSource(buildExec({ prs: [pr({ state: "MERGED" })] }));

    expect((await source(["feat/widget"])).get("feat/widget")).toMatchObject({
      merged: true,
      hasOpenPr: false,
    });
  });

  it("only returns facts for requested branches", async () => {
    const source = createGhWorkUnitPrSource(
      buildExec({ prs: [pr({ headRefName: "feat/widget" }), pr({ headRefName: "feat/other" })] }),
    );

    const result = await source(["feat/widget"]);

    expect([...result.keys()]).toEqual(["feat/widget"]);
  });

  it("does not invoke gh for an empty branch set", async () => {
    const exec = buildExec();
    const source = createGhWorkUnitPrSource(exec);

    expect((await source([])).size).toBe(0);
    expect(exec).not.toHaveBeenCalled();
  });

  it("propagates a gh failure so the composer can degrade to presence", async () => {
    const enoent = Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" });
    const source = createGhWorkUnitPrSource(buildExec({ failRun: enoent }));

    await expect(source(["feat/widget"])).rejects.toThrow(/ENOENT/);
  });

  it("bounds the gh call with an abort signal so session-init is never blocked", async () => {
    const exec = buildExec({ prs: [pr()] });
    const source = createGhWorkUnitPrSource(exec);

    await source(["feat/widget"]);

    expect(lastExecOptions(exec)?.signal).toBeInstanceOf(AbortSignal);
  });
});
