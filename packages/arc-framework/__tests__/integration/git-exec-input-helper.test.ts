import { afterEach, describe, expect, it } from "vitest";
import { join } from "node:path";

import { cleanupTempDir, createTempRepo, makeGitExecInput } from "../helpers/integration.js";
import { isGitProcessError } from "../../src/lib/git/process-error.js";

describe("makeGitExecInput", () => {
  let repo: string | undefined;

  afterEach(async () => {
    if (repo) await cleanupTempDir(repo);
  });

  it("honors caller cwd over the bound default", async () => {
    repo = await createTempRepo("arc-git-input-helper-");
    const exec = makeGitExecInput(join(repo, "missing-directory"));
    const hash = await exec(["hash-object", "--stdin"], "payload", { cwd: repo });
    expect(hash.trim()).toMatch(/^[a-f0-9]{40}$/);
  });

  it("normalizes failures and forwards local-only object access", async () => {
    repo = await createTempRepo("arc-git-input-helper-");
    const exec = makeGitExecInput(repo);
    let failure: unknown;
    try {
      await exec(["not-a-git-subcommand"], "", { objectAccess: "local-only" });
    } catch (error) {
      failure = error;
    }
    expect(isGitProcessError(failure)).toBe(true);
    expect(failure).toMatchObject({
      kind: "nonzero-exit", command: "git",
      args: ["--no-lazy-fetch", "not-a-git-subcommand"],
    });
  });
});
