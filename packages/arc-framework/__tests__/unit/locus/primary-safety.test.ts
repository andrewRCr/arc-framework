/** Directed primary-checkout safety facts. */

import { describe, expect, it } from "vitest";

import { readPrimarySafety } from "../../../src/lib/locus/primary-safety.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { scriptGitExec, type GitExecCall } from "../../helpers/git-exec-fake.js";

function git(options: { status?: string; branch?: string; fail?: "status" | "branch" }): GitExec {
  const response = (fact: "status" | "branch", stdout: string) => ({ options: execOptions }: GitExecCall) => {
    if (execOptions?.cwd !== "/primary") throw new Error("ambient checkout used");
    if (options.fail === fact) throw new Error(`${fact} unavailable`);
    return { stdout, stderr: "" };
  };
  return scriptGitExec([
    { match: { prefix: ["status"] }, responses: [response("status", options.status ?? "")] },
    { match: ["rev-parse", "--abbrev-ref", "HEAD"],
      responses: [response("branch", `${options.branch ?? "main"}\n`)] },
  ]).exec;
}

describe("primary checkout safety", () => {
  it.each([
    { status: "", branch: "main", clean: true, onBase: true },
    { status: " M file\n", branch: "main", clean: false, onBase: true },
    { status: "", branch: "feature", clean: true, onBase: false },
    { status: " M file\n", branch: "feature", clean: false, onBase: false },
    { status: "", branch: "HEAD", clean: true, onBase: false },
  ])("projects clean=$clean and onBase=$onBase", async (scenario) => {
    await expect(readPrimarySafety({
      primaryPath: "/primary",
      baseBranch: "main",
      exec: git(scenario),
    })).resolves.toMatchObject({ kind: "complete", clean: scenario.clean, onBase: scenario.onBase });
  });

  it.each(["status", "branch"] as const)("fails closed when the %s fact is unavailable", async (fail) => {
    await expect(readPrimarySafety({
      primaryPath: "/primary",
      baseBranch: "main",
      exec: git({ fail }),
    })).resolves.toMatchObject({ kind: "error", code: "git-topology-unavailable" });
  });

  it("projects detached HEAD without inventing a branch", async () => {
    await expect(readPrimarySafety({
      primaryPath: "/primary",
      baseBranch: "main",
      exec: git({ branch: "HEAD" }),
    })).resolves.toEqual({ kind: "complete", clean: true, onBase: false, branch: null });
  });

  it("fails closed when the branch read is empty", async () => {
    await expect(readPrimarySafety({
      primaryPath: "/primary",
      baseBranch: "main",
      exec: git({ branch: "" }),
    })).resolves.toMatchObject({ kind: "error", code: "git-topology-unavailable" });
  });

  it("uses the configured base and fails closed when it is missing", async () => {
    await expect(readPrimarySafety({
      primaryPath: "/primary",
      baseBranch: "develop",
      exec: git({ branch: "main" }),
    })).resolves.toMatchObject({ kind: "complete", onBase: false, branch: "main" });
    await expect(readPrimarySafety({
      primaryPath: "/primary",
      baseBranch: "",
      exec: git({}),
    })).resolves.toMatchObject({ kind: "error", code: "git-topology-unavailable" });
  });
});
