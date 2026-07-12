import { describe, expect, it, vi } from "vitest";

import type { ExecResult, GitExec } from "../../../../../src/lib/git/exec.js";
import { createAuthenticatedGitExec } from "../../../../../src/scripts/review-gate/runtime/production-io.js";

const TOKEN = "ghs_narrowreadtoken";
const EXPECTED_HEADER = `http.extraheader=AUTHORIZATION: basic ${Buffer.from(`x-access-token:${TOKEN}`, "utf8").toString("base64")}`;

describe("createAuthenticatedGitExec", () => {
  it("injects the read token as a per-invocation auth header ahead of the git subcommand", async () => {
    const base = vi.fn<GitExec>(async () => ({ stdout: "" }));
    const exec = createAuthenticatedGitExec(TOKEN, base);

    await exec("git", ["fetch", "--no-tags", "origin", "+refs/pull/7/head:local"]);

    expect(base).toHaveBeenCalledWith(
      "git",
      ["-c", EXPECTED_HEADER, "fetch", "--no-tags", "origin", "+refs/pull/7/head:local"],
      undefined,
    );
  });

  it("never passes the raw token in cleartext", async () => {
    const base = vi.fn<GitExec>(async () => ({ stdout: "" }));
    const exec = createAuthenticatedGitExec(TOKEN, base);

    await exec("git", ["rev-parse", "HEAD"]);

    const args = (base.mock.calls[0]?.[1] ?? []) as string[];
    expect(args.join(" ")).not.toContain(TOKEN);
  });

  it("forwards execution options and the base result unchanged", async () => {
    const result: ExecResult = { stdout: "deadbeef\n", stderr: "" };
    const base = vi.fn<GitExec>(async () => result);
    const exec = createAuthenticatedGitExec(TOKEN, base);
    const signal = new AbortController().signal;

    await expect(exec("git", ["merge-base", "a", "b"], { signal })).resolves.toBe(result);
    expect(base).toHaveBeenCalledWith("git", ["-c", EXPECTED_HEADER, "merge-base", "a", "b"], { signal });
  });
});
