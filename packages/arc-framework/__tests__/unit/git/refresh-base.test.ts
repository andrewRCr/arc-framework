import { describe, it, expect } from "vitest";

import { refreshBase } from "../../../src/lib/git/refresh-base.js";
import type { ExecResult } from "../../../src/lib/git/index.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

const OK: ExecResult = { stdout: "", stderr: "" };

/**
 * Build a GitExec that returns `OK` for every call, except commands whose
 * first two args match a `fail` entry, which reject — the pattern for exercising
 * `refreshBase`'s best-effort fallback per failing leg.
 */
function execWith(fail: string[][] = []): ReturnType<typeof scriptGitExec> {
  return scriptGitExec([{
    match: { predicate: () => true },
    responses: [({ args }) => fail.some((f) => f[0] === args[0] && f[1] === args[1])
      ? { failure: { exitCode: 128, stderr: `git ${args.join(" ")} failed` } }
      : OK],
  }]);
}

describe("refreshBase", () => {
  it("fetches the remote base and returns the remote-tracking ref on success", async () => {
    const { exec, calls } = execWith();
    const ref = await refreshBase(exec, "main");
    expect(ref).toBe("origin/main");
    expect(calls.map(({ args }) => args)).toContainEqual(["fetch", "origin", "main"]);
    expect(calls.map(({ args }) => args)).toContainEqual(["rev-parse", "--verify", "--quiet", "origin/main"]);
  });

  it("honors a custom remote", async () => {
    const { exec } = execWith();
    expect(await refreshBase(exec, "trunk", "upstream")).toBe("upstream/trunk");
  });

  it("falls back to the local base when the fetch fails (offline / no remote)", async () => {
    const { exec } = execWith([["fetch", "origin"]]);
    expect(await refreshBase(exec, "main")).toBe("main");
  });

  it("falls back to the local base when the remote base ref is unresolvable", async () => {
    const { exec } = execWith([["rev-parse", "--verify"]]);
    expect(await refreshBase(exec, "main")).toBe("main");
  });
});
