import { describe, expect, it } from "vitest";

import { PullResultSchema } from "../../../../src/lib/store/sync.js";
import { failedFetchFixture, fetchStateRef } from "../../../helpers/store/ref-failed-fetch.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { bindStoreSyncPort } from "../../../../src/lib/store/operational-sync.js";

const missing = "2".repeat(40);
const remoteOnly = "3".repeat(40);

describe("failed fetch local object facts", () => {
  it("projects a confirmed local transport loss as incomplete with its restore route", async () => {
    const ref = "refs/heads/local-code";
    const f = failedFetchFixture({ refs: [[ref, missing]], missing: [missing] });
    expect(await bindStoreSyncPort(f.store).pull()).toMatchObject({ status: "incomplete",
      condition: expect.stringContaining(ref), remedy: { text: expect.stringMatching(/restore/iu) },
      partial: { pulls: [{ status: "failed", failure: { code: "refused", class: "terminal" } }] },
    });
  });

  it.each([fetchStateRef, "refs/heads/code", "refs/arc/tmp/retained"])("reports a missing tip at %s", async ref => {
    const f = failedFetchFixture({ refs: [[ref, missing]], missing: [missing] });
    const result = success(await f.store.pull());
    expect(result).toMatchObject({ pulls: [{ status: "failed", failure: { code: "refused", class: "terminal",
      condition: expect.stringContaining(ref), remedy: { text: expect.stringMatching(/restore/iu) },
    } }] });
    expect(PullResultSchema.safeParse(result).success).toBe(true);
    expect(f.calls.filter(({ args }) => args[0] === "cat-file")).toHaveLength(1);
  });

  it("reports a detached linked worktree's missing HEAD", async () => {
    const f = failedFetchFixture({ heads: [{ path: "/linked worktree", oid: missing }], missing: [missing] });
    expect(success(await f.store.pull())).toMatchObject({ pulls: [{ status: "failed", failure: {
      code: "refused", condition: expect.stringContaining("worktree /linked worktree HEAD"),
      remedy: { text: expect.stringMatching(/restore/iu) },
    } }] });
  });

  it("confirms a named missing local commit and keeps the original remote error", async () => {
    const stderr = `error: Could not read ${missing}\nremote: fatal: unable to read ${remoteOnly}\n`;
    const f = failedFetchFixture({ stderr, missingCommits: [missing] });
    const outcome = success(await f.store.pull());
    expect(outcome).toMatchObject({ pulls: [{ status: "failed", failure: {
      code: "refused", condition: expect.stringContaining(`fetch commit ${missing}`),
      remedy: { text: expect.stringMatching(/restore/iu) },
    } }] });
    const result = outcome.pulls[0];
    if (result?.status !== "failed") throw new Error("Expected failed fetch");
    expect(result.failure.condition).toContain(stderr);
    expect(f.calls.find(({ args }) => args[0] === "rev-list")?.args).toEqual(["rev-list", "--missing=print", "--all"]);
  });

  it.each(["remote-only", "unnamed-local", "failed-walk", "unborn", "ordinary"] as const)("keeps an unconfirmed %s failure unreachable", async kind => {
    const stderr = kind === "ordinary" || kind === "unborn" ? "fatal: unable to access the remote\n"
      : `remote: fatal: unable to read ${remoteOnly}\n`;
    const f = failedFetchFixture({ stderr, missing: [remoteOnly], missingCommits: kind === "unnamed-local" ? [missing] : [],
      walkFailure: kind === "failed-walk", ...kind === "unborn" ? { heads: [{ path: "/unborn", oid: "0".repeat(40) }] } : {},
    });
    expect(success(await f.store.pull())).toMatchObject({ pulls: [{ status: "failed", failure: {
      code: "unreachable", class: "recoverable", condition: stderr,
      remedy: { text: "Repair remote connectivity or authentication and retry the pull." },
    } }] });
    const query = f.calls.find(({ args }) => args[0] === "cat-file");
    if (kind === "unborn") expect(query?.input).not.toContain("0".repeat(40));
  });

  it.each(["canceled", "deadline"] as const)("skips local loss checks for a %s fetch", async canceled => {
    const f = failedFetchFixture({ canceled, refs: [["refs/heads/broken", missing]], missing: [missing] });
    expect(success(await f.store.pull())).toMatchObject({ pulls: [{ status: "failed", failure: {
      code: "unreachable", cause: canceled === "deadline" ? "timeout" : "error",
    } }] });
    expect(f.calls.filter(({ args }) => args[0] === "cat-file" || args[0] === "worktree" || args[0] === "rev-list")).toEqual([]);
  });

  it("keeps the pull's timeout boundary when the deadline cancels its local-loss probe", async () => {
    const f = failedFetchFixture({ canceledProbe: true });
    expect(success(await f.store.pull())).toMatchObject({ pulls: [{ status: "failed", failure: {
      code: "unreachable", cause: "timeout", condition: expect.stringContaining("pull deadline expired"),
    } }] });
  });

  it.each(["observation", "refs", "worktree", "objects"] as const)("preserves the fetch when the %s probe fails completely", async at => {
    const stderr = `error: Could not read ${missing}\n`;
    const f = failedFetchFixture({ stderr, probeFailure: { at, kind: "completed" } });
    expect(success(await f.store.pull())).toMatchObject({ pulls: [{ status: "failed", failure: {
      code: "unreachable", condition: stderr,
      remedy: { text: "Repair remote connectivity or authentication and retry the pull." },
    } }] });
    expect(f.probeError()).toBeDefined();
  });

  it.each((["observation", "refs", "worktree", "objects", "walk"] as const).flatMap(at =>
    (["canceled", "signaled", "spawn", "untyped"] as const).map(kind => ({ at, kind }))))(
    "propagates $kind from the $at probe", async ({ at, kind }) => {
      const f = failedFetchFixture({ stderr: `error: Could not read ${missing}\n`, probeFailure: { at, kind } });
      const observed: unknown = await f.store.pull().catch(error => error);
      expect(f.probeError()).toBeDefined();
      expect(observed).toBe(f.probeError());
    });

});
