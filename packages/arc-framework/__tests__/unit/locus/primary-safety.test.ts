/** Directed primary-checkout safety facts. */

import { describe, expect, it } from "vitest";

import { readPrimarySafety } from "../../../src/lib/locus/primary-safety.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

function git(options: { status?: string; branch?: string; fail?: "status" | "branch" }): GitExec {
  return async (_command, args, execOptions) => {
    if (execOptions?.cwd !== "/primary") throw new Error("ambient checkout used");
    if (args[0] === "status") {
      if (options.fail === "status") throw new Error("status unavailable");
      return { stdout: options.status ?? "", stderr: "" };
    }
    if (options.fail === "branch") throw new Error("branch unavailable");
    return { stdout: `${options.branch ?? "main"}\n`, stderr: "" };
  };
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
