import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import { createInRepoAbandonRetirementContext } from "../../../src/lib/work-unit/direct-retirement-driver.js";

describe("direct retirement branch resolution", () => {
  it("resolves branch inputs only through the heads namespace", async () => {
    const calls: string[][] = [];
    const head = "a".repeat(40);
    const exec: GitExec = async (_cmd, args) => {
      calls.push(args);
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: "feat/sample\n" };
      if (args[0] === "rev-parse" && args[1] === "--verify") return { stdout: `${head}\n` };
      if (args[0] === "ls-tree") return { stdout: ".arc/active/meta-sample.md\0" };
      throw new Error(`unexpected Git command: ${args.join(" ")}`);
    };
    const context = createInRepoAbandonRetirementContext({
      cwd: "/repo",
      exec,
      readBlob: async () => new TextEncoder().encode("meta"),
      readFile: async () => "",
      createRecord: async () => undefined,
      removeRecord: async () => undefined,
    });

    await expect(context.captureSource({
      name: "sample",
      sourceDir: ".arc/active",
      expectedBranch: "feat/sample",
    })).resolves.toMatchObject({ scope: { source: { branch: "feat/sample", head } } });
    expect(calls).toContainEqual(["rev-parse", "--verify", "refs/heads/feat/sample^{commit}"]);
    expect(calls).not.toContainEqual(["rev-parse", "--verify", "feat/sample^{commit}"]);
  });
});
